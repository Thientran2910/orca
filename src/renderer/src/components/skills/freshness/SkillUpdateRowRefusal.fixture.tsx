// Update dialog result rows when a cross-drive backup was refused (item 1126 states S1–S5).
import { defineFixture } from '../../../component-fixtures/component-fixture'
import type {
  BundledSkillOpOutcome,
  BundledSkillOutcome
} from '../../../../../shared/skills/bundled/bundled-skill-plan'
import type { BundledSkillPlanSkillSummary } from '../../../../../shared/skills/bundled/bundled-skill-summary'
import { SkillUpdateRow } from './SkillUpdateRow'

const SKILLS = '/Users/sam/.agents/skills'

function row(name: string, ops: BundledSkillOpOutcome[]): React.JSX.Element {
  const skill: BundledSkillPlanSkillSummary = {
    name,
    state: 'update',
    locations: [],
    upToDate: false
  }
  const outcome: BundledSkillOutcome = { name, status: 'ran', ops }
  return <SkillUpdateRow skill={skill} phase="result" outcome={outcome} showLocations={false} />
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
          contentApplied: true
        }),
        linked('orca-linear')
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
