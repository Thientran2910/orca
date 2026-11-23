import { useState } from 'react'
import { RefreshCw } from 'lucide-react'
import type { BundledSkillUnsupportedReason } from '@/runtime/skills/bundled/runtime-bundled-skills-client'
import { Button } from '../../ui/button'
import {
  skillInstallRefusalBlocks,
  skillInstallResultLine
} from './bundled-skill-setup-result-copy'
import type { SkillRefusalSettingsBlock } from '../freshness/skill-backup-refusal-copy'
import {
  bundledSkillInstallNeedsAttention,
  type BundledSkillInstall
} from '@/hooks/skills/installation/use-bundled-skill-install'
import { cn } from '@/lib/class-names'
import { useTranslate } from '@/i18n/use-translate'
import { skillBackupPaths } from '../freshness/skill-backup-location'
import { SkillBackupPathLine } from '../freshness/SkillBackupPathLine'

export function BundledSkillInstallStatus(props: {
  install: Pick<BundledSkillInstall, 'state' | 'retry'>
  buttonSize?: 'xs' | 'sm'
  className?: string
  attention?: { retry: () => void; message?: string }
  unsupported?: BundledSkillUnsupportedReason
}): React.JSX.Element | null {
  const t = useTranslate()
  const [showAllSkills, setShowAllSkills] = useState(false)
  const previewAttention =
    props.attention && (props.install.state.kind === 'idle' || props.install.state.kind === 'done')
  const state = props.unsupported
    ? { kind: 'unsupported' as const, reason: props.unsupported }
    : previewAttention
      ? {
          kind: 'failed' as const,
          message:
            props.attention?.message ??
            t('auto.components.skills.skillPlanOpCopy.needsAttention', 'Needs attention')
        }
      : props.install.state
  const retry = previewAttention ? props.attention?.retry : props.install.retry
  if (state.kind === 'idle' || state.kind === 'installing') {
    return null
  }
  if (state.kind === 'unsupported') {
    return (
      <p className={cn('text-xs leading-snug text-muted-foreground', props.className)}>
        {state.reason === 'connect-host'
          ? t(
              'auto.components.settings.BundledSkillInstallStatus.connectHost',
              'Connect to this SSH host to install its skills.'
            )
          : t(
              'auto.components.settings.BundledSkillInstallStatus.updateServer',
              'Update Orca on the server to install its skills.'
            )}
      </p>
    )
  }
  const problem = bundledSkillInstallNeedsAttention(state)
  const blocks = state.kind === 'done' ? skillInstallRefusalBlocks(state.result, t) : null
  const message =
    state.kind === 'failed' ? state.message : skillInstallResultLine(state.result, state.changes, t)
  // Why the run's state: an attention preview replaces the result line but not the backups it made.
  const ran = props.install.state.kind === 'done' ? props.install.state : null
  const backupPaths = ran ? skillBackupPaths(ran.result.skills.flatMap((skill) => skill.ops)) : []
  const tone = problem ? 'text-destructive' : 'text-muted-foreground'
  return (
    <div className={cn('flex flex-wrap items-baseline gap-2', props.className)}>
      {blocks && blocks.length > 1 ? (
        <RefusalBlocks
          blocks={blocks}
          showAll={showAllSkills}
          onShowAll={() => setShowAllSkills(true)}
          className={tone}
        />
      ) : (
        <p className={cn('min-w-0 flex-1 whitespace-pre-line text-xs leading-snug', tone)}>
          {message}
        </p>
      )}
      {problem ? (
        <Button type="button" variant="ghost" size={props.buttonSize ?? 'sm'} onClick={retry}>
          <RefreshCw className="size-3.5" />
          {t('auto.components.settings.AgentSkillSetupPanel.retrySetup', 'Retry')}
        </Button>
      ) : null}
      {backupPaths.map((path) => (
        <SkillBackupPathLine
          key={path}
          path={path}
          host={ran?.backupHost ?? { kind: 'local' }}
          className="basis-full"
        />
      ))}
    </div>
  )
}

const VISIBLE_SKILL_BLOCKS = 3

/** A batch's per-skill states, each skill's kept paths indented and selectable beneath it. */
function RefusalBlocks(props: {
  blocks: readonly SkillRefusalSettingsBlock[]
  showAll: boolean
  onShowAll: () => void
  className: string
}): React.JSX.Element {
  const t = useTranslate()
  const visible =
    props.showAll || props.blocks.length <= VISIBLE_SKILL_BLOCKS
      ? props.blocks
      : props.blocks.slice(0, VISIBLE_SKILL_BLOCKS)
  const hidden = props.blocks.length - visible.length
  return (
    <div className={cn('flex min-w-0 flex-1 flex-col gap-1 text-xs leading-snug', props.className)}>
      {visible.map((block) => (
        <div key={block.headline} className="min-w-0">
          <p>{block.headline}</p>
          {block.paths.map((path) => (
            <p key={path} className="select-text break-all pl-3" title={path}>
              {path}
            </p>
          ))}
        </div>
      ))}
      {hidden > 0 ? (
        <Button
          type="button"
          variant="link"
          size="xs"
          className="h-auto self-start px-0 text-muted-foreground"
          onClick={props.onShowAll}
        >
          {t(
            'auto.components.settings.BundledSkillInstallStatus.showMoreSkills',
            'Show {{count}} more',
            { count: hidden }
          )}
        </Button>
      ) : null}
    </div>
  )
}
