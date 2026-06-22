import { mkdirSync, mkdtempSync, rmSync, symlinkSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterEach, describe, expect, test } from 'vitest'

import {
  auditAbsolutePathPolicy,
  findAbsolutePathPolicyViolationsInText,
} from './absolute-path-policy.js'

const tempDirs: string[] = []

function tempRepo(): string {
  const root = mkdtempSync(join(tmpdir(), 'wp-absolute-path-policy-'))
  tempDirs.push(root)
  return root
}

describe('auditAbsolutePathPolicy', () => {
  afterEach(() => {
    for (const dir of tempDirs.splice(0)) {
      rmSync(dir, { recursive: true, force: true })
    }
  })

  test('flags hardcoded relative traversal in executable code', () => {
    const root = tempRepo()
    mkdirSync(join(root, 'src'), { recursive: true })
    writeFileSync(
      join(root, 'src', 'bad.ts'),
      "import path from 'node:path'\nconst fixturePath = path.join(import.meta.dirname, '../fixtures/data.json')\n",
      'utf8',
    )

    const result = auditAbsolutePathPolicy(root)
    expect(result.ok).toBe(false)
    expect(result.violations).toEqual([
      expect.objectContaining({
        file: 'src/bad.ts',
        message: expect.stringContaining('hardcoded relative filesystem path'),
      }),
    ])
  })

  test('accepts anchored absolute-path derivation', () => {
    const root = tempRepo()
    mkdirSync(join(root, 'src'), { recursive: true })
    writeFileSync(
      join(root, 'src', 'good.ts'),
      "import path from 'node:path'\nexport function fromRepoRoot(repoRoot: string) { return path.join(repoRoot, 'fixtures/data.json') }\n",
      'utf8',
    )

    const result = auditAbsolutePathPolicy(root)
    expect(result.ok).toBe(true)
    expect(result.violations).toEqual([])
  })

  test('ignores comments that mention forbidden patterns', () => {
    const result = findAbsolutePathPolicyViolationsInText(
      'src/example.ts',
      "// resolve(import.meta.dirname, '../fixtures/data.json')\n",
    )
    expect(result).toEqual([])
  })

  test('skips broken symlink entries without crashing', () => {
    const root = tempRepo()
    mkdirSync(join(root, '.github'), { recursive: true })
    mkdirSync(join(root, 'apps', 'e2e'), { recursive: true })
    symlinkSync('../.agents/skills', join(root, '.github', 'skills'))
    symlinkSync(
      '../../packages/sdk/schema-engine/generated',
      join(root, 'apps', 'e2e', '.schema-engine-generated'),
    )
    mkdirSync(join(root, 'src'), { recursive: true })
    writeFileSync(join(root, 'src', 'good.ts'), 'export const ok = true\n', 'utf8')

    const result = auditAbsolutePathPolicy(root)
    expect(result.ok).toBe(true)
    expect(result.violations).toEqual([])
    expect(result.checked).toBe(1)
  })
})
