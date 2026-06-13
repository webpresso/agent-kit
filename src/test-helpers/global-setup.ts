import { execFileSync } from 'node:child_process'
import { existsSync } from 'node:fs'
import { join } from 'node:path'

import { loadNativeSessionMemoryEngine } from '#session-memory/native-runtime'

const REPO_ROOT = process.cwd()
const DIST_SENTINEL = join(REPO_ROOT, 'dist', 'esm', 'index.js')
const MIGRATION_SENTINEL = join(
  REPO_ROOT,
  'dist',
  'esm',
  'blueprint',
  'db',
  'migrations',
  '0001_seed.sql',
)

// Build before workers fork — tshy's non-atomic package.json write races with bun subprocess reads in init.e2e.test.ts.
export function setup(): void {
  let builtDist = false
  if (!existsSync(DIST_SENTINEL)) {
    execFileSync('./node_modules/.bin/tshy', [], {
      cwd: REPO_ROOT,
      encoding: 'utf8',
      env: { ...process.env, HUSKY: '0' },
    })
    builtDist = true
  }
  if (!existsSync(MIGRATION_SENTINEL)) {
    execFileSync('bun', ['src/build/blueprint-migration-assets.ts'], {
      cwd: REPO_ROOT,
      encoding: 'utf8',
      env: { ...process.env, HUSKY: '0' },
    })
  }
  if (builtDist) {
    execFileSync('bun', ['src/build/normalize-tsconfig-json-exports.ts'], {
      cwd: REPO_ROOT,
      encoding: 'utf8',
      env: { ...process.env, HUSKY: '0' },
    })
  }

  // Pre-warm the native session-memory addon before the Vitest worker pool forks.
  // Otherwise multiple workers can all pay the first-use cargo build cost inside
  // per-test hooks, which trips the default 10s hook budget in CI.
  loadNativeSessionMemoryEngine()
}
