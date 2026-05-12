/**
 * Integration test for `scripts/publish-webpresso.ts --dry-run`.
 *
 * Strategy: actually spawn the bun script with --dry-run against the real
 * package.json in this repo. Verifies:
 *   - exit code 0
 *   - D15: staging dir is removed after run (try/finally cleanup)
 *   - dry-run marker is present in stdout
 *
 * Added to vitest.stryker.config.ts exclusions per repo rule:
 * spawns a bun subprocess (cold-start); not suitable for the Stryker forks pool.
 */
import { existsSync } from 'node:fs'
import { spawnSync } from 'node:child_process'
import { resolve, dirname } from 'node:path'
import { fileURLToPath } from 'node:url'
import { describe, expect, it } from 'vitest'

const repoRoot = resolve(dirname(fileURLToPath(import.meta.url)), '..')
const SCRIPT_PATH = resolve(repoRoot, 'scripts', 'publish-webpresso.ts')
const STAGING_DIR = resolve(repoRoot, 'dist-publish')

describe('scripts/publish-webpresso.ts --dry-run (integration)', () => {
  it('exits 0 and removes staging dir after dry-run', () => {
    const result = spawnSync('bun', [SCRIPT_PATH, '--dry-run'], {
      cwd: repoRoot,
      encoding: 'utf8',
      // Unset NPM_TOKEN so no .npmrc is written during the test
      env: { ...process.env, NPM_TOKEN: '' },
      timeout: 30_000,
    })

    expect(result.status, `stderr: ${result.stderr}\nstdout: ${result.stdout}`).toBe(0)
    // D15: staging dir must be cleaned up
    expect(existsSync(STAGING_DIR)).toBe(false)
  })

  it('prints [dry-run] marker to stdout', () => {
    const result = spawnSync('bun', [SCRIPT_PATH, '--dry-run'], {
      cwd: repoRoot,
      encoding: 'utf8',
      env: { ...process.env, NPM_TOKEN: '' },
      timeout: 30_000,
    })

    expect(result.stdout).toContain('[dry-run]')
  })

  it('staging dir does not leak to repo root after error path', () => {
    // Even if a prior run somehow left staging dir behind, it should not exist
    // after a clean --dry-run invocation (the finally block removes it)
    spawnSync('bun', [SCRIPT_PATH, '--dry-run'], {
      cwd: repoRoot,
      encoding: 'utf8',
      env: { ...process.env, NPM_TOKEN: '' },
      timeout: 30_000,
    })

    expect(existsSync(STAGING_DIR)).toBe(false)
  })
})
