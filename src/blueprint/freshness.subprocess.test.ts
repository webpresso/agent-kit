import { execFileSync } from 'node:child_process'
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import path from 'node:path'

import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it } from 'vitest'

import {
  checkFreshness,
  readProjectionMetadata,
  recordProjectionMetadata,
  type ProjectionMetadata,
} from './freshness.js'
import type { BlueprintProjectLike } from './freshness.js'

// ---------------------------------------------------------------------------
// Test helpers
// ---------------------------------------------------------------------------

let tmp: string
let repo: string
let dbPath: string

// One immutable git repo shared by every read-only test. Each `git` call is a
// synchronous subprocess; re-initializing a repo per test (init + add + commit)
// is the dominant cost in this file and, multiplied across the suite's fork
// pool, is exactly the subprocess oversubscription that pushes otherwise-correct
// tests past the 10s budget (see vitest.config.ts maxWorkers note). Tests that
// MUTATE HEAD or need a non-git dir still create their own repo below.
let sharedRepo: string
let sharedRepoTmp: string
let sharedHead: string

const FAST_GIT_ENV = {
  ...process.env,
  GIT_AUTHOR_EMAIL: 'test@example.com',
  GIT_AUTHOR_NAME: 'Freshness Test',
  GIT_COMMITTER_EMAIL: 'test@example.com',
  GIT_COMMITTER_NAME: 'Freshness Test',
  GIT_CONFIG_COUNT: '3',
  GIT_CONFIG_GLOBAL: '/dev/null',
  GIT_CONFIG_KEY_0: 'core.fsync',
  GIT_CONFIG_KEY_1: 'commit.gpgsign',
  GIT_CONFIG_KEY_2: 'tag.gpgsign',
  GIT_CONFIG_NOSYSTEM: '1',
  GIT_CONFIG_VALUE_0: 'none',
  GIT_CONFIG_VALUE_1: 'false',
  GIT_CONFIG_VALUE_2: 'false',
}

function git(at: string, args: readonly string[]): string {
  // Bounded so a contended subprocess fails loudly and fast instead of silently
  // eating the whole 10s per-test budget (no-timeout-as-fix: surface the stall).
  return execFileSync('git', [...args], {
    cwd: at,
    encoding: 'utf8',
    env: FAST_GIT_ENV,
    timeout: 8_000,
  }).trim()
}

// Minimal HEAD: `init` + one empty commit — two spawns, no working-tree write.
function initGitRepo(at: string): string {
  git(at, ['init', '-q', '-b', 'main'])
  git(at, ['commit', '-q', '--allow-empty', '-m', 'init'])
  return git(at, ['rev-parse', 'HEAD'])
}

function makeDbFile(): void {
  // We don't need a real DB to test the freshness side; the metadata sidecar
  // is decoupled. Just create a non-empty file at dbPath so existsSync passes.
  writeFileSync(dbPath, '\x00')
}

function project(overrides?: Partial<BlueprintProjectLike>): BlueprintProjectLike {
  return {
    worktree_path: repo,
    db_path: dbPath,
    ...overrides,
  }
}

beforeAll(() => {
  sharedRepoTmp = mkdtempSync(path.join(tmpdir(), 'wp-freshness-shared-'))
  sharedRepo = path.join(sharedRepoTmp, 'repo')
  mkdirSync(sharedRepo, { recursive: true })
  sharedHead = initGitRepo(sharedRepo)
})

afterAll(() => {
  rmSync(sharedRepoTmp, { recursive: true, force: true })
})

beforeEach(() => {
  tmp = mkdtempSync(path.join(tmpdir(), 'wp-freshness-'))
  repo = path.join(tmp, 'repo')
  mkdirSync(repo, { recursive: true })
  dbPath = path.join(tmp, 'blueprints.db')
})

afterEach(() => {
  rmSync(tmp, { recursive: true, force: true })
})

// ---------------------------------------------------------------------------
// Metadata round-trip
// ---------------------------------------------------------------------------

describe('projection metadata sidecar', () => {
  it('records and reads HEAD-at-ingest + ingested_at', () => {
    makeDbFile()
    const t = 1_700_000_000_000

    const written = recordProjectionMetadata({
      dbPath,
      cwd: sharedRepo,
      ingestedAt: t,
    })

    expect(written.head_at_ingest).toBe(sharedHead)
    expect(written.ingested_at).toBe(t)

    const read = readProjectionMetadata(dbPath)
    expect(read).toStrictEqual(written)
  })

  it('returns null head_at_ingest when cwd is not a git repo', () => {
    makeDbFile()
    const written = recordProjectionMetadata({ dbPath, cwd: repo, ingestedAt: 42 })
    expect(written.head_at_ingest).toBeNull()
    expect(written.ingested_at).toBe(42)
  })

  it('reads return null when metadata sidecar does not exist', () => {
    expect(readProjectionMetadata(dbPath)).toBeNull()
  })

  it('reads ignore malformed sidecar JSON and return null without throwing', () => {
    writeFileSync(dbPath + '.meta.json', 'not-json{')
    expect(readProjectionMetadata(dbPath)).toBeNull()
  })
})

// ---------------------------------------------------------------------------
// checkFreshness
// ---------------------------------------------------------------------------

describe('checkFreshness', () => {
  it('returns ok=true when HEAD matches the recorded ingest HEAD', () => {
    makeDbFile()
    recordProjectionMetadata({ dbPath, cwd: sharedRepo, ingestedAt: 1 })

    const result = checkFreshness(project({ worktree_path: sharedRepo }))
    expect(result).toStrictEqual({ ok: true, head: sharedHead, ingestedAt: 1 })
  })

  it('returns ok=false with next_action.kind=reingest_project when HEAD has changed', () => {
    // This test mutates HEAD, so it needs its own repo (not the shared one).
    initGitRepo(repo)
    makeDbFile()
    recordProjectionMetadata({ dbPath, cwd: repo, ingestedAt: 1 })

    // Move HEAD forward
    git(repo, ['commit', '-q', '--allow-empty', '-m', 'b'])

    const result = checkFreshness(project())
    expect(result.ok).toBe(false)
    if (result.ok) throw new Error('unreachable')
    expect(result.next_action.kind).toBe('reingest_project')
    expect(result.next_action.hint).toMatch(/HEAD/)
  })

  it('returns ok=false with next_action.kind=rebuild_db when the projection DB is missing', () => {
    // DB missing → checkFreshness returns before touching git; no repo needed.
    const result = checkFreshness(project({ worktree_path: sharedRepo }))
    expect(result.ok).toBe(false)
    if (result.ok) throw new Error('unreachable')
    expect(result.next_action.kind).toBe('rebuild_db')
  })

  it('returns ok=false with next_action.kind=reingest_project when metadata sidecar is missing', () => {
    makeDbFile()
    // No recordProjectionMetadata — sidecar missing.
    const result = checkFreshness(project({ worktree_path: sharedRepo }))
    expect(result.ok).toBe(false)
    if (result.ok) throw new Error('unreachable')
    expect(result.next_action.kind).toBe('reingest_project')
  })

  it('treats null head_at_ingest as fresh when current cwd is also non-git', () => {
    makeDbFile()
    // Non-git repo — no HEAD on either side.
    recordProjectionMetadata({ dbPath, cwd: repo, ingestedAt: 7 })
    const result = checkFreshness(project())
    expect(result).toStrictEqual({ ok: true, head: null, ingestedAt: 7 })
  })

  it('overriding ingestedAt via recordProjectionMetadata updates the sidecar', () => {
    makeDbFile()
    recordProjectionMetadata({ dbPath, cwd: sharedRepo, ingestedAt: 1 })
    const second: ProjectionMetadata = recordProjectionMetadata({
      dbPath,
      cwd: sharedRepo,
      ingestedAt: 999,
    })
    expect(second.ingested_at).toBe(999)
    const read = readProjectionMetadata(dbPath)
    expect(read?.ingested_at).toBe(999)
  })
})
