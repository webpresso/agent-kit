/**
 * Spawn tests for scripts/migration-notice.ts.
 *
 * D14: verifies CI=true silences output; no CI → warning includes migration URL.
 *
 * Covered paths:
 *   - CI not set → stderr contains migration URL, exits 0
 *   - CI=true  → stderr is empty, exits 0
 */
import { spawnSync } from 'node:child_process'
import { resolve, dirname } from 'node:path'
import { fileURLToPath } from 'node:url'
import { describe, expect, it } from 'vitest'

const repoRoot = resolve(dirname(fileURLToPath(import.meta.url)), '..')
const SCRIPT_PATH = resolve(repoRoot, 'scripts', 'migration-notice.ts')

describe('scripts/migration-notice.ts', () => {
  it('exits 0 and prints migration URL to stderr when CI is not set', () => {
    const { CI: _ci, ...envWithoutCI } = process.env
    const result = spawnSync('bun', [SCRIPT_PATH], {
      encoding: 'utf8',
      env: envWithoutCI,
      timeout: 15_000,
    })

    expect(result.status).toBe(0)
    expect(result.stderr).toContain('https://github.com/webpresso/agent-kit/blob/main/MIGRATION.md')
  })

  it('exits 0 and prints nothing to stderr when CI=true', () => {
    const result = spawnSync('bun', [SCRIPT_PATH], {
      encoding: 'utf8',
      env: { ...process.env, CI: 'true' },
      timeout: 15_000,
    })

    expect(result.status).toBe(0)
    expect(result.stderr.trim()).toBe('')
  })

  it('exits 0 and prints nothing to stderr when CI=1', () => {
    const result = spawnSync('bun', [SCRIPT_PATH], {
      encoding: 'utf8',
      env: { ...process.env, CI: '1' },
      timeout: 15_000,
    })

    expect(result.status).toBe(0)
    expect(result.stderr.trim()).toBe('')
  })

  it('includes the deprecated package name in the migration message', () => {
    const { CI: _ci, ...envWithoutCI } = process.env
    const result = spawnSync('bun', [SCRIPT_PATH], {
      encoding: 'utf8',
      env: envWithoutCI,
      timeout: 15_000,
    })

    expect(result.stderr).toContain('@webpresso/agent-kit')
    expect(result.stderr).toContain('npm i -g webpresso')
  })
})
