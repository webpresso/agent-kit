import { execSync } from 'node:child_process'
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

function initGitRepo(at: string): void {
  execSync('git init -q', { cwd: at })
  execSync('git config user.email test@example.com', { cwd: at })
  execSync('git config user.name Test', { cwd: at })
  writeFileSync(path.join(at, 'README.md'), 'init\n')
  execSync('git add README.md', { cwd: at })
  execSync('git commit -q -m "init"', { cwd: at })
}

function head(at: string): string {
  return execSync('git rev-parse HEAD', { cwd: at, encoding: 'utf8' }).trim()
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
  tmp = mkdtempSync(path.join(tmpdir(), 'ak-freshness-'))
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
    execSync('git add b.txt', { cwd: repo })
    execSync('git commit -q -m b', { cwd: repo })

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
