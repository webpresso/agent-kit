import { cpSync, existsSync, mkdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import path from 'node:path'

import { afterEach, describe, expect, it, vi } from 'vitest'

import { cleanupExternalGstackCheckout, ensureGstack, type EnsureGstackInput } from './index.js'

const roots: string[] = []
function tmpRoot(): string {
  const root = path.join(tmpdir(), `gstack-installer-${Date.now()}-${Math.random().toString(16).slice(2)}`)
  roots.push(root)
  mkdirSync(root, { recursive: true })
  return root
}

function packageFixture(root: string): string {
  const packageRoot = path.join(root, 'pkg')
  mkdirSync(path.join(packageRoot, 'catalog/agent'), { recursive: true })
  cpSync(path.resolve('catalog/agent/skills'), path.join(packageRoot, 'catalog/agent/skills'), { recursive: true })
  return packageRoot
}

function input(overrides: Partial<EnsureGstackInput> = {}): EnsureGstackInput {
  const root = tmpRoot()
  return {
    repoRoot: root,
    packageRoot: packageFixture(root),
    installRoot: path.join(root, 'home/.claude/skills/gstack'),
    claudeSkillsRoot: path.join(root, 'home/.claude/skills'),
    codexConfigPath: path.join(root, 'home/.codex/config.toml'),
    codexSkillsRoot: path.join(root, 'home/.codex/skills'),
    options: { overwrite: false, dryRun: false },
    ...overrides,
  }
}

afterEach(() => {
  vi.restoreAllMocks()
  for (const root of roots.splice(0)) rmSync(root, { recursive: true, force: true })
})

describe('ensureGstack', () => {
  it('installs Webpresso-owned Claude skills without cloning upstream', async () => {
    const spawn = vi.fn()
    const result = await ensureGstack(input({ detectCodex: () => false }) as EnsureGstackInput & { spawn: typeof spawn })

    expect(result).toEqual({
      kind: 'gstack-installed',
      root: expect.stringContaining('.claude/skills'),
      codex: { kind: 'gstack-codex-skipped', reason: 'not-detected', skillsRoot: expect.stringContaining('.codex/skills') },
    })
    expect(spawn).not.toHaveBeenCalled()
    expect(existsSync(path.join(result.kind === 'gstack-installed' ? result.root : '', 'review/SKILL.md'))).toBe(true)
  })

  it('installs Codex skills when Codex is detected', async () => {
    const testInput = input({ detectCodex: () => true })
    const result = await ensureGstack(testInput)

    expect(result.kind).toBe('gstack-installed')
    expect('codex' in result && result.codex.kind).toBe('gstack-codex-installed')
    expect(existsSync(path.join(testInput.codexSkillsRoot!, 'claude/SKILL.md'))).toBe(true)
  })

  it('refuses to shadow existing non-Webpresso skills', async () => {
    const testInput = input({ detectCodex: () => false })
    mkdirSync(path.join(testInput.claudeSkillsRoot!, 'review'), { recursive: true })
    writeFileSync(path.join(testInput.claudeSkillsRoot!, 'review/SKILL.md'), 'other review')

    const result = await ensureGstack(testInput)

    expect(result).toEqual({
      kind: 'gstack-setup-failed',
      command: 'webpresso-skill-install',
      exitCode: 1,
      reason: 'collision',
      logPath: 'skill-collision-audit',
      collisions: [{ host: 'claude', name: 'review', path: path.join(testInput.claudeSkillsRoot!, 'review/SKILL.md') }],
    })
    expect(readFileSync(path.join(testInput.claudeSkillsRoot!, 'review/SKILL.md'), 'utf8')).toBe('other review')
  })

  it('does not remove external checkout unless explicit cleanup is set', async () => {
    const testInput = input({ detectCodex: () => false, log: vi.fn() })
    mkdirSync(testInput.installRoot!, { recursive: true })

    await ensureGstack(testInput)

    expect(existsSync(testInput.installRoot!)).toBe(true)
    expect(testInput.log).toHaveBeenCalledWith(expect.stringContaining('external checkout left in place'))
  })

  it('backs up external checkout when explicit cleanup is set', async () => {
    const testInput = input({ detectCodex: () => false, env: { WP_GSTACK_CLEANUP_EXTERNAL: '1' } as NodeJS.ProcessEnv, now: () => Date.UTC(2026, 5, 20) })
    mkdirSync(testInput.installRoot!, { recursive: true })

    await ensureGstack(testInput)

    const expectedBackupPath = path.join(
      path.dirname(path.dirname(testInput.installRoot!)),
      'skills-backup',
      'gstack.backup-2026-06-20T00-00-00-000Z',
    )
    expect(existsSync(testInput.installRoot!)).toBe(false)
    expect(existsSync(expectedBackupPath)).toBe(true)
    expect(expectedBackupPath).not.toContain(`${path.sep}skills${path.sep}gstack.backup-`)
  })
})

describe('cleanupExternalGstackCheckout', () => {
  it('supports dry-run, refusal, backup, and idempotent missing behavior', () => {
    const root = path.join(tmpRoot(), 'gstack')
    expect(cleanupExternalGstackCheckout({ externalRoot: root, dryRun: false, explicit: true }).kind).toBe('skipped-not-present')
    mkdirSync(root, { recursive: true })
    expect(cleanupExternalGstackCheckout({ externalRoot: root, dryRun: true, explicit: true }).kind).toBe('dry-run')
    expect(cleanupExternalGstackCheckout({ externalRoot: root, dryRun: false, explicit: false }).kind).toBe('refused')
    const result = cleanupExternalGstackCheckout({ externalRoot: root, dryRun: false, explicit: true, now: () => 0 })
    expect(result.kind).toBe('backed-up')
    expect(result.backupPath).toBe(path.join(path.dirname(root), '.gstack-backups', 'gstack.backup-1970-01-01T00-00-00-000Z'))
  })
})
