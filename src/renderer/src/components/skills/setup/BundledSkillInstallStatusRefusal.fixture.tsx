// Settings › Skills result line after a refused cross-drive backup (item 1126).
import { defineFixture } from '../../../component-fixtures/component-fixture'
import type {
  BundledSkillInstallResult,
  BundledSkillOpOutcome
} from '../../../../../shared/skills/bundled/bundled-skill-plan'
import { summarizeBundledSkillOutcomes } from '../../../../../shared/skills/bundled/bundled-skill-summary'
import { BundledSkillInstallStatus } from './BundledSkillInstallStatus'

const SKILLS = '/Users/sam/.agents/skills'

function status(ops: BundledSkillOpOutcome[]): React.JSX.Element {
  const result: BundledSkillInstallResult = {
    scope: 'global',
    skills: [{ name: 'orca-cli', status: 'ran', ops }]
  }
  const state = { kind: 'done' as const, result, summary: summarizeBundledSkillOutcomes(result) }
  return <BundledSkillInstallStatus install={{ state, retry: () => {} }} />
}

const refused = (
  source: 'in-place' | 'leftover' | 'moved-aside',
  path: string,
  fields: Partial<BundledSkillOpOutcome> = {}
): BundledSkillOpOutcome => ({
  path: `${SKILLS}/orca-cli`,
  kind: 'replace',
  status: 'failed',
  error: 'EXDEV',
  backupRefusal: { path, source },
  ...fields
})
const linked: BundledSkillOpOutcome = {
  path: '/Users/sam/.claude/skills/orca-cli',
  kind: 'link',
  status: 'done'
}

function Lines(): React.JSX.Element {
  return (
    <div className="flex flex-col gap-4 bg-background p-4">
      {status([refused('in-place', '/Volumes/Work/project/.agents/skills/orca-cli')])}
      {status([refused('in-place', `${SKILLS}/orca-cli`), linked])}
      {status([
        refused('leftover', `${SKILLS}/.orca-cli.orca-old-3f2a9c1e`, {
          kind: 'keep',
          contentApplied: true
        })
      ])}
      {status([
        refused('moved-aside', `${SKILLS}/.orca-cli.orca-old-7b1d44e0`, {
          kind: 'update',
          contentApplied: true
        })
      ])}
    </div>
  )
}

export const states = defineFixture({ render: () => <Lines />, width: 480 })
