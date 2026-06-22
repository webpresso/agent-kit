import { execFileSync } from 'node:child_process'
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import path from 'node:path'

import { afterEach, beforeEach, describe, expect, it } from 'vitest'

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
  return execFileSync('git', [...args], { cwd: at, encoding: 'utf8', env: FAST_GIT_ENV }).trim()
}

function initGitRepo(at: string): void {
  git(at, ['init', '-q', '-b', 'main'])
  writeFileSync(path.join(at, 'README.md'), 'init\n')
  git(at, ['add', 'README.md'])
  git(at, ['commit', '-q', '-m', 'init'])
}

function head(at: string): string {
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
    initGitRepo(repo)
    makeDbFile()
    const headSha = head(repo)
    const t = 1_700_000_000_000

    const written = recordProjectionMetadata({
      dbPath,
      cwd: repo,
      ingestedAt: t,
    })

    expect(written.head_at_ingest).toBe(headSha)
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
    initGitRepo(repo)
    makeDbFile()
    recordProjectionMetadata({ dbPath, cwd: repo, ingestedAt: 1 })

    const result = checkFreshness(project())
    expect(result).toStrictEqual({ ok: true, head: head(repo), ingestedAt: 1 })
  })

  it('returns ok=false with next_action.kind=reingest_project when HEAD has changed', () => {
    initGitRepo(repo)
    makeDbFile()
    recordProjectionMetadata({ dbPath, cwd: repo, ingestedAt: 1 })

    // Move HEAD forward
    writeFileSync(path.join(repo, 'b.txt'), 'b\n')
    git(repo, ['add', 'b.txt'])
    git(repo, ['commit', '-q', '-m', 'b'])

    const result = checkFreshness(project())
    expect(result.ok).toBe(false)
    if (result.ok) throw new Error('unreachable')
    expect(result.next_action.kind).toBe('reingest_project')
    expect(result.next_action.hint).toMatch(/HEAD/)
  })

  it('returns ok=false with next_action.kind=rebuild_db when the projection DB is missing', () => {
    initGitRepo(repo)
    // No makeDbFile() — db missing entirely.
    const result = checkFreshness(project())
    expect(result.ok).toBe(false)
    if (result.ok) throw new Error('unreachable')
    expect(result.next_action.kind).toBe('rebuild_db')
  })

  it('returns ok=false with next_action.kind=reingest_project when metadata sidecar is missing', () => {
    initGitRepo(repo)
    makeDbFile()
    // No recordProjectionMetadata — sidecar missing.
    const result = checkFreshness(project())
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
    initGitRepo(repo)
    makeDbFile()
    recordProjectionMetadata({ dbPath, cwd: repo, ingestedAt: 1 })
    const second: ProjectionMetadata = recordProjectionMetadata({
      dbPath,
      cwd: repo,
      ingestedAt: 999,
    })
    expect(second.ingested_at).toBe(999)
    const read = readProjectionMetadata(dbPath)
    expect(read?.ingested_at).toBe(999)
  })
})
