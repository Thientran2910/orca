import { describe, expect, it } from 'vitest'
import { describeOutcomeOpLines } from './bundled-skill-install-lines'

const SKILLS = '/home/u/.agents/skills'
const BACKUPS = '/home/u/.agents/.orca-skill-backups'

describe('orca skills CLI refusal lines', () => {
  it('names the kept copy and both folders for a refused Replace', () => {
    expect(
      describeOutcomeOpLines(
        'orca',
        {
          path: `${SKILLS}/orca`,
          kind: 'replace',
          status: 'failed',
          error: 'EXDEV',
          backupRefusal: { path: `${SKILLS}/orca`, source: 'in-place' }
        },
        BACKUPS
      )
    ).toEqual([
      `  orca: kept as is at ${SKILLS}/orca. Can't back it up to ${BACKUPS}: it's on another drive. Move it out of the skills folder, then run again.`
    ])
  })

  it('reports the update, the moved-aside path and every finished backup', () => {
    const old = '/home/u/.gemini/skills/.orca.orca-old-1'
    expect(
      describeOutcomeOpLines(
        'orca',
        {
          path: `${SKILLS}/orca`,
          kind: 'write',
          status: 'failed',
          error: 'EXDEV',
          contentApplied: true,
          backupPath: `${BACKUPS}/orca-1`,
          backupPaths: [`${BACKUPS}/orca-1`],
          backupRefusal: { path: old, source: 'moved-aside', onlyNotice: true }
        },
        BACKUPS
      )
    ).toEqual([
      `  orca: updated. Old copy moved aside to ${old}. Can't back it up to ${BACKUPS}: it's on another drive. Move it out of the skills folder to keep it. Orca won't mention this copy again.`,
      `  ${SKILLS}/orca: Backed up to ${BACKUPS}/orca-1`
    ])
  })

  it('does not claim nothing was written when a change follows landed content', () => {
    expect(
      describeOutcomeOpLines(
        'orca',
        { path: `${SKILLS}/orca`, kind: 'update', status: 'changed', contentApplied: true },
        BACKUPS
      )
    ).toEqual([
      `  ${SKILLS}/orca: Partly done, then changed since it was planned. Run it again to re-plan.`
    ])
  })

  it('says nothing about an update for a rechecked keep whose retirement was refused', () => {
    const old = `${SKILLS}/.former-skill.orca-old-1`
    expect(
      describeOutcomeOpLines(
        'orca',
        {
          path: `${SKILLS}/orca`,
          kind: 'keep',
          status: 'failed',
          error: 'EXDEV',
          currentConfirmed: true,
          backupRefusal: { path: old, source: 'moved-aside' }
        },
        BACKUPS,
        true
      )
    ).toEqual([
      `  orca: Old copy moved aside to ${old}. Can't back it up to ${BACKUPS}: it's on another drive. Move it out of the skills folder to keep it.`
    ])
  })

  it('names each location that got new content when the skill needs attention', () => {
    const linked = {
      path: '/home/u/.claude/skills/orca',
      kind: 'link' as const,
      status: 'done' as const
    }
    expect(describeOutcomeOpLines('orca', linked, BACKUPS, true)).toEqual([
      '  /home/u/.claude/skills/orca: Linked.'
    ])
    expect(describeOutcomeOpLines('orca', linked, BACKUPS)).toEqual([])
    expect(
      describeOutcomeOpLines(
        'orca',
        { path: `${SKILLS}/orca`, kind: 'keep', status: 'done' },
        BACKUPS,
        true
      )
    ).toEqual([])
  })

  it('keeps a generic EXDEV as a plain failure', () => {
    expect(
      describeOutcomeOpLines(
        'orca',
        { path: `${SKILLS}/orca`, kind: 'update', status: 'failed', error: 'EXDEV' },
        BACKUPS
      )
    ).toEqual([`  ${SKILLS}/orca: Failed: EXDEV`])
  })
})
