import { mkdtempSync, mkdirSync, rmSync, writeFileSync } from 'node:fs'
import path from 'node:path'
import { tmpdir } from 'node:os'

import { afterEach, describe, expect, it } from 'vitest'

import { recordProjectionMetadata } from '#freshness.js'

import { pruneProjectionArtifacts } from './gc.js'

let tmpDir: string | null = null

afterEach(() => {
  if (tmpDir) rmSync(tmpDir, { recursive: true, force: true })
  tmpDir = null
})

function makeTmpDir(): string {
  tmpDir = mkdtempSync(path.join(tmpdir(), 'wp-blueprint-gc-'))
  return tmpDir
}

describe('pruneProjectionArtifacts', () => {
  it('removes legacy worktree-scoped projection DBs and sidecars', () => {
    const stateRoot = makeTmpDir()
    const dbPath = path.join(stateRoot, 'repo-key', 'worktree', 'wt-key', 'blueprints', 'blueprints.db')
    mkdirSync(path.dirname(dbPath), { recursive: true })
    writeFileSync(dbPath, 'db', 'utf8')
    writeFileSync(`${dbPath}.meta.json`, '{}', 'utf8')

    const result = pruneProjectionArtifacts({ stateRoot })

    expect(result.pruned).toBe(2)
  })

  it('removes stale repo-scoped projection DBs when the metadata TTL is exceeded', () => {
    const stateRoot = makeTmpDir()
    const repo = path.join(stateRoot, 'repo-source')
    mkdirSync(repo, { recursive: true })
    const dbPath = path.join(stateRoot, 'repo-key', 'blueprints', 'blueprints.db')
    mkdirSync(path.dirname(dbPath), { recursive: true })
    writeFileSync(dbPath, 'db', 'utf8')
    recordProjectionMetadata({ dbPath, cwd: repo, ingestedAt: 1 })

    const result = pruneProjectionArtifacts({
      stateRoot,
      now: 31 * 24 * 60 * 60 * 1000,
      ttlMs: 30 * 24 * 60 * 60 * 1000,
    })

    expect(result.pruned).toBe(2)
  })

  it('removes orphaned repo-scoped projections when the recorded worktree path no longer exists', () => {
    const stateRoot = makeTmpDir()
    const missingRepo = path.join(stateRoot, 'missing-repo')
    const dbPath = path.join(stateRoot, 'repo-key', 'blueprints', 'blueprints.db')
    mkdirSync(path.dirname(dbPath), { recursive: true })
    writeFileSync(dbPath, 'db', 'utf8')
    recordProjectionMetadata({ dbPath, cwd: missingRepo, ingestedAt: Date.now() })

    const result = pruneProjectionArtifacts({ stateRoot, now: Date.now() })

    expect(result.pruned).toBe(2)
  })

  it('preserves the current target even when it is stale', () => {
    const stateRoot = makeTmpDir()
    const repo = path.join(stateRoot, 'repo-source')
    mkdirSync(repo, { recursive: true })
    const dbPath = path.join(stateRoot, 'repo-key', 'blueprints', 'blueprints.db')
    mkdirSync(path.dirname(dbPath), { recursive: true })
    writeFileSync(dbPath, 'db', 'utf8')
    recordProjectionMetadata({ dbPath, cwd: repo, ingestedAt: 1 })

    const result = pruneProjectionArtifacts({
      stateRoot,
      now: 31 * 24 * 60 * 60 * 1000,
      ttlMs: 30 * 24 * 60 * 60 * 1000,
      preserveDbPath: dbPath,
    })

    expect(result.pruned).toBe(0)
  })
})
