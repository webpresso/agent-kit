import { execFileSync } from 'node:child_process'
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import path from 'node:path'

import { afterEach, beforeEach, describe, expect, it } from 'vitest'

import { checkFreshness, readProjectionMetadata } from '#freshness.js'
import { resolveBlueprintProjectionDbPath } from '#db/paths.js'
import { reIngestProjection } from '#projection-ready.js'

import { dbBuild } from './db-commands.js'

// Regression coverage for the projection freshness-recovery bug: persistent
// reingest paths (`dbBuild`, `reIngestProjection`) must refresh the freshness
// sidecar (`recordProjectionMetadata`) so a HEAD move can actually be recovered
// from. These tests run real `git` + real ingest, hence `.integration`.

const BLUEPRINT = `---
type: blueprint
status: planned
complexity: S
owner: alice
created: '2026-01-15'
last_updated: '2026-04-01'
---

# Freshness Fixture

#### Task 1.1: Do the thing
**Status:** todo
- [ ] Do it
`

function git(repo: string, args: readonly string[]): void {
  execFileSync('git', args, { cwd: repo, stdio: 'ignore' })
}

function currentHead(repo: string): string {
  return execFileSync('git', ['rev-parse', 'HEAD'], { cwd: repo, encoding: 'utf8' }).trim()
}

function makeGitRepo(): string {
  const dir = mkdtempSync(path.join(tmpdir(), 'wp-bp-freshness-'))
  mkdirSync(path.join(dir, 'blueprints', 'planned'), { recursive: true })
  writeFileSync(path.join(dir, 'blueprints', 'planned', 'freshness-fixture.md'), BLUEPRINT, 'utf8')
  writeFileSync(path.join(dir, 'package.json'), '{"name":"freshness-consumer"}', 'utf8')
  git(dir, ['init', '-q'])
  git(dir, ['config', 'user.email', 'test@example.com'])
  git(dir, ['config', 'user.name', 'Test'])
  git(dir, ['add', '-A'])
  git(dir, ['commit', '-q', '-m', 'init'])
  return dir
}

let repo: string

beforeEach(() => {
  repo = makeGitRepo()
}, 30_000)

afterEach(() => {
  rmSync(repo, { recursive: true, force: true })
})

describe('projection freshness recovery', () => {
  it('dbBuild records freshness metadata so the projection reads fresh', async () => {
    const dbPath = resolveBlueprintProjectionDbPath(repo)

    await dbBuild(repo)

    const freshness = checkFreshness({ db_path: dbPath, worktree_path: repo })
    expect(freshness.ok).toBe(true)
    expect(readProjectionMetadata(dbPath)?.head_at_ingest).toBe(currentHead(repo))
  })

  it(
    'dbBuild clears staleness after HEAD moves (the reported recovery path)',
    { timeout: 30_000 },
    async () => {
      const dbPath = resolveBlueprintProjectionDbPath(repo)

      await dbBuild(repo)

      // A commit that does not touch blueprints/ still moves HEAD → projection stale.
      writeFileSync(path.join(repo, 'README.md'), 'unrelated\n', 'utf8')
      git(repo, ['add', '-A'])
      git(repo, ['commit', '-q', '-m', 'unrelated change'])

      const stale = checkFreshness({ db_path: dbPath, worktree_path: repo })
      expect(stale.ok).toBe(false)

      // The documented recovery must actually clear it.
      await dbBuild(repo)

      const recovered = checkFreshness({ db_path: dbPath, worktree_path: repo })
      expect(recovered.ok).toBe(true)
    },
  )

  it('reIngestProjection returns ingest counts and records freshness metadata', async () => {
    const dbPath = resolveBlueprintProjectionDbPath(repo)

    const result = await reIngestProjection(repo)

    expect(result.blueprintsIngested).toBe(1)
    expect(checkFreshness({ db_path: dbPath, worktree_path: repo }).ok).toBe(true)
  })
})
