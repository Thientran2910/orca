import type {
  BundledSkillInstallResult,
  BundledSkillOutcome
} from '../../../../../shared/skills/bundled/bundled-skill-plan'
import {
  bundledSkillOutcomeRefusalNotices,
  bundledSkillOutcomeUpdatedSomething,
  type BundledSkillRefusalNotice
} from '../../../../../shared/skills/bundled/bundled-skill-backup-refusal'
import { translate } from '@/i18n/i18n'
import type { Translate } from '@/i18n/use-translate'

/** The path is never part of a sentence: it sits on its own line between `reason` and `next`. */
export type SkillRefusalLines = { reason: string; path: string; next: string }

export function skillRefusalLines(
  notice: BundledSkillRefusalNotice,
  t: Translate = translate
): SkillRefusalLines {
  switch (notice.source) {
    case 'in-place':
      return {
        reason: t(
          'auto.components.skills.skillBackupRefusal.inPlaceReason',
          "Can't back it up: it's on another drive."
        ),
        path: notice.path,
        next: t(
          'auto.components.skills.skillBackupRefusal.tryAgain',
          'Move it out of the skills folder, then try again.'
        )
      }
    case 'leftover':
      return {
        reason: t(
          'auto.components.skills.skillBackupRefusal.leftoverReason',
          "Can't back up the left-over copy: it's on another drive."
        ),
        path: notice.path,
        next: t(
          'auto.components.skills.skillBackupRefusal.tryAgain',
          'Move it out of the skills folder, then try again.'
        )
      }
    case 'moved-aside':
      return {
        reason: t(
          'auto.components.skills.skillBackupRefusal.movedAsideReason',
          "Couldn't back up the old copy: it's on another drive."
        ),
        path: notice.path,
        next: notice.offeredAgain
          ? t(
              'auto.components.skills.skillBackupRefusal.keepIt',
              'Move it out of the skills folder to keep it.'
            )
          : t(
              'auto.components.skills.skillBackupRefusal.noReminder',
              "Move it out of the skills folder. Orca won't remind you."
            )
      }
  }
}

type RefusalSummary = {
  notices: BundledSkillRefusalNotice[]
  updated: boolean
  movedAside: boolean
  keptInPlace: number
}

function summarize(outcome: BundledSkillOutcome): RefusalSummary | null {
  const notices = bundledSkillOutcomeRefusalNotices(outcome)
  if (notices.length === 0) {
    return null
  }
  return {
    notices,
    updated: bundledSkillOutcomeUpdatedSomething(outcome),
    movedAside: notices.some((notice) => notice.source === 'moved-aside'),
    keptInPlace: notices.filter((notice) => notice.source === 'in-place').length
  }
}

function updatedHeadline(summary: RefusalSummary, t: Translate): string {
  if (summary.movedAside) {
    return t(
      'auto.components.skills.skillBackupRefusal.updatedMovedAside',
      'Updated · Old copy moved aside'
    )
  }
  if (summary.keptInPlace > 0) {
    return summary.keptInPlace === 1
      ? t('auto.components.skills.skillBackupRefusal.updatedOneKept', 'Updated · 1 copy kept as is')
      : t(
          'auto.components.skills.skillBackupRefusal.updatedCopiesKept',
          'Updated · {{count}} copies kept as is',
          { count: summary.keptInPlace }
        )
  }
  return t(
    'auto.components.skills.skillBackupRefusal.updatedLeftoverKept',
    'Updated · Left-over copy kept'
  )
}

/** Update dialog row headline for a skill with a refused backup; null when nothing was refused. */
export function skillRefusalRowHeadline(
  outcome: BundledSkillOutcome,
  t: Translate = translate
): string | null {
  const summary = summarize(outcome)
  if (!summary) {
    return null
  }
  if (summary.updated) {
    return summary.movedAside || summary.keptInPlace > 0
      ? updatedHeadline(summary, t)
      : t('auto.components.skills.skillPlanOpCopy.updated', 'Updated')
  }
  return t('auto.components.skills.skillBackupRefusal.keptAsIs', 'Kept as is')
}

/** Settings result line: the short state, then each retained path on its own line. */
export function skillRefusalSettingsLine(
  result: BundledSkillInstallResult,
  t: Translate = translate
): string | null {
  const summaries = result.skills.flatMap((outcome) => summarize(outcome) ?? [])
  const summary =
    summaries.find((candidate) => candidate.movedAside) ??
    summaries.find((candidate) => candidate.keptInPlace > 0) ??
    summaries[0]
  if (!summary) {
    return null
  }
  const headline = summary.updated
    ? updatedHeadline(summary, t)
    : summary.keptInPlace > 0
      ? t(
          'auto.components.skills.skillBackupRefusal.keptOnAnotherDrive',
          'Kept as is · On another drive'
        )
      : t(
          'auto.components.skills.skillBackupRefusal.keptLeftoverKept',
          'Kept as is · Left-over copy kept'
        )
  const paths = summaries.flatMap((candidate) => candidate.notices.map((notice) => notice.path))
  return [headline, ...paths].join('\n')
}
