// Automatic-update toasts for a refused cross-drive backup (item 1126 S3–S5) and a lost reply.
import { useEffect } from 'react'
import { toast } from 'sonner'
import { defineFixture } from '../../../component-fixtures/component-fixture'
import { Toaster } from '../../ui/sonner'
import type {
  BundledSkillInstallResult,
  BundledSkillOpOutcome
} from '../../../../../shared/skills/bundled/bundled-skill-plan'
import type { BundledSkillTarget } from '@/lib/skills/runtime/bundled-skill-target'
import { reportPreservedEdits, reportUncertainOutcome } from './skill-freshness-auto-update'

const SKILLS = '/Users/sam/.agents/skills'

const movedAside = (name: string, path: string, onlyNotice = false): BundledSkillOpOutcome => ({
  path: `${SKILLS}/${name}`,
  kind: 'update',
  status: 'failed',
  error: 'EXDEV',
  contentApplied: true,
  backupRefusal: { path, source: 'moved-aside', ...(onlyNotice && { onlyNotice: true as const }) }
})

function result(ops: Record<string, BundledSkillOpOutcome>): BundledSkillInstallResult {
  return {
    scope: 'global',
    skills: Object.entries(ops).map(([name, op]) => ({ name, status: 'ran' as const, ops: [op] }))
  }
}

function Toasts({
  target,
  run
}: {
  target: BundledSkillTarget
  run: BundledSkillInstallResult
}): React.JSX.Element {
  useEffect(() => {
    reportPreservedEdits(target, run)
    return () => {
      toast.dismiss()
    }
  }, [target, run])
  return (
    <>
      <div className="h-[260px]" />
      <Toaster toastOptions={{ className: 'font-sans text-sm' }} />
    </>
  )
}

const LOCAL: BundledSkillTarget = { kind: 'local' }
const REMOTE: BundledSkillTarget = { kind: 'ssh', targetId: 'build-box' }

export const local = defineFixture({
  render: () => (
    <Toasts
      target={LOCAL}
      run={result({ electron: movedAside('electron', `${SKILLS}/.electron.orca-old-7b1d44e0`) })}
    />
  ),
  width: 480
})

export const formerRootOnlyNotice = defineFixture({
  render: () => (
    <Toasts
      target={LOCAL}
      run={result({
        electron: movedAside(
          'electron',
          '/Users/sam/.gemini/skills/.electron.orca-old-0c6e2f19',
          true
        )
      })}
    />
  ),
  width: 480
})

export const keptMovedAside = defineFixture({
  render: () => (
    <Toasts
      target={LOCAL}
      run={result({
        electron: {
          path: `${SKILLS}/electron`,
          kind: 'keep',
          status: 'failed',
          error: 'EXDEV',
          currentConfirmed: true,
          backupRefusal: {
            path: `${SKILLS}/.orca-cli-orchestration-and-worktree-handoff.orca-old-5c09b7d2`,
            source: 'moved-aside'
          }
        }
      })}
    />
  ),
  width: 480
})

export const remote = defineFixture({
  render: () => (
    <Toasts
      target={REMOTE}
      run={result({
        electron: movedAside('electron', '/home/sam/.agents/skills/.electron.orca-old-7b1d44e0')
      })}
    />
  ),
  width: 480
})

export const grouped = defineFixture({
  render: () => (
    <Toasts
      target={LOCAL}
      run={result({
        electron: movedAside('electron', `${SKILLS}/.electron.orca-old-7b1d44e0`),
        'orca-cli': movedAside('orca-cli', `${SKILLS}/.orca-cli.orca-old-91aa4d0b`)
      })}
    />
  ),
  width: 480
})

/** A lost or timed-out automatic update reply (item 1126 C3 copy). */
function UncertainToast({ target }: { target: BundledSkillTarget }): React.JSX.Element {
  useEffect(() => {
    reportUncertainOutcome(target, { homeDirectory: '/Users/sam' })
    return () => {
      toast.dismiss()
    }
  }, [target])
  return (
    <>
      <div className="h-[200px]" />
      <Toaster toastOptions={{ className: 'font-sans text-sm' }} />
    </>
  )
}

export const uncertainLocal = defineFixture({
  render: () => <UncertainToast target={LOCAL} />,
  width: 360
})

export const uncertainRemote = defineFixture({
  render: () => <UncertainToast target={REMOTE} />,
  width: 360
})
