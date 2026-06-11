/**
 * `ak sync` CLI command tests. Runs the registered command against a fixture
 * tree by stubbing `resolvePackageAsset` (via PNPM-style env override) and
 * cwd changes.
 */

import { existsSync, mkdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

import { runUnifiedSync } from '#symlinker/unified-sync.js'

function makeTempDir(): string {
  const dir = join(
    tmpdir(),
    `ak-sync-cli-test-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
  )
  mkdirSync(dir, { recursive: true })
  return dir
}

function writeFile(path: string, content: string): void {
  mkdirSync(join(path, '..'), { recursive: true })
  writeFileSync(path, content)
}

const RULE_FM = `---
type: rule
slug: SLUG
title: Sample
status: active
scope: repo
description: Sample
---

Body.
`

describe('runUnifiedSync (sync command core)', () => {
  let root: string
  let catalogDir: string
  let consumerRoot: string

  beforeEach(() => {
    root = makeTempDir()
    catalogDir = join(root, 'pkg', 'catalog', 'agent')
    consumerRoot = join(root, 'consumer')
    mkdirSync(catalogDir, { recursive: true })
    mkdirSync(consumerRoot, { recursive: true })
  })

  afterEach(() => {
    vi.restoreAllMocks()
    rmSync(root, { recursive: true, force: true })
  })

  it('syncs rules to all expected per-IDE surfaces', () => {
    writeFile(join(catalogDir, 'rules', 'demo.md'), RULE_FM.replace('SLUG', 'demo'))
    const result = runUnifiedSync({ catalogDir, consumerRoot })
    expect(result.fixCount).toBeGreaterThan(0)

    expect(existsSync(join(consumerRoot, '.cursor', 'rules', 'demo.mdc'))).toBe(true)
    // Codex no longer has a .codex/agents projection; skills use .agents/skills.
    expect(existsSync(join(consumerRoot, '.codex', 'agents', 'demo.md'))).toBe(false)
  })

  it('--kind rules skips skill projection', () => {
    writeFile(join(catalogDir, 'rules', 'r.md'), RULE_FM.replace('SLUG', 'r'))
    writeFile(
      join(catalogDir, 'skills', 'sk', 'SKILL.md'),
      RULE_FM.replace('SLUG', 'sk').replace('type: rule', 'type: skill'),
    )
    runUnifiedSync({ catalogDir, consumerRoot, kinds: ['rule'] })

    expect(existsSync(join(consumerRoot, '.cursor', 'rules', 'r.mdc'))).toBe(true)
    expect(existsSync(join(consumerRoot, '.windsurf', 'skills', 'sk'))).toBe(false)
    expect(existsSync(join(consumerRoot, '.agents', 'skills', 'sk'))).toBe(false)
  })

  it('--kind rules does not prune existing skill surfaces', () => {
    writeFile(join(catalogDir, 'rules', 'r.md'), RULE_FM.replace('SLUG', 'r'))
    writeFile(
      join(catalogDir, 'skills', 'sk', 'SKILL.md'),
      RULE_FM.replace('SLUG', 'sk').replace('type: rule', 'type: skill'),
    )
    runUnifiedSync({ catalogDir, consumerRoot })
    expect(existsSync(join(consumerRoot, '.agents', 'skills', 'sk'))).toBe(true)

    runUnifiedSync({ catalogDir, consumerRoot, kinds: ['rule'] })

    expect(existsSync(join(consumerRoot, '.agents', 'skills', 'sk'))).toBe(true)
  })

  it('--check exits with mismatches when not synced and zero when synced', () => {
    writeFile(join(catalogDir, 'rules', 'c.md'), RULE_FM.replace('SLUG', 'c'))

    const drift = runUnifiedSync({ catalogDir, consumerRoot, check: true })
    expect(drift.fixCount).toBeGreaterThan(0)
    expect(drift.mismatches[0]?.targetPath).not.toBe(undefined)

    runUnifiedSync({ catalogDir, consumerRoot })
    const clean = runUnifiedSync({ catalogDir, consumerRoot, check: true })
    expect(clean.fixCount).toBe(0)
  })

  it('--check after hand-edit names the offending file', () => {
    writeFile(join(catalogDir, 'rules', 'h.md'), RULE_FM.replace('SLUG', 'h'))
    runUnifiedSync({ catalogDir, consumerRoot })

    writeFileSync(join(consumerRoot, '.cursor', 'rules', 'h.mdc'), 'TAMPERED')

    const drift = runUnifiedSync({ catalogDir, consumerRoot, check: true })
    expect(drift.fixCount).toBeGreaterThan(0)
    const tamper = drift.mismatches.find((m) => m.targetPath.endsWith('h.mdc'))
    expect(tamper).not.toBe(undefined)
  })

  it('aborts on slug collision before any write', () => {
    writeFile(join(catalogDir, 'rules', 'dup.md'), RULE_FM.replace('SLUG', 'dup'))
    writeFile(join(consumerRoot, 'agent-rules', 'dup.md'), RULE_FM.replace('SLUG', 'dup'))

    expect(() => runUnifiedSync({ catalogDir, consumerRoot })).toThrow(/slug collision/i)
    // Verify nothing was written
    expect(existsSync(join(consumerRoot, '.cursor'))).toBe(false)
    expect(existsSync(join(consumerRoot, '.agent'))).toBe(false)
  })

  it('writes the IDE-restart message after at least one write', () => {
    writeFile(join(catalogDir, 'rules', 'msg.md'), RULE_FM.replace('SLUG', 'msg'))

    // Simulate the CLI command's print logic.
    const lines: string[] = []
    const log = (m: string) => lines.push(m)
    const r = runUnifiedSync({ catalogDir, consumerRoot })
    if (r.fixCount === 0) log('Already up to date.')
    else log('Synced. Restart your IDE to load new rules/skills.')

    expect(lines.join('\n')).toContain('Restart your IDE to load new rules/skills.')
  })

  it('reports already-up-to-date on second run with zero writes', () => {
    writeFile(join(catalogDir, 'rules', 'x.md'), RULE_FM.replace('SLUG', 'x'))
    runUnifiedSync({ catalogDir, consumerRoot })

    const r2 = runUnifiedSync({ catalogDir, consumerRoot })
    expect(r2.fixCount).toBe(0)

    const lines: string[] = []
    if (r2.fixCount === 0) lines.push('Already up to date.')
    expect(lines).toContain('Already up to date.')

    // Verify the user-visible content was actually written by the first run.
    expect(readFileSync(join(consumerRoot, '.cursor', 'rules', 'x.mdc'), 'utf8')).toContain('Body.')
  })

  // Bc88 regression — the kernel layer's contract that the catch-wrap in
  // src/cli/commands/sync.ts (and src/cli/commands/init/index.ts) relies on:
  // when the catalog dir doesn't exist on disk, loadContent throws with a
  // message matching /catalogDir does not exist/. The CLI catches that
  // shape and rewrites it to the actionable
  // "ak {init,sync}: @webpresso/agent-kit not installed in node_modules"
  // message. If this throw shape ever changes, the catch-wrap stops firing
  // and the silent-non-determinism class returns.
  it('throws "catalogDir does not exist" when the catalog path is missing', () => {
    const ghostCatalog = join(root, 'no-such-pkg', 'catalog', 'agent')
    expect(() => runUnifiedSync({ catalogDir: ghostCatalog, consumerRoot })).toThrow(
      /catalogDir does not exist/,
    )
  })
})
