import { mkdtempSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import path from 'node:path'
import { afterEach, describe, expect, it } from 'vitest'
import { parseTrustDossier } from './dossier.js'
import { validateTrustEvidence } from './evidence.js'
import { VALID_DOSSIER } from './test-fixtures.js'

const dirs: string[] = []
function root() {
  const dir = mkdtempSync(path.join(tmpdir(), 'trust-evidence-'))
  dirs.push(dir)
  writeFileSync(path.join(dir, 'README.md'), '# ok')
  return dir
}
afterEach(() => {
  while (dirs.length) rmSync(dirs.pop()!, { recursive: true, force: true })
})

describe('validateTrustEvidence', () => {
  it('accepts repo, web, and derived evidence', () => {
    const dir = root()
    const md = VALID_DOSSIER.replace(
      '| C1 | Parser exists | repo:README.md |',
      '| C2 | Second claim | repo:README.md |\n| C1 | Parser exists | repo:README.md; web:https://example.com (2026-06-22); derived:C2 |',
    )
    const dossier = parseTrustDossier(md).dossier!
    expect(validateTrustEvidence(dir, dossier)).toEqual([])
  })

  it('rejects missing repo paths and derived cycles', () => {
    const dir = root()
    const md = VALID_DOSSIER.replace('repo:README.md', 'repo:missing.md; derived:C1')
    const dossier = parseTrustDossier(md).dossier!
    const errors = validateTrustEvidence(dir, dossier).map((v) => v.message)
    expect(errors.join('\n')).toMatch(/does not exist|self/)
  })
})
