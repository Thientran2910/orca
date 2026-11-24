import { writeFile } from 'node:fs/promises'
import { dirname, join } from 'node:path'
import { afterEach, describe, expect, it } from 'vitest'
import {
  nativeBundledSkillFilesystem,
  type BundledSkillFilesystem
} from './bundled-skill-filesystem'
import {
  autoUpdateInstalledBundledSkills,
  previewBundledSkillInstall
} from './bundled-skill-installation'
import {
  makeSkillHome,
  NAME,
  NEW_SOURCE,
  NEW_TEXT,
  OLD_TEXT,
  removeSkillHomes,
  serviceInput,
  snapshot,
  writeCopy,
  type SkillHome
} from './testing/bundled-skill-home'

afterEach(removeSkillHomes)

const ALIAS = 'former-skill'

/** A current shared copy and a released copy under a former name, so the update retires it. */
async function currentSharedWithFormerName(home: SkillHome) {
  await writeCopy(home.shared, NEW_TEXT)
  await writeCopy(join(dirname(home.claude), ALIAS), OLD_TEXT)
  return {
    ...serviceInput(home, { agents: ['claude'], installedOnly: true }),
    sources: [{ ...NEW_SOURCE, aliases: [ALIAS] }]
  }
}

/** Changes the shared copy right before the run rechecks it (the plan's own read is the first). */
function changingSharedFilesystem(home: SkillHome): BundledSkillFilesystem {
  const shared = join(home.shared, 'SKILL.md')
  let reads = 0
  return {
    ...nativeBundledSkillFilesystem,
    readFile: async (path, maxBytes) => {
      if (path === shared && ++reads === 2) {
        await writeFile(shared, 'changed after planning\n')
      }
      return nativeBundledSkillFilesystem.readFile(path, maxBytes)
    }
  }
}

describe('automatic update digest marker', () => {
  it('records no marker from the locked plan once the run found the current copy changed', async () => {
    const home = await makeSkillHome()
    const input = await currentSharedWithFormerName(home)
    const plan = await previewBundledSkillInstall(input)
    expect(plan.skills[0].ops.map((op) => op.kind)).toEqual(['keep', 'link'])
    const result = await autoUpdateInstalledBundledSkills({
      ...input,
      filesystem: changingSharedFilesystem(home),
      names: [NAME]
    })
    expect(result.skills[0].ops.map((op) => [op.kind, op.status])).toEqual([
      ['keep', 'changed'],
      ['link', 'skipped']
    ])
    expect(await snapshot(join(home.home, '.agents', '.orca-skill-digests'))).toBe('missing')
  })

  it('still records a marker for a current copy on a record-only call', async () => {
    const home = await makeSkillHome()
    await writeCopy(home.shared, NEW_TEXT)
    const input = serviceInput(home, { agents: [], installedOnly: true })
    const plan = await previewBundledSkillInstall(input)
    await autoUpdateInstalledBundledSkills({ ...input, names: [NAME], recordOnly: true })
    expect(await snapshot(join(home.home, '.agents', '.orca-skill-digests', NAME))).not.toBe(
      'missing'
    )
    expect(plan.skills[0].ops[0].kind).toBe('keep')
  })
})
