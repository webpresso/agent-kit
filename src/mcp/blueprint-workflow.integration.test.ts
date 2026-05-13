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
 * Total wall-clock must be ≤ 5000ms.
 *
 * Per catalog/agent/rules/no-timeout-as-fix.md: no testTimeout bumps.
 * The 5s budget is enforced as an assertion, not a timeout config.
 *
 * Note: this test must be added to vitest.stryker.config.ts exclude list
 * because it calls ingestAll which scans the filesystem — a heavyweight
 * operation not suitable for Stryker's forks pool.
 */

import { afterEach, describe, expect, it } from 'vitest'

import { openDb } from '#db/connection.js'
import { ingestAll } from '#db/ingester.js'
import { buildBlueprintFixture } from '#mcp/__fixtures__/blueprint-fixture.js'
import type { ToolHandlerResult } from '#mcp/auto-discover.js'

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

  afterEach(() => {
    for (const cleanup of cleanups.splice(0)) {
      cleanup()
    }
  })

  it('happy path: list → context, total wall-clock ≤ 5000ms', async () => {
    const wallStart = Date.now()

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

    // Step 2: Ingest blueprints into SQLite (bypasses coldStartIfNeeded which
    // uses the new worktree-scoped path — we write directly to the legacy path
    // that handleBlueprintList reads from: <cwd>/.agent/.blueprints.db)
    const { join } = await import('node:path')
    const { mkdirSync } = await import('node:fs')
    const dbDir = join(fixture.dir, '.agent')
    mkdirSync(dbDir, { recursive: true })
    const dbFile = join(dbDir, '.blueprints.db')

    const conn = openDb(dbFile)
    try {
      await ingestAll({ db: conn.db, cwd: fixture.dir })
    } finally {
      conn.close()
    }

    // Step 3: Register tools via fake registrar (no MCP server spawn)
    // Disable platform sync so handlers take the markdown-only path
    process.env['AK_BLUEPRINT_PLATFORM_DISABLED'] = '1'

    const { registerBlueprintTools } = await import('#mcp/blueprint-server.js')
    const { registrar, getHandler } = makeFakeRegistrar()
    await registerBlueprintTools(registrar, fixture.dir)

    // Step 4: Call ak_blueprint_list — verify blueprint appears
    const listHandler = getHandler('ak_blueprint_list')
    const listResult = await listHandler({})
    const listPayload = parsePayload(listResult)

    expect(listResult.isError).toBeFalsy()
    const blueprints = listPayload['blueprints'] as Array<{ slug: string; title: string }>
    expect(blueprints).toBeInstanceOf(Array)
    const found = blueprints.find((b) => b.slug === 'smoke-test-blueprint')
    expect(found).toBeDefined()
    expect(found?.title).toBe('Smoke Test Blueprint')

    // Step 5: Call ak_blueprint_context for the blueprint
    const contextHandler = getHandler('ak_blueprint_context')
    const contextResult = await contextHandler({
      slug: 'smoke-test-blueprint',
      task_id: '1.1',
    })
    const contextPayload = parsePayload(contextResult)

    expect(contextResult.isError).toBeFalsy()
    const chunks = contextPayload['chunks'] as Array<{ kind: string; label: string; content: string }>
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

    // Step 6: Assert total wall-clock ≤ 5000ms (per no-timeout-as-fix rule)
    const elapsed = Date.now() - wallStart
    expect(elapsed).toBeLessThan(5000)
  })
})
