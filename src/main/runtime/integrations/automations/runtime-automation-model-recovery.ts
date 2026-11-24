import type { AutomationBotTarget } from '../../../../shared/automations/automation-definition'
import {
  automationModelRecoveryTarget,
  type AutomationModelRecoveryInput,
  type AutomationModelRecoveryResult
} from '../../../../shared/automations/history/automation-model-recovery'
import type { AutomationOwnerPrecondition } from '../../../../shared/automations/ownership/automation-owner-precondition'
import { isFailedAutomationRunModel } from '../../../../shared/automations/history/automation-run-model-failure'
import { BotLaunchSchema } from '../../../../shared/bots/bot-launch'
import { botAutomationSetup } from '../../../../shared/bots/bot-agent-setup'
import { resolveBotAutomationRunTarget } from '../../../automations/bot-run-target'
import { botBackgroundStartOptions, type BotLaunchSettings } from '../../../bots/bot-start-options'
import type { AutomationService } from '../../../automations/automation-service'
import type { RuntimeStore } from '../../construction/runtime-store-contract'
import type { RuntimeAutomationController } from './runtime-automation-controller'

type RecoveryStore = Pick<
  RuntimeStore,
  'getFolderWorkspaces' | 'getBots' | 'updateAutomation' | 'flushPendingOrThrowAsync'
> & { getSettings: () => NonNullable<BotLaunchSettings> & { botsEnabled?: boolean } }

export function readAutomationRecoveryModel(
  store: Pick<RecoveryStore, 'getBots' | 'getSettings'>,
  target?: AutomationBotTarget
): string | null {
  const bot =
    target?.runsIn === 'new' && store.getBots?.().find((entry) => entry.id === target.botId)
  return bot && target
    ? (botBackgroundStartOptions(store.getSettings(), botAutomationSetup(target, bot)).model ??
        null)
    : null
}

export async function recoverAutomationModel(
  pending: Set<string>,
  controller: Pick<RuntimeAutomationController, 'assertOwner' | 'show' | 'listRuns'>,
  store: RecoveryStore | null,
  service: Pick<AutomationService, 'runNow'> | null,
  { id, runId, expectedTarget, model }: AutomationModelRecoveryInput,
  expectedOwner?: AutomationOwnerPrecondition
): Promise<AutomationModelRecoveryResult> {
  if (pending.has(id)) {
    return { status: 'busy' }
  }
  pending.add(id)
  try {
    const getFolders = store?.getFolderWorkspaces?.bind(store)
    const flush = store?.flushPendingOrThrowAsync?.bind(store)
    if (!store?.updateAutomation || !getFolders || !flush || !service) {
      throw new Error('runtime_unavailable')
    }
    const resolve = (target: AutomationBotTarget) =>
      resolveBotAutomationRunTarget(
        {
          getSettings: () => store.getSettings(),
          getBots: () => store.getBots?.() ?? [],
          getFolderWorkspaces: getFolders
        },
        target
      )

    controller.assertOwner(id, expectedOwner, 'mutate')
    const target = controller.show(id).bot
    const failed = controller.listRuns(id).find((run) => run.id === runId)
    if (
      target?.runsIn !== 'new' ||
      failed?.status !== 'dispatch_failed' ||
      failed.errorCode !== 'agentModelUnavailable' ||
      isFailedAutomationRunModel(model, failed.errorParams)
    ) {
      return { status: 'changed' }
    }
    const resolved = resolve(target)
    if (
      !resolved.ok ||
      failed.errorParams?.agent !== resolved.bot.agent ||
      automationModelRecoveryTarget(target, resolved.bot, resolved.cwd) !== expectedTarget
    ) {
      return { status: 'changed' }
    }
    const { model: effectiveModel, ...options } = botBackgroundStartOptions(
      store.getSettings(),
      resolved.bot
    )
    if (effectiveModel === model) {
      return { status: 'changed' }
    }
    // An explicit Settings model owns its options. Options without a model can apply to the new choice.
    const keptOptions = effectiveModel
      ? resolved.bot.launch?.options
      : { ...options, ...resolved.bot.launch?.options }
    const launch = BotLaunchSchema.parse({
      model,
      ...(keptOptions && Object.keys(keptOptions).length > 0 ? { options: keptOptions } : {})
    })
    const bot = { ...target, agentSetup: { agent: resolved.bot.agent, launch } }
    const expectedSavedTarget = automationModelRecoveryTarget(bot, resolved.bot, resolved.cwd)
    // Keep the read and write synchronous so the other bot settings come from the same record.
    store.updateAutomation(id, { bot, agentId: resolved.bot.agent }, { expectedOwner })
    try {
      await flush({ drainToStableGeneration: false })
    } catch {
      return { status: 'unconfirmed' }
    }

    let newerModel: boolean
    try {
      controller.assertOwner(id, expectedOwner, 'execute')
      const current = controller.show(id).bot
      if (!current || current.runsIn !== 'new') {
        return { status: 'saved', rerun: 'skipped' }
      }
      const runTarget = resolve(current)
      if (
        !runTarget.ok ||
        automationModelRecoveryTarget(current, runTarget.bot, runTarget.cwd) !== expectedSavedTarget
      ) {
        return { status: 'saved', rerun: 'skipped' }
      }
      newerModel = botBackgroundStartOptions(store.getSettings(), runTarget.bot).model !== model
    } catch {
      return { status: 'saved', rerun: 'skipped' }
    }

    try {
      const run = await service.runNow(id)
      return { status: 'queued', runId: run.id, ...(newerModel ? { newerModel: true } : {}) }
    } catch {
      return { status: 'saved', rerun: 'unconfirmed' }
    }
  } finally {
    pending.delete(id)
  }
}
