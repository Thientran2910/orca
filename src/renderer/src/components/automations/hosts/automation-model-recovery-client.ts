import { RuntimeRpcCallError } from '@/runtime/rpc/calls/runtime-rpc-result'
import { AUTOMATION_MODEL_RECOVERY_RUNTIME_CAPABILITY } from '../../../../../shared/automations/automation-runtime-capabilities'
import type {
  AutomationModelRecoveryInput,
  AutomationModelRecoveryResult,
  AutomationModelRecoverySelection
} from '../../../../../shared/automations/history/automation-model-recovery'
import { isAgentChatPermissionChoice } from '../../../../../shared/agent-launch/permissions/agent-chat-permission-mode'
import type { AutomationOwnerRef } from '../../../../../shared/automations/ownership/automation-owner-ref'
import {
  assertAuthorityCapability,
  AutomationHostScopeUnsupportedError
} from './automation-capability-probe'
import { callAuthority, ownerPrecondition } from './automation-scoped-list-client'

export async function readAutomationRecoverySelectionForOwner(
  owner: AutomationOwnerRef,
  id: string
): Promise<AutomationModelRecoverySelection | undefined> {
  const { recoverySelection } = await callAuthority<{
    recoverySelection?: Partial<AutomationModelRecoverySelection> | null
  }>(owner.authority, 'automation.show', {
    id,
    expectedOwner: ownerPrecondition(owner),
    modelRecovery: true
  })
  if (
    recoverySelection &&
    (recoverySelection.model === null ||
      (typeof recoverySelection.model === 'string' && recoverySelection.model.length > 0)) &&
    (recoverySelection.permission === null ||
      isAgentChatPermissionChoice(recoverySelection.permission))
  ) {
    return { model: recoverySelection.model, permission: recoverySelection.permission }
  }
  return undefined
}

export async function recoverAutomationModelForOwner(
  owner: AutomationOwnerRef,
  input: AutomationModelRecoveryInput
): Promise<AutomationModelRecoveryResult> {
  try {
    await assertAuthorityCapability(
      owner.authority,
      AUTOMATION_MODEL_RECOVERY_RUNTIME_CAPABILITY,
      AUTOMATION_MODEL_RECOVERY_RUNTIME_CAPABILITY,
      { cacheConfirmation: false }
    )
    return await callAuthority(owner.authority, 'automation.recoverModel', {
      ...input,
      expectedOwner: ownerPrecondition(owner)
    })
  } catch (error) {
    if (
      error instanceof AutomationHostScopeUnsupportedError ||
      (error instanceof RuntimeRpcCallError && error.code === 'method_not_found')
    ) {
      return { status: 'unsupported' }
    }
    throw error
  }
}
