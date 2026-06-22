import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import path from 'node:path'
import { afterEach, describe, expect, it } from 'vitest'
import { auditBlueprintTrust } from './blueprint-trust.js'
import { VALID_DOSSIER } from '../blueprint/trust/test-fixtures.js'
const dirs: string[] = []
function fixture() {
  const dir = mkdtempSync(path.join(tmpdir(), 'blueprint-trust-'))
  dirs.push(dir)
  writeFileSync(path.join(dir, 'README.md'), '# ok')
  return dir
}
function write(root: string, rel: string, body: string) {
  const f = path.join(root, rel)
  mkdirSync(path.dirname(f), { recursive: true })
  writeFileSync(f, body)
}
afterEach(() => {
  while (dirs.length) rmSync(dirs.pop()!, { recursive: true, force: true })
})

describe('auditBlueprintTrust', () => {
  it('ignores draft and reports executable violations', () => {
    const root = fixture()
    write(root, 'blueprints/draft/idea.md', '---\nstatus: draft\n---\n')
    write(root, 'blueprints/planned/bad.md', '---\nstatus: planned\n---\n')
    write(root, 'blueprints/planned/bad/support.md', 'support docs do not need dossiers')
    const result = auditBlueprintTrust(root)
    expect(result.ok).toBe(false)
    expect(result.checked).toBe(1)
  })

  it('requires dossiers for canonical docs in executable directories even when frontmatter claims draft', () => {
    const root = fixture()
    write(root, 'blueprints/planned/lying.md', '---\nstatus: draft\n---\n')
    const result = auditBlueprintTrust(root)
    expect(result.ok).toBe(false)
    expect(result.violations[0]?.file).toBe('blueprints/planned/lying.md')
  })

  it('fails executable blueprints with ambiguous task sections', () => {
    const root = fixture()
    write(
      root,
      'blueprints/planned/ambiguous.md',
      `---
status: planned
---

#### Task Ship it

**Status:** todo

TODO decide during implementation
${VALID_DOSSIER}`,
    )
    const result = auditBlueprintTrust(root)
    expect(result.ok).toBe(false)
    expect(result.violations.some((violation) => /task sections/i.test(violation.message))).toBe(
      true,
    )
  })

  it('passes valid planned dossiers', () => {
    const root = fixture()
    write(root, 'blueprints/planned/good.md', `---\nstatus: planned\n---\n${VALID_DOSSIER}`)
    expect(auditBlueprintTrust(root)).toMatchObject({ ok: true, checked: 1, violations: [] })
  })
})
