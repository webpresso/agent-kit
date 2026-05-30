import { mkdtempSync, mkdirSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import path from 'node:path'
import { afterEach, describe, expect, it } from 'vitest'

import {
  getBlueprintPathViolation,
  isCanonicalBlueprintDocumentPath,
  isCanonicalBlueprintOverviewPath,
} from './path-contract.js'

const tempDirs: string[] = []

afterEach(() => {
  for (const dir of tempDirs.splice(0)) {
    rmSync(dir, { recursive: true, force: true })
  }
})

function tempRepo(): string {
  const root = mkdtempSync(path.join(tmpdir(), 'wp-path-contract-'))
  tempDirs.push(root)
  return root
}

describe('path-contract', () => {
  it('recognizes both flat and folder canonical blueprint documents', () => {
    expect(isCanonicalBlueprintDocumentPath('blueprints/planned/my-feature.md')).toBe(true)
    expect(isCanonicalBlueprintDocumentPath('blueprints/planned/my-feature/_overview.md')).toBe(
      true,
    )
    expect(isCanonicalBlueprintOverviewPath('blueprints/planned/my-feature/_overview.md')).toBe(
      true,
    )
    expect(isCanonicalBlueprintOverviewPath('blueprints/planned/my-feature.md')).toBe(false)
  })

  it('rejects supporting markdown when the folder shape has no _overview.md', () => {
    const root = tempRepo()
    mkdirSync(path.join(root, 'blueprints', 'planned', 'my-feature'), { recursive: true })
    writeFileSync(path.join(root, 'blueprints', 'planned', 'my-feature', 'notes.md'), '# notes')

    const violation = getBlueprintPathViolation(
      'blueprints/planned/my-feature/notes.md',
      undefined,
      root,
    )
    expect(violation).toContain('requires blueprints/planned/my-feature/_overview.md')
  })

  it('rejects duplicate flat and folder canonical shapes for the same slug', () => {
    const root = tempRepo()
    mkdirSync(path.join(root, 'blueprints', 'planned', 'my-feature'), { recursive: true })
    writeFileSync(path.join(root, 'blueprints', 'planned', 'my-feature.md'), '# flat')
    writeFileSync(
      path.join(root, 'blueprints', 'planned', 'my-feature', '_overview.md'),
      '# folder',
    )

    const violation = getBlueprintPathViolation(
      'blueprints/planned/my-feature.md',
      undefined,
      root,
    )
    expect(violation).toContain('cannot exist in both flat and folder forms')
  })
})
