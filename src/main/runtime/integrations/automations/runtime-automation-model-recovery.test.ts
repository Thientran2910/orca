import { expect, it } from 'vitest'
import type {
  Automation,
  AutomationBotTarget
} from '../../../../shared/automations/automation-definition'
import type { AutomationRun } from '../../../../shared/automations/history/automation-run'
import {
  automationModelRecoveryTarget,
  type AutomationModelRecoveryInput
} from '../../../../shared/automations/history/automation-model-recovery'
import { automationRunModelUnavailable } from '../../../../shared/automations/history/automation-run-model-failure'
import type { FolderWorkspace } from '../../../../shared/folder-workspaces/folder-workspace-types'
import { getDefaultPersistedState } from '../../../../shared/orca-profiles/constants'
import { FolderWorkspacePersistenceOperations } from '../../../persistence/restoring-sessions/folder-workspace-operations'
import { makeTestBot } from '../../../bots/bot.test-fixture'
import {
  readAutomationRecoveryModel,
  recoverAutomationModel
} from './runtime-automation-model-recovery'

type RecoveryOptions = {
  run?: Partial<AutomationRun>
  target?: Partial<AutomationBotTarget>
  destinationBeforeHandler?: AutomationBotTarget['resultsTo']
  folderMoveBeforeHandler?: string
  settingsModel?: string
  input?: Partial<AutomationModelRecoveryInput>
  refuseRerun?: boolean
}

function beginRecovery(options: RecoveryOptions = {}) {
  let automation: Automation = {
    id: 'automation',
    name: 'Sample automation',
    prompt: 'Summarize sample notes',
    precheck: null,
    agentId: 'codex',
    bot: { botId: 'bot-1', runsIn: 'new', resultsTo: 'none', ...options.target },
    projectId: '',
    executionTargetType: 'local',
    executionTargetId: 'local',
    schedulerOwner: 'local_host_service',
    workspaceMode: 'existing',
    workspaceId: null,
    baseBranch: null,
    reuseSession: false,
    timezone: 'UTC',
    rrule: 'FREQ=DAILY',
    dtstart: 1,
    enabled: true,
    nextRunAt: 2,
    missedRunPolicy: 'run_once_within_grace',
    missedRunGraceMinutes: 30,
    createdAt: 1,
    updatedAt: 1
  }
  const failed: AutomationRun = {
    id: 'failed',
    automationId: automation.id,
    title: 'Sample automation',
    status: 'dispatch_failed',
    trigger: 'manual',
    workspaceId: null,
    sessionKind: 'chat',
    chatSessionId: null,
    terminalSessionId: null,
    terminalPaneKey: null,
    terminalPtyId: null,
    outputSnapshot: null,
    precheckResult: null,
    usage: null,
    error: 'Model unavailable',
    errorCode: 'agentModelUnavailable',
    errorParams: { agent: 'codex', model: 'old-model' },
    scheduledFor: 1,
    startedAt: null,
    dispatchedAt: null,
    createdAt: 1,
    ...options.run
  }
  const folder: FolderWorkspace = {
    id: 'w1',
    projectGroupId: 'sample-group',
    name: 'Sample folder',
    folderPath: '/fixture/sample',
    linkedTask: null,
    comment: '',
    isArchived: false,
    isUnread: false,
    isPinned: false,
    sortOrder: 0,
    lastActivityAt: 1,
    createdAt: 1,
    updatedAt: 1
  }
  const persisted = Promise.withResolvers<void>()
  const pending = new Set<string>()
  const bot = makeTestBot(
    options.settingsModel ? {} : { launch: { model: 'old-model', options: { effort: 'high' } } }
  )
  const expectedTarget = automationModelRecoveryTarget(automation.bot!, bot, folder.folderPath)
  const folders = new FolderWorkspacePersistenceOperations({
    state: { ...getDefaultPersistedState('/fixture'), folderWorkspaces: [folder] },
    scheduleSave() {},
    removeWorkspaceLineageForRemovedFolder() {},
    pruneMobileClientTabSelections() {},
    hydrateRepo: (repo) => repo
  })
  const getSettings = () => ({
    botsEnabled: true,
    ...(options.settingsModel
      ? { agentLaunchChoices: { codex: { model: options.settingsModel } } }
      : {})
  })
  if (options.folderMoveBeforeHandler) {
    folders.updateFolderWorkspace(folder.id, { folderPath: options.folderMoveBeforeHandler })
  }
  if (options.destinationBeforeHandler) {
    automation = {
      ...automation,
      bot: { ...automation.bot!, resultsTo: options.destinationBeforeHandler }
    }
  }
  const recover = () =>
    recoverAutomationModel(
      pending,
      { assertOwner: () => {}, show: () => automation, listRuns: () => [failed] },
      {
        getSettings,
        getBots: () => [bot],
        getFolderWorkspaces: () => folders.getFolderWorkspaces(),
        updateAutomation: (_id, { bot, agentId }) =>
          (automation = { ...automation, bot, agentId: agentId ?? automation.agentId }),
        flushPendingOrThrowAsync: () => persisted.promise
      },
      {
        runNow: async () => {
          if (options.refuseRerun) {
            throw new Error('Queue acknowledgement lost')
          }
          return { ...failed, id: 'queued', status: 'pending' }
        }
      },
      { id: 'automation', runId: 'failed', expectedTarget, model: 'replacement', ...options.input }
    )

  return {
    recovery: recover(),
    recover,
    readModel: () =>
      readAutomationRecoveryModel({ getSettings, getBots: () => [bot] }, automation.bot),
    moveFolder: (path: string) => {
      folders.updateFolderWorkspace(folder.id, { folderPath: path })
      persisted.resolve()
    },
    acceptSave: persisted.resolve,
    rejectSave: persisted.reject,
    get target() {
      return automation.bot
    },
    editTarget: (bot: AutomationBotTarget) => {
      automation = { ...automation, bot }
      persisted.resolve()
    }
  }
}

it('refuses a same-ID folder move made before the handler and preserves a move made during the save', async () => {
  const before = beginRecovery({ folderMoveBeforeHandler: '/fixture/moved' })
  before.acceptSave()
  await expect(before.recovery).resolves.toEqual({ status: 'changed' })
  expect(before.target?.agentSetup).toBeUndefined()

  const during = beginRecovery()
  during.moveFolder('/fixture/moved')
  await expect(during.recovery).resolves.toEqual({ status: 'saved', rerun: 'skipped' })
  expect(during.target?.agentSetup?.launch?.model).toBe('replacement')
})

it('shows the owner Settings model, refuses the same choice and queues a different one', async () => {
  const same = beginRecovery({
    settingsModel: 'settings-model',
    input: { model: 'settings-model' }
  })
  expect(same.readModel()).toBe('settings-model')
  same.acceptSave()
  await expect(same.recovery).resolves.toEqual({ status: 'changed' })
  expect(same.target?.agentSetup).toBeUndefined()

  const different = beginRecovery({ settingsModel: 'settings-model' })
  different.acceptSave()
  await expect(different.recovery).resolves.toEqual({ status: 'queued', runId: 'queued' })
  expect(different.readModel()).toBe('replacement')
})

it('preserves an intervening destination edit and skips delivery after saving the model', async () => {
  const pending = beginRecovery()
  pending.editTarget({ ...pending.target!, resultsTo: 'chat' })

  await expect(pending.recovery).resolves.toEqual({ status: 'saved', rerun: 'skipped' })
  expect(pending.target).toEqual({
    botId: 'bot-1',
    runsIn: 'new',
    resultsTo: 'chat',
    agentSetup: { agent: 'codex', launch: { model: 'replacement', options: { effort: 'high' } } }
  })
})

it('rejects a destination edit before the recovery handler reads the automation', async () => {
  const pending = beginRecovery({ destinationBeforeHandler: { channel: 'sample-channel' } })
  pending.acceptSave()

  await expect(pending.recovery).resolves.toEqual({ status: 'changed' })
  expect(pending.target).toEqual({
    botId: 'bot-1',
    runsIn: 'new',
    resultsTo: { channel: 'sample-channel' }
  })
})

const invalidRecoveries: (RecoveryOptions & { description: string })[] = [
  { description: 'an unclassified run', run: { errorCode: undefined } },
  { description: 'a completed run', run: { status: 'completed' } },
  { description: 'a chat destination', target: { runsIn: 'chat' } },
  {
    description: 'the current saved model after a different model failed',
    run: { errorParams: { agent: 'codex', model: 'previous-model' } },
    input: { model: 'old-model' }
  },
  {
    description: 'a different agent',
    run: { errorParams: { agent: 'claude', model: 'old-model' } }
  },
  { description: 'the failed model', input: { model: 'old-model' } },
  {
    description: 'a failed model with a bounded history ID',
    run: { errorParams: { agent: 'codex', model: 'x'.repeat(120) } },
    input: { model: 'x'.repeat(130) }
  }
]

it.each(invalidRecoveries)(
  'leaves the automation unchanged when recovering $description',
  async (options) => {
    const pending = beginRecovery(options)
    pending.acceptSave()

    await expect(pending.recovery).resolves.toEqual({ status: 'changed' })
    expect(pending.target?.agentSetup).toBeUndefined()
  }
)

it('prevents another recovery during an unacknowledged write', async () => {
  const pending = beginRecovery()
  await expect(pending.recover()).resolves.toEqual({ status: 'busy' })

  pending.rejectSave(new Error('Write acknowledgement lost'))
  await expect(pending.recovery).resolves.toEqual({ status: 'unconfirmed' })
})

it('distinguishes model IDs that have the same bounded history text', async () => {
  const failedModel = `${'x'.repeat(120)}-failed`
  const alternative = `${'x'.repeat(120)}-alternative`
  const run = automationRunModelUnavailable({
    agent: 'codex',
    model: failedModel,
    launchModel: failedModel
  })
  const same = beginRecovery({ run, input: { model: failedModel } })
  const different = beginRecovery({ run, input: { model: alternative } })
  same.acceptSave()
  different.acceptSave()

  await expect(same.recovery).resolves.toEqual({ status: 'changed' })
  await expect(different.recovery).resolves.toEqual({ status: 'queued', runId: 'queued' })
  expect(different.target?.agentSetup?.launch?.model).toBe(alternative)
})

it('reports an uncertain queue acknowledgement and retains the saved model', async () => {
  const pending = beginRecovery({ refuseRerun: true })
  pending.acceptSave()

  await expect(pending.recovery).resolves.toEqual({ status: 'saved', rerun: 'unconfirmed' })
  expect(pending.target?.agentSetup?.launch?.model).toBe('replacement')
})

it('admits a rerun with a newer model saved for the same destination', async () => {
  const pending = beginRecovery()
  pending.editTarget({
    ...pending.target!,
    agentSetup: { agent: 'codex', launch: { model: 'newer-model', options: { effort: 'high' } } }
  })

  await expect(pending.recovery).resolves.toEqual({
    status: 'queued',
    runId: 'queued',
    newerModel: true
  })
  expect(pending.target?.agentSetup?.launch?.model).toBe('newer-model')
})
