import { useLayoutEffect, useRef } from 'react'
import { useAppStore } from '@/store'
import type { Bot } from '../../../../../shared/bot-types'
import { newChatPermissionModeForSettings } from '../../../../../shared/agent-launch/permissions/agent-chat-permission-mode'
import {
  automationModelRecoverySetupFingerprint,
  automationModelRecoveryTarget
} from '../../../../../shared/automations/history/automation-model-recovery'
import { isFailedAutomationRunModel } from '../../../../../shared/automations/history/automation-run-model-failure'
import { ownerKey } from '../../../../../shared/automations/ownership/automation-owner-key'
import { folderWorkspaceKey } from '../../../../../shared/workspace/identity/workspace-scope'
import { automationRowHostId } from '../automations-page-navigation'
import {
  automationActionAvailability,
  capturedAutomationOwner
} from '../hosts/automation-captured-owner'
import { recoverOwnedAutomationModel } from '../hosts/automation-owner-action-runner'
import { toDispatchResult } from '../hosts/automation-row-action-dispatch'
import type { AutomationsPageController } from '../use-automations-page-controller'
import {
  automationRunModelFix,
  showAutomationModelRecoveryResult,
  useAutomationModelRecoveryUnsupported,
  type AutomationRunModelOption
} from './automation-run-model-fix'
import { useAutomationRecoveryModel } from './use-automation-recovery-model'

export function useAutomationRunModelActions(
  controller: AutomationsPageController,
  bots: readonly Bot[],
  hostLabel: string
) {
  const {
    list: { selectedRow, selected },
    setup: { selectedAutomationRunPage },
    local,
    store,
    destination
  } = controller
  const hostId = automationRowHostId(selectedRow)
  const botId = selected?.bot?.botId
  const availability = selectedRow
    ? automationActionAvailability(
        capturedAutomationOwner(
          destination.automationDispatchContext.capturedOwners,
          selectedRow.key
        ),
        'run'
      )
    : null
  const bot =
    availability?.kind === 'owned'
      ? (bots.find((entry) => entry.id === botId && entry.hostId === (hostId ?? 'local')) ?? null)
      : null

  const folderPath =
    selectedRow && bot
      ? store.worktreeForRow(selectedRow, undefined, folderWorkspaceKey(bot.folderWorkspaceId))
          ?.path
      : undefined
  const activeRun =
    local.pageView === 'run' &&
    selectedRow &&
    selectedAutomationRunPage &&
    availability?.kind === 'owned'
      ? JSON.stringify([
          selectedRow.key,
          ownerKey(availability.owner),
          selectedAutomationRunPage.id
        ])
      : null
  const currentRunVisit = useRef<object | null>(null)
  useLayoutEffect(() => {
    currentRunVisit.current = activeRun ? {} : null
    return () => {
      currentRunVisit.current = null
    }
  }, [activeRun])

  const eligible =
    selectedAutomationRunPage &&
    automationRunModelFix({
      run: selectedAutomationRunPage,
      automation: selected,
      bot,
      canRerun: true
    })
  const unsupported = useAutomationModelRecoveryUnsupported(eligible ? bot?.hostId : undefined)
  const lookupOwner =
    activeRun && eligible && !unsupported && folderPath && availability?.kind === 'owned'
      ? availability.owner
      : null
  const lookupSettings = lookupOwner?.authority.kind === 'desktop' ? store.settings : null
  const setupFingerprint =
    lookupOwner && eligible && bot
      ? automationModelRecoverySetupFingerprint(eligible.setup, bot)
      : undefined
  const settingsKey =
    lookupSettings && eligible
      ? JSON.stringify([
          lookupSettings.agentLaunchChoices?.[eligible.agent]?.model,
          newChatPermissionModeForSettings(eligible.agent, lookupSettings)
        ])
      : ''
  const { read, currentSelection } = useAutomationRecoveryModel(
    lookupOwner,
    selected?.id,
    activeRun,
    settingsKey,
    eligible?.agent,
    setupFingerprint
  )

  const onPickModel = async (model: AutomationRunModelOption): Promise<void> => {
    const target = selected?.bot
    const selection = read.status === 'ready' ? read.selection : undefined
    if (
      !selectedRow ||
      !selectedAutomationRunPage ||
      !selection ||
      currentSelection() !== selection ||
      selection.model === model.id ||
      isFailedAutomationRunModel(model.id, selectedAutomationRunPage.errorParams) ||
      !target ||
      !bot ||
      !folderPath ||
      availability?.kind !== 'owned'
    ) {
      return
    }
    const runVisit = currentRunVisit.current
    const automationId = selectedRow.automation.id
    const outcome = await recoverOwnedAutomationModel(availability, {
      id: automationId,
      runId: selectedAutomationRunPage.id,
      expectedTarget: automationModelRecoveryTarget(target, bot, folderPath, selection.permission),
      model: model.id
    })
    if (outcome.status === 'uncaptured') {
      return
    }
    const result = toDispatchResult(outcome)
    if (!result.ok) {
      if (result.notice.severity === 'owner') {
        destination.reportOwnerAction(selectedRow.key, result.notice)
      } else {
        destination.invalidateRowHost(selectedRow.key, 'definition')
        showAutomationModelRecoveryResult({ status: 'unconfirmed' }, model.label)
      }
      return
    }

    destination.reportOwnerAction(selectedRow.key, null)
    if (result.value.status !== 'unsupported' && result.value.status !== 'busy') {
      destination.invalidateRowHost(selectedRow.key, 'definition')
    }
    if (result.value.status !== 'queued') {
      showAutomationModelRecoveryResult(result.value, model.label, { hostLabel })
      return
    }
    const navigation = {
      automationId,
      runId: result.value.runId,
      hostId,
      rowKey: selectedRow.key,
      ownerKey: ownerKey(availability.owner),
      origin: local.runPageOrigin
    }
    showAutomationModelRecoveryResult(result.value, model.label, {
      openRun: () => {
        const state = useAppStore.getState()
        state.setPendingAutomationRunNavigation({ ...navigation })
        state.openAutomationsPage()
      }
    })
    if (
      runVisit &&
      currentRunVisit.current === runVisit &&
      useAppStore.getState().activeView === 'automations'
    ) {
      store.setPendingAutomationRunNavigation(navigation)
    }
  }

  return {
    bot: folderPath ? bot : null,
    onPickModel,
    defaultModel: 'selection' in read ? read.selection.model : undefined,
    modelRead: read.status
  }
}
