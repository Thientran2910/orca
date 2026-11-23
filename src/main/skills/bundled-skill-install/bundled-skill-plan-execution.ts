import { basename } from 'node:path'
import { sameBundledSkillObserved } from './bundled-skill-plan-identity'
import type {
  BundledSkillCleanup,
  BundledSkillInstallResult,
  BundledSkillObserved,
  BundledSkillOp,
  BundledSkillOpOutcome,
  BundledSkillOutcome,
  BundledSkillPlanEntry
} from '../../../shared/skills/bundled/bundled-skill-plan'
import {
  holdsCurrentBundledSkillCopy,
  isBundledSkillAutoUpdateOp
} from '../../../shared/skills/bundled/bundled-skill-summary'
import type { BundledSkillSource } from './bundled-skill-sources'
import { classifyBundledSkillPath } from './bundled-skill-classification'
import { filesystemErrorCode } from './bundled-skill-filesystem-error'
import { buildBundledSkillPlan, type BundledSkillPlanInput } from './bundled-skill-plan'
import {
  BundledSkillBackupRefusedError,
  BundledSkillChangedError,
  BundledSkillReplaceRestoreError,
  backUpBundledSkillPath,
  bundledSkillBackupPath,
  putBundledSkillFolder,
  removeBundledSkillSibling,
  replaceBundledSkillPath,
  retireBundledSkillPlacement,
  swapBundledSkillFolder
} from './bundled-skill-folder-swap'
import { findBundledSkillSource } from './bundled-skill-source-selection'
import { withBundledSkillTargetLocks } from './bundled-skill-target-locks'
import { recordBundledSkillDigestWritten } from './bundled-skill-written-digests'

export type BundledSkillExecuteInput = BundledSkillPlanInput & {
  /** Per-lock wait; the shared 5s default applies when unset. */
  lockTimeoutMs?: number
}

type SkillRun = {
  input: BundledSkillExecuteInput
  entry: BundledSkillPlanEntry
  source: BundledSkillSource
}

function verifier(run: SkillRun, path: string, expected: BundledSkillObserved) {
  return async () =>
    sameBundledSkillObserved(
      (
        await classifyBundledSkillPath(
          run.input.filesystem,
          path,
          run.source,
          run.entry.digest,
          'treeDigest' in expected
        )
      ).observed,
      expected
    )
}

async function requireUnchanged(run: SkillRun, path: string, expected: BundledSkillObserved) {
  if (!(await verifier(run, path, expected)())) {
    throw new BundledSkillChangedError(path)
  }
}

function backupFor(run: SkillRun): string {
  return bundledSkillBackupPath(run.input.destination.homeDirectory, run.entry.name)
}

/** Every backup an op completed, kept even when a later step fails or refuses. */
type OpProgress = { backups: string[] }

async function settleCleanup(run: SkillRun, cleanup: BundledSkillCleanup, progress: OpProgress) {
  await requireUnchanged(run, cleanup.path, cleanup.observed)
  if (cleanup.action === 'delete') {
    await removeBundledSkillSibling(run.input.filesystem, cleanup.path)
    return
  }
  progress.backups.push(
    await backUpBundledSkillPath(run.input.filesystem, cleanup.path, backupFor(run), 'leftover')
  )
}

/** The moved-aside copy held edits that could not be backed up; they stay at `path`. */
class BundledSkillStrandedError extends Error {
  constructor(
    readonly path: string,
    cause: unknown
  ) {
    super(`bundled-skill-stranded: ${path}`, { cause })
  }
}

/** Preserve bytes from a writer that raced the lock by re-hashing the moved-aside copy. */
async function settleOldCopy(run: SkillRun, old: string) {
  try {
    const { folderClass } = await classifyBundledSkillPath(
      run.input.filesystem,
      old,
      run.source,
      run.entry.digest
    )
    if (folderClass === 'current' || folderClass === 'released') {
      // A released leftover is the next plan's delete cleanup if this fails.
      await removeBundledSkillSibling(run.input.filesystem, old).catch(() => undefined)
      return undefined
    }
    return await backUpBundledSkillPath(run.input.filesystem, old, backupFor(run), 'moved-aside')
  } catch (error) {
    throw new BundledSkillStrandedError(old, error)
  }
}

function requireLinkTarget(op: BundledSkillOp): string {
  if (!op.linkTarget) {
    throw new Error('bundled-skill-link-without-target')
  }
  return op.linkTarget
}

function isOwnNameKeep(run: SkillRun, op: BundledSkillOp): boolean {
  return op.kind === 'keep' && basename(op.path) === run.source.name
}

async function applyContent(
  run: SkillRun,
  op: BundledSkillOp,
  progress: OpProgress
): Promise<string | undefined> {
  const { filesystem } = run.input
  const files = [{ path: 'SKILL.md', text: run.source.text }]
  const verify = verifier(run, op.path, op.observed)
  for (const cleanup of op.cleanup) {
    if (cleanup.action === 'backup') {
      await settleCleanup(run, cleanup, progress)
    }
  }
  for (const cleanup of op.cleanup) {
    if (cleanup.action === 'delete') {
      await settleCleanup(run, cleanup, progress)
    }
  }
  switch (op.kind) {
    case 'keep':
      // Former placements and agent links rely on the skill's own copy; report it if it changed.
      // A former name's recovery keep is relied on by nothing, and its retirement may run first.
      if (isOwnNameKeep(run, op)) {
        await requireUnchanged(run, op.path, op.observed)
      }
      return undefined
    case 'leave':
      // Agent links may depend on another build's shared copy; skip them if it changed since planning.
      if (op.reason === 'other-build') {
        await requireUnchanged(run, op.path, op.observed)
      }
      return undefined
    case 'write':
    case 'copy':
      await putBundledSkillFolder(filesystem, op.path, files, verify)
      return undefined
    case 'link':
      await requireUnchanged(run, op.path, op.observed)
      await filesystem.createLink(requireLinkTarget(op), op.path)
      return undefined
    case 'update': {
      const old = await swapBundledSkillFolder(filesystem, op.path, files, verify)
      // The new copy is in; unpreservable edits in the old copy surface as a stranded failure.
      return settleOldCopy(run, old)
    }
    case 'replace': {
      const backupPath = backupFor(run)
      await replaceBundledSkillPath(
        filesystem,
        op.path,
        backupPath,
        op.content === 'link' ? { linkTarget: requireLinkTarget(op) } : { files },
        verify
      )
      return backupPath
    }
    case 'restore': {
      const from = op.restoreFrom
      if (!from) {
        throw new Error('bundled-skill-restore-without-source')
      }
      await requireUnchanged(run, from.path, from.observed)
      await requireUnchanged(run, op.path, op.observed)
      await filesystem.rename(from.path, op.path)
      return undefined
    }
  }
}

type AppliedOp = {
  outcome: BundledSkillOpOutcome
  /** This op's location was checked to hold the planned bytes, so it can back links and a marker. */
  verified: boolean
}

async function applyOp(run: SkillRun, op: BundledSkillOp): Promise<AppliedOp> {
  const { path, kind, reason } = op
  const progress: OpProgress = { backups: [] }
  let contentApplied = false
  try {
    const primaryBackup = await applyContent(run, op, progress)
    if (primaryBackup) {
      progress.backups.push(primaryBackup)
    }
    contentApplied = true
    for (const previous of op.previous ?? []) {
      if (previous.retain) {
        await requireUnchanged(run, previous.path, previous.observed)
        continue
      }
      const retiredBackup = await retireBundledSkillPlacement(
        run.input.filesystem,
        previous.path,
        previous.forward ? op.path : undefined,
        (path) => verifier(run, path, previous.observed)(),
        backupFor(run)
      )
      if (retiredBackup) {
        progress.backups.push(retiredBackup)
      }
    }
    return {
      outcome: {
        path,
        kind,
        status: 'done',
        ...(reason && { reason }),
        ...backupFields(progress.backups)
      },
      verified: kind !== 'keep' || isOwnNameKeep(run, op)
    }
  } catch (error) {
    const strandedPath = error instanceof BundledSkillStrandedError ? error.path : undefined
    const failure =
      error instanceof BundledSkillStrandedError || error instanceof BundledSkillReplaceRestoreError
        ? error.cause
        : error
    if (error instanceof BundledSkillReplaceRestoreError) {
      progress.backups.push(error.backupPath)
    }
    // A stranded old copy was moved aside only after the new copy was published.
    contentApplied ||= Boolean(strandedPath)
    // A cleanup failing beside an already-current copy leaves that copy in place; prove it still is.
    if (!contentApplied && isOwnNameKeep(run, op)) {
      contentApplied = await verifier(run, op.path, op.observed)().catch(() => false)
    }
    const partial = {
      path,
      kind,
      ...(contentApplied && { contentApplied: true as const }),
      ...(strandedPath && { strandedPath }),
      ...backupFields(progress.backups)
    }
    const verified = contentApplied && (kind !== 'keep' || isOwnNameKeep(run, op))
    if (failure instanceof BundledSkillChangedError) {
      return { outcome: { ...partial, status: 'changed' }, verified }
    }
    if (failure instanceof BundledSkillBackupRefusedError) {
      return {
        outcome: { ...partial, status: 'failed', error: 'EXDEV', backupRefusal: failure.refusal },
        verified
      }
    }
    return {
      outcome: { ...partial, status: 'failed', error: filesystemErrorCode(failure) },
      verified
    }
  }
}

/** `backupPath` stays the first for older readers; `backupPaths` lists every completed backup. */
function backupFields(backups: readonly string[]) {
  return backups.length > 0 ? { backupPath: backups[0], backupPaths: [...backups] } : {}
}

/** Applies one skill's ops in order, then records its marker if this build's bytes are on disk. */
async function runSkill(run: SkillRun): Promise<BundledSkillOutcome> {
  const statuses = new Map<string, BundledSkillOpOutcome['status']>()
  const verified = new Set<string>()
  const ops: BundledSkillOpOutcome[] = []
  for (const op of run.entry.ops) {
    const applied: AppliedOp =
      op.requires && statuses.get(op.requires) !== 'done'
        ? { outcome: { path: op.path, kind: op.kind, status: 'skipped' }, verified: false }
        : await applyOp(run, op)
    const { outcome } = applied
    statuses.set(op.path, outcome.contentApplied ? 'done' : outcome.status)
    if (applied.verified) {
      verified.add(op.path)
    }
    ops.push(outcome)
  }
  // Only bytes checked on disk during this run count: a planned current copy may have changed.
  if (
    run.entry.ops.some(
      (op) =>
        verified.has(op.path) &&
        (op.content === 'files' ||
          (op.kind === 'keep' &&
            op.observed.kind === 'folder' &&
            op.observed.skillDigest === run.entry.digest))
    )
  ) {
    await recordOrcaCopy(run.input, run.entry)
  }
  return { name: run.entry.name, status: 'ran', ops }
}

/**
 * Lets other Orca builds on this host recognise these bytes as Orca's, not a user edit.
 * Execution only: preview stays read-only.
 */
function recordOrcaCopy(input: BundledSkillExecuteInput, entry: BundledSkillPlanEntry) {
  return recordBundledSkillDigestWritten(
    input.filesystem,
    input.destination.homeDirectory,
    entry.name,
    entry.digest
  )
}

/** Re-plan under all target locks and require the previewed digest; stale previews must write nothing. */
export async function executeBundledSkillPlan(
  input: BundledSkillExecuteInput,
  planDigest: string
): Promise<BundledSkillInstallResult> {
  const names = input.names ?? input.sources.map((source) => source.name)
  const unrun = (status: 'changed' | 'busy'): BundledSkillInstallResult => ({
    scope: input.destination.scope,
    skills: names.map((name) => ({ name, status, ops: [] }))
  })
  return withBundledSkillTargetLocks(input, unrun, async () => {
    const { plan } = await buildBundledSkillPlan(input)
    if (plan.planDigest !== planDigest) {
      return unrun('changed')
    }
    const skills: BundledSkillOutcome[] = []
    for (const entry of plan.skills) {
      skills.push(
        await runSkill({ input, entry, source: findBundledSkillSource(input.sources, entry.name) })
      )
    }
    return { scope: plan.scope, skills }
  })
}

/**
 * Plans each named installed skill under its locks and applies only hash-verified released-copy
 * updates; edited, foreign or interrupted locations are never touched. Each write re-checks its
 * location, and one skill's failure leaves the others' outcomes intact. `recordOnly` skips every
 * update and only records copies that already hold this build's bytes.
 */
export async function autoUpdateBundledSkills(
  input: BundledSkillExecuteInput & { names: readonly string[]; recordOnly?: boolean }
): Promise<BundledSkillInstallResult> {
  const unrun = (status: 'changed' | 'busy'): BundledSkillInstallResult => ({
    scope: input.destination.scope,
    skills: input.names.map((name) => ({ name, status, ops: [] }))
  })
  return withBundledSkillTargetLocks(input, unrun, async () => {
    const { plan } = await buildBundledSkillPlan({ ...input, installedOnly: true })
    const skills: BundledSkillOutcome[] = []
    for (const entry of plan.skills) {
      const safe = entry.ops.filter(isBundledSkillAutoUpdateOp)
      const required = new Set(safe.flatMap((op) => (op.requires ? [op.requires] : [])))
      const ops = entry.ops.filter(
        (op) =>
          safe.includes(op) ||
          (required.has(op.path) &&
            (op.kind === 'keep' || (op.kind === 'leave' && op.reason === 'other-build')) &&
            op.cleanup.every((item) => item.action === 'delete'))
      )
      if (ops.length > 0 && !input.recordOnly) {
        const source = findBundledSkillSource(input.sources, entry.name)
        skills.push(await runSkill({ input, entry: { ...entry, ops }, source }))
      }
      // An already-current copy (keep-only, so nothing ran) written before markers existed.
      if (holdsCurrentBundledSkillCopy(entry)) {
        await recordOrcaCopy(input, entry)
      }
    }
    return { scope: plan.scope, skills }
  })
}
