import { mkdirSync, mkdtempSync, realpathSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import path from 'node:path'

import { afterEach, beforeEach, describe, expect, it } from 'vitest'

import { openDb } from '#db/connection.js'
import { resolveBlueprintProjectionDbPath } from '#db/paths.js'
import type { Database } from '#db/sqlite.js'

import {
  aggregateBlueprintRows,
  type AggregateBlueprintRowsOptions,
  type ProjectReader,
  readTargetSchema,
} from './aggregate.js'
import { recordProjectionMetadata } from './freshness.js'
import { type GitProbe } from './projects.js'

// ---------------------------------------------------------------------------
// Fixtures: build N synthetic projects, each backed by its own SQLite file
// with the same schema (`openDb` runs migrations) and a few seeded blueprints.
//
// We make every project root look like a git repo so Task 1.2's
// `resolveProjectRoot` can anchor on it (it walks up looking for `.git`).
// That's the only thing the resolver needs from "git" because we also inject
// a stubGit() that says isGitRepo=false — so the git-worktree expansion path
// stays a no-op and we don't accidentally pull in unrelated projects.
// ---------------------------------------------------------------------------

interface SyntheticProject {
  readonly dbPath: string
  readonly worktree: string
  readonly db: Database
  readonly close: () => void
}

interface SeedBlueprint {
  readonly slug: string
  readonly title?: string
  readonly status?: 'draft' | 'planned' | 'in-progress' | 'completed' | 'parked' | 'archived'
}

function seedBlueprint(db: Database, b: SeedBlueprint): void {
  db.prepare(
    `INSERT INTO blueprints
       (slug, title, status, complexity, owner, file_path, byte_size,
        content_hash, ingested_at, organization, visibility)
     VALUES (?, ?, ?, 'M', 'tester', ?, 100, ?, ?, 'test-org', 'private')`,
  ).run(
    b.slug,
    b.title ?? b.slug,
    b.status ?? 'in-progress',
    `/fake/${b.slug}/_overview.md`,
    `hash-${b.slug}`,
    1_700_000_000_000,
  )
}

const createdRoots: string[] = []
const openConns: Array<{ close: () => void }> = []

function mkroot(prefix = 'wp-aggregate-'): string {
  const dir = mkdtempSync(path.join(tmpdir(), prefix))
  createdRoots.push(dir)
  return realpathSync(dir)
}

function stubGit(): GitProbe {
  return {
    isGitRepo: () => false,
    repoToplevel: (cwd) => cwd,
    repoCommonDir: () => null,
    listWorktreesPorcelain: () => '',
    headBranch: () => null,
    platform: () => 'linux',
  }
}

function newProject(opts: {
  seed?: ReadonlyArray<SeedBlueprint>
  withFreshMetadata?: boolean
}): SyntheticProject {
  const worktree = mkroot()
  // `.git` marker so resolveProjectRoot can anchor here without walking up.
  mkdirSync(path.join(worktree, '.git'), { recursive: true })
  const dbPath = resolveBlueprintProjectionDbPath(worktree)
  mkdirSync(path.dirname(dbPath), { recursive: true })
  const conn = openDb(dbPath)
  openConns.push({ close: conn.close })
  for (const seed of opts.seed ?? []) {
    seedBlueprint(conn.db, seed)
  }
  if (opts.withFreshMetadata !== false) {
    recordProjectionMetadata({ dbPath, cwd: worktree, ingestedAt: 1_700_000_000_000 })
  }
  return { dbPath, worktree, db: conn.db, close: conn.close }
}

/**
 * Build a `resolveOptions` shape that bypasses real-world git/workspace
 * resolution and returns exactly the project roots we constructed. The
 * resolver computes the real `BlueprintProjectRef` for each — including the
 * real `project_id` hash — so callers exercise the production path.
 *
 * - `current` slot: pipe through `cwd`.
 * - `mcp_roots` slot: pipe through `rootsProvider`.
 * - `workspace_config` slot: pipe through `workspaceRepos`.
 */
interface ResolveSlots {
  readonly current: string
  readonly mcpRoots?: ReadonlyArray<string>
  readonly workspaceRepos?: ReadonlyArray<string>
}

function asResolveOptions(slots: ResolveSlots) {
  const mcpRoots = slots.mcpRoots ?? []
  return {
    cwd: slots.current,
    env: {},
    git: stubGit(),
    workspaceRepos: slots.workspaceRepos ?? [],
    rootsProvider: async () => ({ roots: mcpRoots.map((p) => ({ uri: `file://${p}` })) }),
  }
}

afterEach(() => {
  while (openConns.length > 0) {
    const c = openConns.pop()
    try {
      c?.close()
    } catch {
      // best-effort
    }
  }
  while (createdRoots.length > 0) {
    const dir = createdRoots.pop()
    if (!dir) continue
    try {
      rmSync(dir, { recursive: true, force: true })
    } catch {
      // best-effort
    }
  }
})

// Keep beforeEach referenced for parity with other test files in the dir.
void beforeEach

// ---------------------------------------------------------------------------
// readTargetSchema — F15 input contract
// ---------------------------------------------------------------------------

describe('readTargetSchema', () => {
  it('accepts an empty input — defaults to current scope at call time', () => {
    expect(readTargetSchema.parse({})).toStrictEqual({})
  })

  it('accepts the four read scopes', () => {
    for (const scope of ['current', 'roots', 'workspace', 'all'] as const) {
      expect(readTargetSchema.parse({ scope })).toStrictEqual({ scope })
    }
  })

  it('rejects unknown scope values at zod parse time', () => {
    expect(() => readTargetSchema.parse({ scope: 'bogus' })).toThrow()
  })

  it('rejects unknown keys — read target MUST NOT carry mutation fields (F15)', () => {
    // A mutation tool would pass `worktree_path`. Read input refuses it.
    expect(() => readTargetSchema.parse({ worktree_path: '/tmp/repo' })).toThrow()
  })

  it('rejects empty project_id strings', () => {
    expect(() => readTargetSchema.parse({ project_id: '' })).toThrow()
  })
})

// ---------------------------------------------------------------------------
// Aggregate reads
// ---------------------------------------------------------------------------

interface BlueprintListRow extends Record<string, unknown> {
  readonly slug: string
  readonly title: string
  readonly status: string
}

const listAllBlueprints: ProjectReader<BlueprintListRow> = ({ db }) =>
  db
    .prepare<[], BlueprintListRow>('SELECT slug, title, status FROM blueprints ORDER BY slug ASC')
    .all()

function callerOpts(
  slots: ResolveSlots,
  scope: 'current' | 'roots' | 'workspace' | 'all',
): AggregateBlueprintRowsOptions<BlueprintListRow> {
  return {
    target: { scope },
    read: listAllBlueprints,
    resolveOptions: asResolveOptions(slots),
  }
}

describe('aggregateBlueprintRows — merged list across N projects', () => {
  it('unions rows from all selected projects and tags each with project_id', async () => {
    const a = newProject({ seed: [{ slug: 'alpha' }, { slug: 'beta' }] })
    const b = newProject({ seed: [{ slug: 'gamma' }] })

    const result = await aggregateBlueprintRows<BlueprintListRow>(
      callerOpts({ current: a.worktree, mcpRoots: [b.worktree] }, 'all'),
    )

    expect(result.failures).toStrictEqual([])
    const slugs = result.rows.map((r) => r.slug).sort()
    expect(slugs).toStrictEqual(['alpha', 'beta', 'gamma'])

    const idForA = result.projects.find((p) => p.worktree_path === a.worktree)?.project_id
    expect(typeof idForA).toBe('string')
    const tagsForAlpha = result.rows.filter((r) => r.slug === 'alpha').map((r) => r.project_id)
    expect(tagsForAlpha).toStrictEqual([idForA])
  })

  it('returns a stable sort order based on the reader output, not project resolution', async () => {
    const a = newProject({ seed: [{ slug: 'z-late' }, { slug: 'a-early' }] })
    const b = newProject({ seed: [{ slug: 'm-middle' }] })

    const result = await aggregateBlueprintRows<BlueprintListRow>(
      callerOpts({ current: a.worktree, mcpRoots: [b.worktree] }, 'all'),
    )

    // Reader sorts each project's rows by slug; aggregate concatenates per
    // project in resolution order. So we expect a-early, z-late, m-middle.
    expect(result.rows.map((r) => r.slug)).toStrictEqual(['a-early', 'z-late', 'm-middle'])
  })
})

describe('aggregateBlueprintRows — scope selector', () => {
  it('scope=current restricts to the current project only', async () => {
    const a = newProject({ seed: [{ slug: 'alpha' }] })
    const b = newProject({ seed: [{ slug: 'beta' }] })

    const result = await aggregateBlueprintRows<BlueprintListRow>(
      callerOpts({ current: a.worktree, mcpRoots: [b.worktree] }, 'current'),
    )

    expect(result.rows.map((r) => r.slug)).toStrictEqual(['alpha'])
  })

  it('scope=roots restricts to MCP-root projects', async () => {
    const a = newProject({ seed: [{ slug: 'alpha' }] })
    const b = newProject({ seed: [{ slug: 'beta' }] })

    const result = await aggregateBlueprintRows<BlueprintListRow>(
      callerOpts({ current: a.worktree, mcpRoots: [b.worktree] }, 'roots'),
    )

    expect(result.rows.map((r) => r.slug)).toStrictEqual(['beta'])
  })

  it('scope=workspace restricts to workspace-config / git-worktree projects', async () => {
    const a = newProject({ seed: [{ slug: 'alpha' }] })
    const b = newProject({ seed: [{ slug: 'beta' }] })
    const result = await aggregateBlueprintRows<BlueprintListRow>(
      callerOpts({ current: a.worktree, workspaceRepos: [b.worktree] }, 'workspace'),
    )
    expect(result.rows.map((r) => r.slug)).toStrictEqual(['beta'])
  })

  it(
    'explicit project_id outranks scope',
    async () => {
      const a = newProject({ seed: [{ slug: 'alpha' }] })
      const b = newProject({ seed: [{ slug: 'beta' }] })

      // This test performs two aggregate reads plus project discovery and can
      // exceed the default 10s budget under full-suite load even though the
      // isolated runtime is ~5s.
      const wide = await aggregateBlueprintRows<BlueprintListRow>(
        callerOpts({ current: a.worktree, mcpRoots: [b.worktree] }, 'all'),
      )
      const idForB = wide.projects.find((p) => p.worktree_path === b.worktree)?.project_id
      expect(typeof idForB).toBe('string')

      const result = await aggregateBlueprintRows<BlueprintListRow>({
        target: { project_id: idForB as string, scope: 'all' },
        read: listAllBlueprints,
        resolveOptions: asResolveOptions({ current: a.worktree, mcpRoots: [b.worktree] }),
      })

      expect(result.rows.map((r) => r.slug)).toStrictEqual(['beta'])
      expect(result.projects.length).toBe(1)
    },
    20_000,
  )
})

describe('aggregateBlueprintRows — per-project failure isolation', () => {
  it('stale projection returns next_action=reingest_project for that project and continues', async () => {
    // Project `a` is fresh; project `b` has no sidecar metadata → stale.
    const a = newProject({ seed: [{ slug: 'alpha' }] })
    const stale = newProject({
      seed: [{ slug: 'beta' }],
      withFreshMetadata: false,
    })

    const result = await aggregateBlueprintRows<BlueprintListRow>(
      callerOpts({ current: a.worktree, mcpRoots: [stale.worktree] }, 'all'),
    )

    // The fresh project still produces rows.
    expect(result.rows.map((r) => r.slug)).toStrictEqual(['alpha'])

    // The stale project produces a structured failure.
    expect(result.failures.length).toBe(1)
    const f = result.failures[0]
    if (!f) throw new Error('missing failure entry')
    expect(f.worktree_path).toBe(stale.worktree)
    expect(f.next_action.kind).toBe('reingest_project')
    expect(f.next_action.hint.length).toBeGreaterThan(0)
    expect(f.project_id).toBe(
      result.projects.find((p) => p.worktree_path === stale.worktree)?.project_id,
    )
  })

  it('reader exceptions are isolated per project — the call does not throw', async () => {
    const a = newProject({ seed: [{ slug: 'alpha' }] })
    const b = newProject({ seed: [{ slug: 'beta' }] })

    const throwingRead: ProjectReader<BlueprintListRow> = ({ project, db }) => {
      if (project.worktree_path === b.worktree) {
        throw new Error('boom-from-reader')
      }
      return listAllBlueprints({ project, db })
    }

    const result = await aggregateBlueprintRows<BlueprintListRow>({
      target: { scope: 'all' },
      read: throwingRead,
      resolveOptions: asResolveOptions({ current: a.worktree, mcpRoots: [b.worktree] }),
    })

    expect(result.rows.map((r) => r.slug)).toStrictEqual(['alpha'])
    expect(result.failures.length).toBe(1)
    expect(result.failures[0]?.next_action.kind).toBe('reingest_project')
    expect(result.failures[0]?.next_action.hint).toMatch(/boom-from-reader/)
  })

  it('a missing DB file (rebuild_db) is reported as a per-project failure, not thrown', async () => {
    const a = newProject({ seed: [{ slug: 'alpha' }] })
    const b = newProject({ seed: [{ slug: 'beta' }] })
    // Drop `b`'s DB so the read path surfaces `rebuild_db` instead of silently
    // attempting to repair state inside a read-only aggregate call.
    b.close()
    rmSync(b.dbPath, { force: true })

    const result = await aggregateBlueprintRows<BlueprintListRow>(
      callerOpts({ current: a.worktree, mcpRoots: [b.worktree] }, 'all'),
    )

    expect(result.rows.map((r) => r.slug)).toStrictEqual(['alpha'])
    expect(result.failures.length).toBe(1)
    expect(result.failures[0]?.next_action.kind).toBe('rebuild_db')
  })
})

describe('aggregateBlueprintRows — duplicate slugs are surfaced, not silently merged', () => {
  it('returns the duplicate slug under duplicate_slugs[] when two projects share a slug', async () => {
    const a = newProject({ seed: [{ slug: 'shared' }] })
    const b = newProject({ seed: [{ slug: 'shared' }, { slug: 'unique' }] })

    const result = await aggregateBlueprintRows<BlueprintListRow>(
      callerOpts({ current: a.worktree, mcpRoots: [b.worktree] }, 'all'),
    )

    expect(result.duplicate_slugs).toStrictEqual(['shared'])
    // Both rows are still present, each tagged with their own project_id.
    const sharedRows = result.rows.filter((r) => r.slug === 'shared')
    expect(sharedRows.length).toBe(2)
    const tagged = new Set(sharedRows.map((r) => r.project_id))
    expect(tagged.size).toBe(2)
  })

  it('returns an empty duplicate_slugs[] when no slug repeats', async () => {
    const a = newProject({ seed: [{ slug: 'one' }] })
    const b = newProject({ seed: [{ slug: 'two' }] })

    const result = await aggregateBlueprintRows<BlueprintListRow>(
      callerOpts({ current: a.worktree, mcpRoots: [b.worktree] }, 'all'),
    )
    expect(result.duplicate_slugs).toStrictEqual([])
  })

  it('ignores rows that have no `slug` field — duplicate detection is opt-in by shape', async () => {
    interface CountRow extends Record<string, unknown> {
      readonly n: number
    }
    const a = newProject({ seed: [{ slug: 'x' }] })
    const b = newProject({ seed: [{ slug: 'y' }] })

    const countRead: ProjectReader<CountRow> = ({ db }) =>
      db.prepare<[], CountRow>('SELECT COUNT(*) AS n FROM blueprints').all()

    const result = await aggregateBlueprintRows<CountRow>({
      target: { scope: 'all' },
      read: countRead,
      resolveOptions: asResolveOptions({ current: a.worktree, mcpRoots: [b.worktree] }),
    })

    expect(result.duplicate_slugs).toStrictEqual([])
    expect(result.rows.length).toBe(2)
  })
})

describe('aggregateBlueprintRows — read-only contract', () => {
  it('rejects a mutation-shaped target at zod parse time', async () => {
    // We don't even need projects — the schema parse fails first.
    await expect(
      aggregateBlueprintRows<BlueprintListRow>({
        // @ts-expect-error — intentional: prove the parse rejects unknown keys
        target: { worktree_path: '/tmp/repo' },
        read: listAllBlueprints,
        resolveOptions: { cwd: '/tmp/x', env: {}, git: stubGit() },
      }),
    ).rejects.toThrow()
  })
})
