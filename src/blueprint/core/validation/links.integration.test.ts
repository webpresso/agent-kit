import { mkdtempSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'

import { checkChangelog } from './links.js'

describe('plan links validation (integration)', () => {
  let tempDir: string

  beforeAll(() => {
    tempDir = mkdtempSync(join(tmpdir(), 'links-'))
  })

  afterAll(() => {
    rmSync(tempDir, { recursive: true, force: true })
  })

  it('detects changelog file exists', () => {
    const changelogPath = join(tempDir, 'CHANGELOG.md')
    writeFileSync(changelogPath, '# Changelog\n## 1.0.0\n- Initial release\n')
    const result = checkChangelog(changelogPath)
    expect(result.hasChangelog).toBe(true)
  })

  it('returns result for any path', () => {
    const result = checkChangelog(join(tempDir, 'nonexistent.md'))
    expect(result).toHaveProperty('hasChangelog')
  })
})
