import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import path from 'node:path'

import { afterEach, describe, expect, it } from 'vitest'

import { auditAtomicStateWrites } from './atomic-state-writes.js'

const dirs: string[] = []

function fixture(): string {
  const root = mkdtempSync(path.join(tmpdir(), 'ak-atomic-state-audit-'))
  dirs.push(root)
  return root
}

function writeFixture(root: string, relativePath: string, source: string): void {
  const file = path.join(root, relativePath)
  mkdirSync(path.dirname(file), { recursive: true })
  writeFileSync(file, source, 'utf8')
}

afterEach(() => {
  while (dirs.length > 0) rmSync(dirs.pop()!, { recursive: true, force: true })
})

describe('auditAtomicStateWrites', () => {
  it('flags bare writeFileSync in state-bearing modules', () => {
    const root = fixture()
    writeFixture(
      root,
      'src/blueprint/freshness.ts',
      "import { writeFileSync } from 'node:fs'\nwriteFileSync(path, '{}')\n",
    )

    const result = auditAtomicStateWrites(root)

    expect(result.ok).toBe(false)
    expect(result.violations).toEqual([
      {
        file: 'src/blueprint/freshness.ts',
        message: 'state-bearing writes must use writeFileAtomic or writeJsonFile({ atomic: true })',
      },
    ])
  })

  it('flags non-atomic writeJsonFile in state-bearing modules', () => {
    const root = fixture()
    writeFixture(
      root,
      'src/hooks/guard-switch/state.ts',
      'writeJsonFile(path, data, { indent: 0 })\n',
    )

    const result = auditAtomicStateWrites(root)

    expect(result.ok).toBe(false)
    expect(result.violations).toEqual([
      {
        file: 'src/hooks/guard-switch/state.ts',
        message: 'state-bearing writeJsonFile calls must pass { atomic: true }',
      },
    ])
  })

  it('does not flag writeFileSync in a line comment', () => {
    const root = fixture()
    writeFixture(
      root,
      'src/blueprint/freshness.ts',
      "// writeFileSync(path, '{}')\nwriteFileAtomic(path, content)\n",
    )
    const result = auditAtomicStateWrites(root)
    expect(result.ok).toBe(true)
    expect(result.violations).toStrictEqual([])
  })

  it('does not flag writeFileSync in a block comment', () => {
    const root = fixture()
    writeFixture(
      root,
      'src/blueprint/freshness.ts',
      "/* writeFileSync(path, '{}') */\nwriteFileAtomic(path, content)\n",
    )
    const result = auditAtomicStateWrites(root)
    expect(result.ok).toBe(true)
    expect(result.violations).toStrictEqual([])
  })

  it('passes atomic helper usage', () => {
    const root = fixture()
    writeFixture(root, 'src/mcp/blueprint-server.ts', "writeFileAtomic(path, content, 'utf8')\n")
    writeFixture(
      root,
      'src/hooks/guard-switch/state.ts',
      'writeJsonFile(path, data, { atomic: true, indent: 0 })\n',
    )

    const result = auditAtomicStateWrites(root)

    expect(result).toMatchObject({ ok: true, checked: 2, violations: [] })
  })
})
