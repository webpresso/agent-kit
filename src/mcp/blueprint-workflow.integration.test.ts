/**
 * Single-worktree end-to-end smoke test for the blueprint MCP workflow.
 *
 * Tests the happy path without spawning a real MCP server process:
 *   1. Build fixture (in-memory mode)
 *   2. Ingest the fixture blueprints into SQLite
 *   3. Call handleBlueprintList via the registered tool handler
 *   4. Verify the blueprint appears in the list
 *   5. Call handleBlueprintContext for the first task
 *   6. Verify context chunks are returned
 *
 * Per catalog/agent/rules/no-timeout-as-fix.md: no testTimeout bumps.
 * End-to-end timing is verified by the surrounding wp_test batch instead of
 * in-test wall-clock assertions, which are noisy under Vitest worker load.
 *
 * Note: this test must be added to vitest.stryker.config.ts exclude list
 * because it calls ingestBlueprints which scans the filesystem — a heavyweight
 * operation not suitable for Stryker's forks pool.
 */

import { mkdirSync, writeFileSync } from 'node:fs'
import { dirname } from 'node:path'

import { afterEach, beforeEach, describe, expect, it } from 'vitest'

import { openDb } from '#db/connection.js'
import { resolveBlueprintProjectionDbPath } from '#db/paths.js'
import { ingestBlueprints } from '#db/ingester.js'
import { aggregateBlueprintRows } from '#aggregate.js'
import { recordProjectionMetadata } from '#freshness.js'
import { buildBlueprintFixture } from '#mcp/__fixtures__/blueprint-fixture.js'
import type { ToolHandlerResult } from '#mcp/auto-discover.js'
import { cleanupTempDir, createTempBlueprintRepo } from './blueprint-server.test-harness.js'

// ---------------------------------------------------------------------------
// Fake ToolRegistrar — captures handlers by name so tests can call directly
// ---------------------------------------------------------------------------

type HandlerFn = (args: unknown) => Promise<ToolHandlerResult>

function makeFakeRegistrar(): {
  registrar: Parameters<typeof import('#mcp/blueprint-server.js').registerBlueprintTools>[0]
  getHandler: (name: string) => HandlerFn
} {
  const handlers = new Map<string, HandlerFn>()

  const registrar = {
    registerTool(
      name: string,
      _description: string,
      _schema: unknown,
      _outputSchema: unknown,
      handler: HandlerFn,
      _annotations?: unknown,
    ): void {
      handlers.set(name, handler)
    },
  }

  return {
    registrar,
    getHandler: (name: string): HandlerFn => {
      const h = handlers.get(name)
      if (!h) throw new Error(`Handler "${name}" not registered`)
      return h
    },
  }
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function parsePayload(result: ToolHandlerResult): Record<string, unknown> {
  const text = (result.content[0] as { type: string; text: string }).text
  return JSON.parse(text) as Record<string, unknown>
}

// ---------------------------------------------------------------------------
// Integration smoke
// ---------------------------------------------------------------------------

describe('blueprint MCP workflow — single worktree smoke', () => {
  const cleanups: Array<() => void> = []
  let previousPlatformDisabled: string | undefined

  beforeEach(() => {
    previousPlatformDisabled = process.env['WP_BLUEPRINT_PLATFORM_DISABLED']
  })

  afterEach(() => {
    if (previousPlatformDisabled === undefined) {
      delete process.env['WP_BLUEPRINT_PLATFORM_DISABLED']
    } else {
      process.env['WP_BLUEPRINT_PLATFORM_DISABLED'] = previousPlatformDisabled
    }
    for (const cleanup of cleanups.splice(0)) {
      cleanup()
    }
  })

  it('happy path: list → context', async () => {
    // Step 1: Build fixture (in-memory mode — fake git, no real git init)
    const fixture = await buildBlueprintFixture({
      slug: 'smoke-test-blueprint',
      title: 'Smoke Test Blueprint',
      tasks: [
        { id: '1.1', title: 'Setup the environment', status: 'todo' },
        { id: '1.2', title: 'Run the smoke test', status: 'todo' },
      ],
    })
    cleanups.push(fixture.cleanup)

    // Step 2: Ingest blueprints into the canonical projection DB path that
    // the MCP handlers read for this fixture's repo shape.
    const dbFile = resolveBlueprintProjectionDbPath(fixture.dir)
    mkdirSync(dirname(dbFile), { recursive: true })

    const conn = openDb(dbFile)
    try {
      await ingestBlueprints({ db: conn.db, cwd: fixture.dir })
    } finally {
      conn.close()
    }
    recordProjectionMetadata({ dbPath: dbFile, cwd: fixture.dir, ingestedAt: Date.now() })

    // Step 3: Register tools via fake registrar (no MCP server spawn)
    // Disable platform sync so handlers take the markdown-only path
    process.env['WP_BLUEPRINT_PLATFORM_DISABLED'] = '1'

    const { registerBlueprintTools } = await import('#mcp/blueprint-server.js')
    const { registrar, getHandler } = makeFakeRegistrar()
    await registerBlueprintTools(registrar, fixture.dir)

    // Step 4: Call wp_blueprint_list — verify blueprint appears
    const listHandler = getHandler('wp_blueprint_list')
    const listResult = await listHandler({})
    const listPayload = parsePayload(listResult)

    expect(listResult.isError).toBeFalsy()
    const blueprints = listPayload['blueprints'] as Array<{ slug: string; title: string }>
    expect(blueprints).toBeInstanceOf(Array)
    const found = blueprints.find((b) => b.slug === 'smoke-test-blueprint')
    expect(found).toBeDefined()
    expect(found?.title).toBe('Smoke Test Blueprint')

    // Step 5: Call wp_blueprint_context for the blueprint
    const contextHandler = getHandler('wp_blueprint_context')
    const contextResult = await contextHandler({
      slug: 'smoke-test-blueprint',
      task_id: '1.1',
    })
    const contextPayload = parsePayload(contextResult)

    expect(contextResult.isError).toBeFalsy()
    const chunks = contextPayload['chunks'] as Array<{
      kind: string
      label: string
      content: string
    }>
    expect(chunks).toBeInstanceOf(Array)
    expect(chunks.length).toBeGreaterThan(0)

    // Verify summary chunk is present
    const summaryChunk = chunks.find((c) => c.kind === 'summary')
    expect(summaryChunk).toBeDefined()
    expect(summaryChunk?.label).toContain('smoke-test-blueprint')

    // Verify task chunk for 1.1 is present
    const taskChunk = chunks.find((c) => c.kind === 'task' && c.label.includes('1.1'))
    expect(taskChunk).toBeDefined()
    expect(taskChunk?.content).toContain('Setup the environment')

    // Batch-level wp_test timing is the performance guard for this workflow.
  })

  it('happy path: create → put → transition without direct markdown edits', async () => {
    const repoDir = createTempBlueprintRepo('wp-bs-workflow-put-transition-')
    cleanups.push(() => cleanupTempDir(repoDir))

    process.env['WP_BLUEPRINT_PLATFORM_DISABLED'] = '1'

    const { registerBlueprintTools } = await import('#mcp/blueprint-server.js')
    const { registrar, getHandler } = makeFakeRegistrar()
    await registerBlueprintTools(registrar, repoDir)

    const createResult = await getHandler('wp_blueprint_create')({
      project_id: repoDir,
      title: 'Structured workflow blueprint',
      goal: 'Prove the create put transition sequence',
      complexity: 'S',
    })
    const createPayload = parsePayload(createResult)
    expect(createResult.isError).toBeFalsy()
    const slug = createPayload['slug'] as string

    const getBeforePut = await getHandler('wp_blueprint_get')({
      project_id: repoDir,
      slug,
    })
    const beforePutPayload = parsePayload(getBeforePut)

    const putResult = await getHandler('wp_blueprint_put')({
      project_id: repoDir,
      slug,
      head_at_ingest: beforePutPayload['head_at_ingest'],
      document: {
        type: 'blueprint',
        title: 'Structured workflow blueprint',
        status: 'draft',
        complexity: 'S',
        owner: 'agent-kit',
        created: '2026-05-29',
        last_updated: '2026-05-29',
        product_wedge_anchor: {
          stage_outcome: 'Phase 1 — prove the create put transition flow',
          consuming_surface: 'wp blueprint MCP workflow',
          new_user_visible_capability:
            'Blueprints can be authored and advanced without direct markdown editing',
        },
        summary: 'Integration proof for Task 2.1.',
        tasks: [
          {
            id: '1.1',
            title: 'Author the blueprint through structured input',
            status: 'todo',
            wave: '0',
            acceptance: ['Blueprint markdown is rendered from structured input'],
          },
        ],
      },
    })
    const putPayload = parsePayload(putResult)
    expect(putResult.isError).toBeFalsy()
    expect(putPayload['status']).toBe('draft')

    const transitionResult = await getHandler('wp_blueprint_transition')({
      project_id: repoDir,
      slug,
      to_state: 'planned',
      expected_version: putPayload['content_hash'],
    })
    const transitionPayload = parsePayload(transitionResult)
    expect(transitionResult.isError).toBeFalsy()
    expect(transitionPayload['new_status']).toBe('planned')

    const finalGet = await getHandler('wp_blueprint_get')({
      project_id: repoDir,
      slug,
    })
    const finalPayload = parsePayload(finalGet)
    const finalBlueprint = finalPayload['blueprint'] as {
      status: string
      title: string
      tasks: Array<{ title: string }>
    }
    expect(finalPayload['content_hash']).toBe(transitionPayload['content_hash'])
    expect(finalBlueprint.status).toBe('planned')
    expect(finalBlueprint.title).toBe('Structured workflow blueprint')
    expect(finalBlueprint.tasks[0]?.title).toBe('Author the blueprint through structured input')
  })

  it('promote now returns revision metadata from the shared transition path', async () => {
    const repoDir = createTempBlueprintRepo('wp-bs-workflow-promote-transition-')
    cleanups.push(() => cleanupTempDir(repoDir))

    process.env['WP_BLUEPRINT_PLATFORM_DISABLED'] = '1'

    const { registerBlueprintTools } = await import('#mcp/blueprint-server.js')
    const { registrar, getHandler } = makeFakeRegistrar()
    await registerBlueprintTools(registrar, repoDir)

    const createResult = await getHandler('wp_blueprint_create')({
      project_id: repoDir,
      title: 'Promote through transition blueprint',
      goal: 'Prove promote reuses the transition primitive',
      complexity: 'S',
    })
    const createPayload = parsePayload(createResult)
    expect(createResult.isError).toBeFalsy()

    const getBeforePut = await getHandler('wp_blueprint_get')({
      project_id: repoDir,
      slug: createPayload['slug'],
    })
    const beforePutPayload = parsePayload(getBeforePut)

    const putResult = await getHandler('wp_blueprint_put')({
      project_id: repoDir,
      slug: createPayload['slug'],
      head_at_ingest: beforePutPayload['head_at_ingest'],
      document: {
        type: 'blueprint',
        title: 'Promote through transition blueprint',
        status: 'draft',
        complexity: 'S',
        owner: 'agent-kit',
        created: '2026-05-29',
        last_updated: '2026-05-29',
        product_wedge_anchor: {
          stage_outcome: 'Phase 1 — prove promote reuses transition revision metadata',
          consuming_surface: 'wp blueprint MCP workflow',
          new_user_visible_capability:
            'Promote returns revision metadata after structured authoring',
        },
        summary: 'Integration proof for the promote wrapper around transition.',
        tasks: [
          {
            id: '1.1',
            title: 'Author the blueprint before promote',
            status: 'todo',
            wave: '0',
            acceptance: ['Blueprint has the required structured authoring fields'],
          },
        ],
      },
    })
    expect(putResult.isError).toBeFalsy()

    const promoteResult = await getHandler('wp_blueprint_promote')({
      project_id: repoDir,
      slug: createPayload['slug'],
      to_state: 'planned',
    })
    const promotePayload = parsePayload(promoteResult)
    expect(promoteResult.isError).toBeFalsy()
    expect(promotePayload['to_state']).toBe('planned')
    expect(typeof promotePayload['content_hash']).toBe('string')
    expect(promotePayload['revision']).toBe(promotePayload['content_hash'])
    expect(typeof promotePayload['ingested_at']).toBe('number')
  })
})

// ---------------------------------------------------------------------------
// Helper: ingest a fixture into its canonical projection DB.
// ---------------------------------------------------------------------------

async function ingestFixture(dir: string): Promise<void> {
  const dbFile = resolveBlueprintProjectionDbPath(dir)
  mkdirSync(dirname(dbFile), { recursive: true })
  const conn = openDb(dbFile)
  try {
    await ingestBlueprints({ db: conn.db, cwd: dir })
  } finally {
    conn.close()
  }
  // Write freshness sidecar so checkFreshness passes for this fixture.
  // Fixtures use fake .git with no real HEAD, so head_at_ingest is null,
  // which matches readCurrentHead(dir) → null for non-git repos.
  recordProjectionMetadata({ dbPath: dbFile, cwd: dir, ingestedAt: Date.now() })
}

// ---------------------------------------------------------------------------
// Multi-project aggregate smoke + duplicate-slug coverage (Task 4.2b)
//
// These tests call aggregateBlueprintRows directly with workspaceRepos
// injection. The handler (handleBlueprintList) passes only { cwd } to
// resolveOptions and cannot inject workspaceRepos; testing the aggregate
// layer directly gives full coverage of the multi-project logic.
//
// Batch-level wp_test timing is the performance guard for this aggregate surface.
// ---------------------------------------------------------------------------

/**
 * Stub GitProbe that suppresses all git operations so the aggregate resolver
 * does not pick up unrelated repos or git worktrees from the test machine.
 * `repoToplevel` returns the cwd itself — this satisfies `resolveProjectRoot`'s
 * anchor check without any real git invocations. All other probes return safe
 * no-op values.
 */
function makeStubGit() {
  return {
    isGitRepo: () => false,
    repoToplevel: (cwd: string) => cwd,
    repoCommonDir: () => null,
    listWorktreesPorcelain: () => '',
    headBranch: () => null,
    platform: (): NodeJS.Platform => process.platform,
  }
}

describe('blueprint MCP workflow — multi-project aggregate smoke (Task 4.2b)', () => {
  const cleanups: Array<() => void> = []
  let previousPlatformDisabled: string | undefined

  beforeEach(() => {
    previousPlatformDisabled = process.env['WP_BLUEPRINT_PLATFORM_DISABLED']
  })

  afterEach(() => {
    if (previousPlatformDisabled === undefined) {
      delete process.env['WP_BLUEPRINT_PLATFORM_DISABLED']
    } else {
      process.env['WP_BLUEPRINT_PLATFORM_DISABLED'] = previousPlatformDisabled
    }
    for (const cleanup of cleanups.splice(0)) {
      cleanup()
    }
  })

  it('Test 1: two-project aggregate list returns rows from both with project_id tags', async () => {
    // Build two fixtures with different slugs
    const fixtureA = await buildBlueprintFixture({
      slug: 'project-alpha-blueprint',
      title: 'Project Alpha Blueprint',
      tasks: [{ id: '1.1', title: 'Alpha task', status: 'todo' }],
    })
    cleanups.push(fixtureA.cleanup)

    const fixtureB = await buildBlueprintFixture({
      slug: 'project-beta-blueprint',
      title: 'Project Beta Blueprint',
      tasks: [{ id: '1.1', title: 'Beta task', status: 'todo' }],
    })
    cleanups.push(fixtureB.cleanup)

    process.env['WP_BLUEPRINT_PLATFORM_DISABLED'] = '1'

    // Ingest both fixtures into their respective worktree-scoped DBs
    await ingestFixture(fixtureA.dir)
    await ingestFixture(fixtureB.dir)

    // Aggregate across both projects via workspaceRepos injection.
    // env: {} prevents the resolver from reading process.env and anchoring on
    // an unrelated project root. git: makeStubGit() prevents git worktree
    // expansion from pulling in unrelated repos.
    const result = await aggregateBlueprintRows<{ slug: string; title: string }>({
      target: { scope: 'all' },
      read: ({ db }) =>
        db
          .prepare<[], { slug: string; title: string }>(
            'SELECT slug, title FROM blueprints ORDER BY ingested_at DESC LIMIT 500',
          )
          .all(),
      resolveOptions: {
        cwd: fixtureA.dir,
        env: {},
        git: makeStubGit(),
        workspaceRepos: [fixtureB.dir],
      },
    })

    expect(result.failures).toStrictEqual([])

    const slugs = result.rows.map((r) => r.slug)
    expect(slugs).toContain('project-alpha-blueprint')
    expect(slugs).toContain('project-beta-blueprint')

    // Every row must carry a non-empty project_id
    for (const row of result.rows) {
      expect(typeof row.project_id).toBe('string')
      expect(row.project_id.length).toBeGreaterThan(0)
    }

    // Both project_ids must appear
    const projectIds = new Set(result.rows.map((r) => r.project_id))
    expect(projectIds.size).toBeGreaterThanOrEqual(2)

    // Batch-level wp_test timing is the performance guard for this workflow.
  })

  it('Test 2: duplicate slug across two projects returns disambiguate_slug candidate list', async () => {
    const sharedSlug = 'shared-slug'

    const fixtureA = await buildBlueprintFixture({
      slug: sharedSlug,
      title: 'Shared Slug Project A',
      tasks: [{ id: '1.1', title: 'Task in A', status: 'todo' }],
    })
    cleanups.push(fixtureA.cleanup)

    const fixtureB = await buildBlueprintFixture({
      slug: sharedSlug,
      title: 'Shared Slug Project B',
      tasks: [{ id: '1.1', title: 'Task in B', status: 'todo' }],
    })
    cleanups.push(fixtureB.cleanup)

    process.env['WP_BLUEPRINT_PLATFORM_DISABLED'] = '1'

    await ingestFixture(fixtureA.dir)
    await ingestFixture(fixtureB.dir)

    const result = await aggregateBlueprintRows<{
      slug: string
      title: string
      file_path: string
    }>({
      target: { scope: 'all' },
      read: ({ db }) =>
        db
          .prepare<[], { slug: string; title: string; file_path: string }>(
            'SELECT slug, title, file_path FROM blueprints ORDER BY ingested_at DESC LIMIT 500',
          )
          .all(),
      resolveOptions: {
        cwd: fixtureA.dir,
        env: {},
        git: makeStubGit(),
        workspaceRepos: [fixtureB.dir],
      },
    })

    // Both rows with the shared slug must appear (one per project)
    const sharedRows = result.rows.filter((r) => r.slug === sharedSlug)
    expect(sharedRows.length).toBe(2)

    // The slug must be listed in duplicate_slugs
    expect(result.duplicate_slugs).toContain(sharedSlug)

    // Both rows must have non-empty project_ids and they must differ
    // (each belongs to a distinct project)
    const candidateProjectIds = sharedRows.map((r) => r.project_id)
    expect(typeof candidateProjectIds[0]).toBe('string')
    expect((candidateProjectIds[0] ?? '').length).toBeGreaterThan(0)
    expect(typeof candidateProjectIds[1]).toBe('string')
    expect((candidateProjectIds[1] ?? '').length).toBeGreaterThan(0)
    expect(candidateProjectIds[0]).not.toBe(candidateProjectIds[1])

    // Batch-level wp_test timing is the performance guard for this workflow.
  })

  it('Test 3: one stale project DB does not fail aggregate call', async () => {
    // Good fixture — ingested and working
    const fixtureGood = await buildBlueprintFixture({
      slug: 'good-project-blueprint',
      title: 'Good Project Blueprint',
      tasks: [{ id: '1.1', title: 'Good task', status: 'todo' }],
    })
    cleanups.push(fixtureGood.cleanup)

    // Stale fixture — ingested, then its metadata is made stale so aggregate
    // reports reingest_project without failing the entire multi-project call.
    const fixtureBroken = await buildBlueprintFixture({
      slug: 'broken-project-blueprint',
      title: 'Broken Project Blueprint',
      tasks: [{ id: '1.1', title: 'Broken task', status: 'todo' }],
    })
    cleanups.push(fixtureBroken.cleanup)

    process.env['WP_BLUEPRINT_PLATFORM_DISABLED'] = '1'

    await ingestFixture(fixtureGood.dir)
    await ingestFixture(fixtureBroken.dir)
    writeFileSync(
      `${resolveBlueprintProjectionDbPath(fixtureBroken.dir)}.meta.json`,
      JSON.stringify({ head_at_ingest: 'deadbeef'.repeat(5), ingested_at: 1 }) + '\n',
      'utf8',
    )

    const result = await aggregateBlueprintRows<{ slug: string; title: string }>({
      target: { scope: 'all' },
      read: ({ db }) =>
        db
          .prepare<[], { slug: string; title: string }>(
            'SELECT slug, title FROM blueprints ORDER BY ingested_at DESC LIMIT 500',
          )
          .all(),
      resolveOptions: {
        cwd: fixtureGood.dir,
        env: {},
        git: makeStubGit(),
        workspaceRepos: [fixtureBroken.dir],
      },
    })

    // The call must not throw — checked implicitly by reaching this point

    // The good project's rows must appear
    const slugs = result.rows.map((r) => r.slug)
    expect(slugs).toContain('good-project-blueprint')

    // The stale project must produce exactly one failure entry
    expect(result.failures.length).toBe(1)
    // project_id is a hash of the realpath — non-empty is the invariant we can assert
    expect((result.failures[0]?.project_id ?? '').length).toBeGreaterThan(0)
    expect(result.failures[0]?.next_action.kind).toBe('reingest_project')

    // Batch-level wp_test timing is the performance guard for this workflow.
  })

  it('Test 4: aggregate scope all tags every row with project_id and both IDs appear', async () => {
    const fixtureX = await buildBlueprintFixture({
      slug: 'scope-all-x-blueprint',
      title: 'Scope All X Blueprint',
      tasks: [{ id: '1.1', title: 'X task', status: 'todo' }],
    })
    cleanups.push(fixtureX.cleanup)

    const fixtureY = await buildBlueprintFixture({
      slug: 'scope-all-y-blueprint',
      title: 'Scope All Y Blueprint',
      tasks: [{ id: '1.1', title: 'Y task', status: 'todo' }],
    })
    cleanups.push(fixtureY.cleanup)

    process.env['WP_BLUEPRINT_PLATFORM_DISABLED'] = '1'

    await ingestFixture(fixtureX.dir)
    await ingestFixture(fixtureY.dir)

    const result = await aggregateBlueprintRows<{ slug: string; title: string }>({
      target: { scope: 'all' },
      read: ({ db }) =>
        db
          .prepare<[], { slug: string; title: string }>(
            'SELECT slug, title FROM blueprints ORDER BY ingested_at DESC LIMIT 500',
          )
          .all(),
      resolveOptions: {
        cwd: fixtureX.dir,
        env: {},
        git: makeStubGit(),
        workspaceRepos: [fixtureY.dir],
      },
    })

    expect(result.failures).toStrictEqual([])
    expect(result.rows.length).toBeGreaterThanOrEqual(2)

    // Every row must have a non-empty project_id
    for (const row of result.rows) {
      expect(typeof row.project_id).toBe('string')
      expect(row.project_id.length).toBeGreaterThan(0)
    }

    // Rows must come from at least 2 distinct projects
    const projectIds = new Set(result.rows.map((r) => r.project_id))
    expect(projectIds.size).toBeGreaterThanOrEqual(2)

    // Batch-level wp_test timing is the performance guard for this workflow.
  })
})
