import { afterEach, describe, expect, it, vi } from 'vitest'
import type {
  BundledSkillInstallResult,
  BundledSkillOpOutcome
} from '../../../../../shared/skills/bundled/bundled-skill-plan'

vi.mock('sonner', () => ({ toast: { warning: vi.fn() } }))
vi.mock('@/lib/files/os-open/reveal-in-file-manager', () => ({ revealInFileManager: vi.fn() }))
vi.mock('./skill-backup-location', () => ({
  skillBackupDirectory: (home: string) => `${home}/.agents/.orca-skill-backups`,
  skillBackupHost: () => ({ kind: 'local' })
}))

const { reportPreservedEdits } = await import('./skill-update-result-toasts')
const { toast } = await import('sonner')

const LOCAL = { kind: 'local' } as const
const SKILLS = '/home/u/.agents/skills'
const result = (...ops: BundledSkillOpOutcome[]): BundledSkillInstallResult => ({
  scope: 'global',
  skills: [{ name: 'orca', status: 'ran', ops }]
})
const warnings = () =>
  vi.mocked(toast.warning).mock.calls.map(([title, options]) => ({
    title,
    description: (options as { description?: string }).description,
    action: (options as { action?: { label: string } }).action?.label
  }))

afterEach(() => {
  vi.mocked(toast.warning).mockClear()
})

describe('automatic update result notices', () => {
  it('reports a retired copy put back in place, with its path action', () => {
    const former = '/home/u/.gemini/skills/orca'
    reportPreservedEdits(
      LOCAL,
      result({
        path: `${SKILLS}/orca`,
        kind: 'update',
        status: 'failed',
        error: 'EXDEV',
        contentApplied: true,
        backupRefusal: { path: former, source: 'in-place', onlyNotice: true }
      })
    )
    expect(warnings()).toEqual([
      {
        title: 'orca updated · Old copy kept as is',
        description: "Couldn't back it up: it's on another drive. Orca won't remind you.",
        action: 'Show in folder'
      }
    ])
  })

  it('reports a put-back beside a kept copy that was only rechecked', () => {
    reportPreservedEdits(
      LOCAL,
      result({
        path: `${SKILLS}/orca`,
        kind: 'keep',
        status: 'failed',
        error: 'EXDEV',
        currentConfirmed: true,
        backupRefusal: {
          path: '/home/u/.claude/skills/former',
          source: 'in-place',
          onlyNotice: true
        }
      })
    )
    expect(warnings().map((warning) => warning.title)).toEqual(['orca · Old copy kept as is'])
  })

  it('leaves an ordinary in-place refusal to the nudge', () => {
    reportPreservedEdits(
      LOCAL,
      result({
        path: `${SKILLS}/orca`,
        kind: 'update',
        status: 'failed',
        error: 'EXDEV',
        backupRefusal: { path: `${SKILLS}/orca`, source: 'in-place' }
      })
    )
    expect(warnings()).toEqual([])
  })

  it('does not call a backup-only keep an update', () => {
    const backup = '/home/u/.agents/.orca-skill-backups/orca-1'
    reportPreservedEdits(
      LOCAL,
      result({
        path: `${SKILLS}/orca`,
        kind: 'keep',
        status: 'done',
        backupPath: backup,
        backupPaths: [backup]
      })
    )
    expect(warnings().map((warning) => warning.description)).toEqual([
      `Orca saved your edits to ${backup}.`
    ])
  })

  it('names every backup an update made, and says it updated the skill', () => {
    const first = '/home/u/.agents/.orca-skill-backups/orca-1'
    const second = '/home/u/.agents/.orca-skill-backups/orca-2'
    reportPreservedEdits(
      LOCAL,
      result({
        path: `${SKILLS}/orca`,
        kind: 'update',
        status: 'done',
        backupPath: first,
        backupPaths: [first, second]
      })
    )
    expect(warnings().map((warning) => warning.description)).toEqual([
      `Orca updated the skill and saved your edits to ${first}.`,
      `Orca updated the skill and saved your edits to ${second}.`
    ])
  })

  it('titles a mixed group by what happened to every copy', () => {
    reportPreservedEdits(LOCAL, {
      scope: 'global',
      skills: [
        {
          name: 'orca',
          status: 'ran',
          ops: [
            {
              path: `${SKILLS}/orca`,
              kind: 'update',
              status: 'failed',
              error: 'EXDEV',
              contentApplied: true,
              backupRefusal: { path: `${SKILLS}/.orca.orca-old-1`, source: 'moved-aside' }
            }
          ]
        },
        {
          name: 'other',
          status: 'ran',
          ops: [
            {
              path: `${SKILLS}/other`,
              kind: 'update',
              status: 'failed',
              error: 'EXDEV',
              contentApplied: true,
              backupRefusal: {
                path: '/home/u/.gemini/skills/other',
                source: 'in-place',
                onlyNotice: true
              }
            }
          ]
        }
      ]
    })
    expect(warnings().map((warning) => warning.title)).toEqual([
      "2 old copies couldn't be backed up"
    ])
  })
})
