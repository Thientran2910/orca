// Update dialog result rows when a cross-drive backup was refused (item 1126 states S1–S5).
import { defineFixture } from '../../../component-fixtures/component-fixture'
import type {
  BundledSkillOpOutcome,
  BundledSkillOutcome
} from '../../../../../shared/skills/bundled/bundled-skill-plan'
import type { BundledSkillPlanSkillSummary } from '../../../../../shared/skills/bundled/bundled-skill-summary'
import { SkillUpdateRow } from './SkillUpdateRow'
import { SkillUpdateRows } from './SkillUpdateRows'
import { skillBackupLocation } from './skill-backup-location'

const SKILLS = '/Users/sam/.agents/skills'
const BACKUP = skillBackupLocation('/Users/sam', { kind: 'local' })

function row(name: string, ops: BundledSkillOpOutcome[]): React.JSX.Element {
  const skill: BundledSkillPlanSkillSummary = {
    name,
    state: 'update',
    locations: [],
    upToDate: false
  }
  const outcome: BundledSkillOutcome = { name, status: 'ran', ops }
  return (
    <SkillUpdateRow
      skill={skill}
      phase="result"
      outcome={outcome}
      showLocations={false}
      backup={BACKUP}
    />
  )
}

const refused = (
  name: string,
  source: 'in-place' | 'leftover' | 'moved-aside',
  path: string,
  fields: Partial<BundledSkillOpOutcome> = {}
): BundledSkillOpOutcome => ({
  path: `${SKILLS}/${name}`,
  kind: 'replace',
  status: 'failed',
  error: 'EXDEV',
  backupRefusal: { path, source },
  ...fields
})

const LONG = 'orca-cli-orchestration-and-worktree-handoff'
const FORMER_ROOT_COPY = `/Users/sam/.gemini/skills/.${LONG}.orca-old-0c6e2f19-91aa-4d0b-8f3e-5a2b7c9d1e44`
const linked = (name: string): BundledSkillOpOutcome => ({
  path: `/Users/sam/.claude/skills/${name}`,
  kind: 'link',
  status: 'done'
})

function Rows(): React.JSX.Element {
  return (
    <div className="bg-background px-4">
      {row('orca-cli', [
        refused('orca-cli', 'in-place', '/Volumes/Work/project/.agents/skills/orca-cli')
      ])}
      {row('orchestration', [
        refused('orchestration', 'in-place', `${SKILLS}/orchestration`),
        linked('orchestration')
      ])}
      {row('orca-linear', [
        refused('orca-linear', 'leftover', `${SKILLS}/.orca-linear.orca-old-3f2a9c1e`, {
          kind: 'keep',
          currentConfirmed: true
        }),
        linked('orca-linear')
      ])}
      {row('orca-plan', [
        refused('orca-plan', 'moved-aside', `${SKILLS}/.orca-planner.orca-old-5c09b7d2`, {
          kind: 'keep',
          currentConfirmed: true
        })
      ])}
      {row('gemini-former', [
        refused('gemini-former', 'in-place', '/Users/sam/.gemini/skills/gemini-former', {
          kind: 'write',
          contentApplied: true,
          backupRefusal: {
            path: '/Users/sam/.gemini/skills/gemini-former',
            source: 'in-place',
            onlyNotice: true
          }
        })
      ])}
      {row('electron', [
        refused('electron', 'moved-aside', `${SKILLS}/.electron.orca-old-7b1d44e0`, {
          kind: 'update',
          contentApplied: true,
          strandedPath: `${SKILLS}/.electron.orca-old-7b1d44e0`
        })
      ])}
      {row(LONG, [
        {
          path: `${SKILLS}/${LONG}`,
          kind: 'write',
          status: 'failed',
          error: 'EXDEV',
          contentApplied: true,
          backupRefusal: { path: FORMER_ROOT_COPY, source: 'moved-aside', onlyNotice: true }
        },
        linked(LONG)
      ])}
    </div>
  )
}

export const states = defineFixture({ render: () => <Rows />, width: 640 })
export const narrow = defineFixture({ render: () => <Rows />, width: 420 })

/** A result for a skill the refreshed plan no longer lists keeps its row until Done. */
function LeftPlan(): React.JSX.Element {
  const planned: BundledSkillPlanSkillSummary = {
    name: 'orca-cli',
    state: 'current',
    locations: [],
    upToDate: true
  }
  const outcomes = new Map<string, BundledSkillOutcome>([
    ['orca-cli', { name: 'orca-cli', status: 'ran', ops: [linked('orca-cli')] }],
    [
      LONG,
      {
        name: LONG,
        status: 'ran',
        ops: [
          refused(LONG, 'in-place', `/Users/sam/.gemini/skills/${LONG}`, {
            kind: 'update',
            contentApplied: true,
            backupRefusal: {
              path: `/Users/sam/.gemini/skills/${LONG}`,
              source: 'in-place',
              onlyNotice: true
            }
          })
        ]
      }
    ]
  ])
  return (
    <div className="bg-background px-4">
      <SkillUpdateRows
        skills={[planned]}
        unforcedPlan={null}
        hasWork={false}
        phase="result"
        outcomes={outcomes}
        replace={{ isReplaced: () => false, onReplaceChange: () => {} }}
        showLocations={false}
        onToggleLocations={() => {}}
        backup={BACKUP}
      />
    </div>
  )
}

export const leftPlan = defineFixture({ render: () => <LeftPlan />, width: 420 })
