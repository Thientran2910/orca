import { sha256 } from '@noble/hashes/sha256'
import { bytesToHex } from '@noble/hashes/utils'
import type { AgentChatPermissionChoice } from '../../agent-launch/permissions/agent-chat-permission-mode'
import type { AutomationBotTarget } from '../../automation-bot-target'
import type { Bot } from '../../bot-types'
import { botAutomationSetup } from '../../bots/bot-agent-setup'

export type AutomationModelRecoveryInput = {
  id: string
  runId: string
  expectedTarget: string
  model: string
}

export type AutomationModelRecoverySelection = {
  model: string | null
  permission: AgentChatPermissionChoice | null
}

export type AutomationModelRecoveryResult =
  | { status: 'changed' | 'busy' | 'unconfirmed' | 'unsupported' }
  | { status: 'saved'; rerun: 'skipped' | 'unconfirmed' }
  | { status: 'queued'; runId: string; newerModel?: true }

/** Model-only edits leave the delivery target intact. */
export function automationModelRecoveryTarget(
  target: AutomationBotTarget,
  bot: Pick<Bot, 'agent' | 'launch' | 'folderWorkspaceId' | 'permissionMode'>,
  folderPath: string,
  permission: AutomationModelRecoverySelection['permission']
): string {
  const { agent, launch } = botAutomationSetup(target, bot)
  const { botId, runsIn, resultsTo, letBotReact } = target
  const destination =
    typeof resultsTo === 'string'
      ? resultsTo
      : 'channel' in resultsTo
        ? ['channel', resultsTo.channel, resultsTo.ref]
        : ['linearIssue', resultsTo.linearIssue, resultsTo.ref]
  const options = launch?.options ?? {}
  return bytesToHex(
    sha256(
      JSON.stringify([
        botId,
        runsIn,
        destination,
        letBotReact === true,
        bot.folderWorkspaceId,
        folderPath,
        bot.permissionMode,
        permission,
        agent,
        Object.keys(options)
          .sort()
          .map((key) => [key, options[key]])
      ])
    )
  )
}
