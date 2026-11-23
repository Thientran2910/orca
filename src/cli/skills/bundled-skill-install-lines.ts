// Text for `orca skills install|update` plans and results.
import type {
  BundledSkillOp,
  BundledSkillOpOutcome,
  BundledSkillPlan
} from '../../shared/skills/bundled/bundled-skill-plan'
import { isBundledSkillLeaveReason } from '../../shared/skills/bundled/bundled-skill-plan'
import {
  bundledSkillOpBackupPaths,
  bundledSkillOpRefusalNotice,
  type BundledSkillRefusalNotice
} from '../../shared/skills/bundled/bundled-skill-backup-refusal'
import {
  BUNDLED_SKILL_LEAVE_REASON_TEXT,
  BUNDLED_SKILL_PLAN_OP_TEXT
} from '../../shared/skills/bundled/bundled-skill-summary'

function leaveText(reason: string | undefined): string {
  const text =
    reason && isBundledSkillLeaveReason(reason)
      ? BUNDLED_SKILL_LEAVE_REASON_TEXT[reason]
      : 'This copy was kept as it is'
  return `Update skipped: ${text}`
}

function describePlanOp(op: BundledSkillOp): string {
  return op.kind === 'leave' ? leaveText(op.reason) : BUNDLED_SKILL_PLAN_OP_TEXT[op.kind]
}

function describeRefusal(notice: BundledSkillRefusalNotice, backupFolder: string): string {
  const cannot = `Can't back it up to ${backupFolder}: it's on another drive.`
  switch (notice.source) {
    case 'in-place':
      return `${notice.skill}: kept as is at ${notice.path}. ${cannot} Move it out of the skills folder, then run again.`
    case 'leftover':
      return `${notice.skill}: left-over copy kept at ${notice.path}. ${cannot} Move it out of the skills folder, then run again.`
    case 'moved-aside':
      return [
        notice.contentApplied ? `${notice.skill}: updated.` : `${notice.skill}:`,
        `Old copy moved aside to ${notice.path}. ${cannot} Move it out of the skills folder to keep it.`,
        ...(notice.offeredAgain ? [] : ["Orca won't mention this copy again."])
      ].join(' ')
  }
}

const PUBLISHED_TEXT: Partial<Record<BundledSkillOpOutcome['kind'], string>> = {
  write: 'Installed.',
  copy: 'Installed.',
  link: 'Linked.',
  update: 'Updated.',
  replace: 'Updated.'
}

function describeOutcomeOp(op: BundledSkillOpOutcome, listPublished: boolean): string | null {
  switch (op.status) {
    case 'done':
      if (op.kind === 'leave') {
        return leaveText(op.reason)
      }
      return listPublished ? (PUBLISHED_TEXT[op.kind] ?? null) : null
    case 'changed':
      return op.contentApplied
        ? 'Partly done, then changed since it was planned. Run it again to re-plan.'
        : 'Changed since it was planned; nothing was written. Run it again to re-plan.'
    case 'skipped':
      return 'Skipped: the shared copy it depends on did not land.'
    case 'failed':
      return `Failed: ${op.error ?? 'unknown error'}`
  }
}

/**
 * `listPublished`: the skill's summary line says "Needs attention", so name each location that
 * did get new content rather than let one refusal hide it.
 */
export function describeOutcomeOpLines(
  skill: string,
  op: BundledSkillOpOutcome,
  backupFolder: string,
  listPublished = false
): string[] {
  const refusal = bundledSkillOpRefusalNotice(skill, op)
  const text = refusal ? null : describeOutcomeOp(op, listPublished)
  return [
    ...(refusal ? [`  ${describeRefusal(refusal, backupFolder)}`] : []),
    ...(text ? [`  ${op.path}: ${text}`] : []),
    ...bundledSkillOpBackupPaths(op).map((path) => `  ${op.path}: Backed up to ${path}`)
  ]
}

export function hasReplaceableLeave(plan: BundledSkillPlan): boolean {
  return plan.skills.some((entry) =>
    entry.ops.some((op) => op.kind === 'leave' && op.replaceable === true)
  )
}

export function describePlan(plan: BundledSkillPlan): string[] {
  return plan.skills.flatMap((entry) => [
    entry.name,
    ...entry.ops.map((op) => `  ${op.path}: ${describePlanOp(op)}`)
  ])
}
