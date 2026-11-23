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

function describeOutcomeOp(op: BundledSkillOpOutcome): string | null {
  switch (op.status) {
    case 'done':
      return op.kind === 'leave' ? leaveText(op.reason) : null
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

export function describeOutcomeOpLines(
  skill: string,
  op: BundledSkillOpOutcome,
  backupFolder: string
): string[] {
  const refusal = bundledSkillOpRefusalNotice(skill, op)
  const text = refusal ? null : describeOutcomeOp(op)
  return [
    ...(refusal
      ? [
          // A left-over refusal beside a main copy that landed still reports the update first.
          ...(refusal.source === 'leftover' && refusal.contentApplied && op.kind !== 'keep'
            ? [`  ${skill}: updated.`]
            : []),
          `  ${describeRefusal(refusal, backupFolder)}`
        ]
      : []),
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
