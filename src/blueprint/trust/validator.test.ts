import { mkdtempSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import path from 'node:path'
import { afterEach, describe, expect, it } from 'vitest'
import { validateBlueprintTrust } from './validator.js'
import { VALID_DOSSIER } from './test-fixtures.js'
const dirs: string[] = []
function root() {
  const dir = mkdtempSync(path.join(tmpdir(), 'trust-validator-'))
  dirs.push(dir)
  writeFileSync(path.join(dir, 'README.md'), '# ok')
  return dir
}
afterEach(() => {
  while (dirs.length) rmSync(dirs.pop()!, { recursive: true, force: true })
})

describe('validateBlueprintTrust', () => {
  it('allows draft opt-out and requires planned dossiers', () => {
    const dir = root()
    expect(
      validateBlueprintTrust({ repoRoot: dir, file: 'x.md', status: 'draft', markdown: '' }).ok,
    ).toBe(true)
    expect(
      validateBlueprintTrust({ repoRoot: dir, file: 'x.md', status: 'planned', markdown: '' }).ok,
    ).toBe(false)
  })
  it('passes valid executable dossiers', () => {
    const dir = root()
    expect(
      validateBlueprintTrust({
        repoRoot: dir,
        file: 'x.md',
        status: 'planned',
        markdown: VALID_DOSSIER,
      }).ok,
    ).toBe(true)
  })
})
