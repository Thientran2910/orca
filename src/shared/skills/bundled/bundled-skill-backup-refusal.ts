import type {
  BundledSkillBackupRefusal,
  BundledSkillInstallResult,
  BundledSkillOpOutcome,
  BundledSkillOutcome
} from './bundled-skill-plan'

/**
 * A copy Orca left where it was because backing it up would have crossed drives.
 * `path` is on the host that ran the update; nothing there was copied, moved or deleted by the
 * refused step.
 */
export type BundledSkillRefusalNotice = {
  skill: string
  path: string
  source: BundledSkillBackupRefusal['source']
  /** The op's own new copy or link landed before the refusal. */
  contentApplied: boolean
  /**
   * Whether a later plan will offer this copy again. A copy moved aside outside the op's own
   * folder (a former agent root) is not rediscovered, so this result is its only notice.
   */
  offeredAgain: boolean
}

function parentOf(path: string): string {
  return path.replace(/[\\/]+[^\\/]+[\\/]*$/u, '')
}

export function bundledSkillOpRefusalNotice(
  skill: string,
  op: BundledSkillOpOutcome
): BundledSkillRefusalNotice | null {
  const refusal = op.backupRefusal
  if (!refusal) {
    return null
  }
  return {
    skill,
    path: refusal.path,
    source: refusal.source,
    contentApplied: op.contentApplied === true,
    offeredAgain: refusal.source !== 'moved-aside' || parentOf(refusal.path) === parentOf(op.path)
  }
}

export function bundledSkillOutcomeRefusalNotices(
  outcome: BundledSkillOutcome
): BundledSkillRefusalNotice[] {
  return outcome.ops.flatMap((op) => bundledSkillOpRefusalNotice(outcome.name, op) ?? [])
}

export function bundledSkillRefusalNotices(
  result: BundledSkillInstallResult | null | undefined
): BundledSkillRefusalNotice[] {
  return (result?.skills ?? []).flatMap(bundledSkillOutcomeRefusalNotices)
}

/** Every backup an op completed; older hosts report only `backupPath`. */
export function bundledSkillOpBackupPaths(op: BundledSkillOpOutcome): readonly string[] {
  return op.backupPaths ?? (op.backupPath ? [op.backupPath] : [])
}

const WRITING_KINDS = new Set(['write', 'copy', 'link', 'update', 'replace'])

/**
 * Whether this run put new content anywhere for the skill, including an op that failed after its
 * content landed. A kept copy rechecked as current is not an update.
 */
export function bundledSkillOutcomeUpdatedSomething(outcome: BundledSkillOutcome): boolean {
  return outcome.ops.some(
    (op) => WRITING_KINDS.has(op.kind) && (op.status === 'done' || op.contentApplied === true)
  )
}
