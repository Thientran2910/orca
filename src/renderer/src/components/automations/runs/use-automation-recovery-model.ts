import { useEffectEvent, useLayoutEffect, useRef, useState } from 'react'
import { subscribeHostAgentLaunchSettings } from '@/runtime/agent-launch-settings/agent-launch-settings-transport'
import type { AutomationModelRecoverySelection } from '../../../../../shared/automations/history/automation-model-recovery'
import type { AutomationOwnerRef } from '../../../../../shared/automations/ownership/automation-owner-ref'
import { readAutomationRecoverySelectionForOwner } from '../hosts/automation-model-recovery-client'

export type AutomationRecoveryModelRead =
  | { status: 'loading' | 'unavailable' }
  | { status: 'refreshing' | 'ready'; selection: AutomationModelRecoverySelection }

function pendingRead(selection?: AutomationModelRecoverySelection): AutomationRecoveryModelRead {
  return selection ? { status: 'refreshing', selection } : { status: 'loading' }
}

/** A Settings model is inherited from the owner, even while the client is on another host. */
export function useAutomationRecoveryModel(
  owner: AutomationOwnerRef | null,
  id: string | undefined,
  runKey: string | null,
  setupKey: string
) {
  const current = useRef<AutomationModelRecoverySelection | undefined>(undefined)
  const [answer, setAnswer] = useState<{
    runKey: string
    setupKey: string
    read: AutomationRecoveryModelRead
  } | null>(null)
  const hasOwner = owner !== null
  const lookupOwner = useEffectEvent(() => owner)
  useLayoutEffect(() => {
    const owner = lookupOwner()
    if (!hasOwner || !owner || !id || !runKey) {
      return
    }
    let request: object | undefined
    let previous: AutomationModelRecoverySelection | undefined
    const refresh = () => {
      const token = {}
      request = token
      current.current = undefined
      void readAutomationRecoverySelectionForOwner(owner, id)
        .catch(() => undefined)
        .then((selection) => {
          if (request !== token) {
            return
          }
          previous = selection
          current.current = selection
          setAnswer({
            runKey,
            setupKey,
            read: selection ? { status: 'ready', selection } : { status: 'unavailable' }
          })
        })
    }
    refresh()
    const authority = owner.authority
    const unsubscribe =
      authority.kind === 'runtime'
        ? subscribeHostAgentLaunchSettings(({ environmentId }) => {
            if (environmentId === authority.environmentId) {
              refresh()
              setAnswer({ runKey, setupKey, read: pendingRead(previous) })
            }
          })
        : undefined
    return () => {
      request = undefined
      current.current = undefined
      unsubscribe?.()
    }
  }, [hasOwner, id, runKey, setupKey])
  const matching = hasOwner && answer?.runKey === runKey ? answer : null
  const read =
    matching?.setupKey === setupKey
      ? matching.read
      : pendingRead(matching && 'selection' in matching.read ? matching.read.selection : undefined)
  return { read, currentSelection: () => current.current }
}
