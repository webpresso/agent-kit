/**
 * Platform-first blueprint MCP server tests split out so Vitest can parallelize
 * this expensive integration surface across files.
 */

import { mkdtempSync, mkdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs'
import path from 'node:path'
import { tmpdir } from 'node:os'

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

import type { ToolRegistrar, ToolHandler, ToolHandlerResult } from './auto-discover.js'
import { registerBlueprintTools, _setSyncAdapterFactory } from './blueprint-server.js'
import type { SyncAdapter } from './blueprint-server.js'
import { markBlueprintValidated } from './blueprint-server.test-harness.js'

type RegisteredTool = { name: string; handler: ToolHandler }

function makeRegistrar(): { registrar: ToolRegistrar; tools: Map<string, RegisteredTool> } {
  const tools = new Map<string, RegisteredTool>()
  const registrar: ToolRegistrar = {
    registerTool(name, _desc, _schema, _outSchema, handler) {
      tools.set(name, { name, handler })
    },
  }
  return { registrar, tools }
}

async function callTool(
  tools: Map<string, { name: string; handler: ToolHandler }>,
  name: string,
  input: unknown,
): Promise<ToolHandlerResult> {
  const tool = tools.get(name)
  if (!tool) throw new Error(`Tool "${name}" not registered`)
  return tool.handler(input)
}

function parseResult(result: ToolHandlerResult): unknown {
  const text = result.content[0]
  if (!text || text.type !== 'text' || typeof text.text !== 'string') {
    throw new Error('Expected text content block')
  }
  return JSON.parse(text.text)
}

let tmpDir: string
let tools: Map<string, { name: string; handler: ToolHandler }>

beforeEach(async () => {
  tmpDir = mkdtempSync(path.join(tmpdir(), 'ak-bs-platform-test-'))
  mkdirSync(path.join(tmpDir, '.agent'), { recursive: true })
  mkdirSync(path.join(tmpDir, 'blueprints', 'draft'), { recursive: true })
  writeFileSync(path.join(tmpDir, 'package.json'), JSON.stringify({ name: 'test' }), 'utf8')

  const { registrar, tools: t } = makeRegistrar()
  await registerBlueprintTools(registrar, tmpDir)
  tools = t
})

afterEach(() => {
  rmSync(tmpDir, { recursive: true, force: true })
})

// ---------------------------------------------------------------------------
// wp_blueprint_task_advance — platform-first path (Task 2.1)
// ---------------------------------------------------------------------------

/**
 * Fixture blueprint with one todo task used by all task-advance tests.
 * Lives in blueprints/in-progress/<slug>/_overview.md so the DB ingester
 * can pick it up.
 */
const ADVANCE_BLUEPRINT = `---
type: blueprint
title: Advance Test Blueprint
status: in-progress
complexity: S
owner: tester
created: '2026-01-01'
last_updated: '2026-05-01'
---

## Product wedge anchor

- **Stage outcome:** Phase 1 — ship advance feature
- **Consuming surface:** /advance route
- **New user-visible capability:** Users can advance tasks.

## Summary

Blueprint used to test task advance.

#### Task 1.1: The advance task

**Status:** todo
**Wave:** 0
**Files:**
- src/foo.ts

**Acceptance:**
- [ ] The task is advanced
`

describe('wp_blueprint_task_advance', () => {
  const BLUEPRINT_SLUG = 'advance-test-blueprint'

  /** Write the fixture blueprint and return its path. */
  function writeBlueprintFixture(dir: string): string {
    const bpDir = path.join(dir, 'blueprints', 'in-progress', BLUEPRINT_SLUG)
    mkdirSync(bpDir, { recursive: true })
    const overviewPath = path.join(bpDir, '_overview.md')
    writeFileSync(overviewPath, ADVANCE_BLUEPRINT, 'utf8')
    return overviewPath
  }

  /** Re-register tools after writing the fixture so the DB is cold-started with it. */
  async function setupWithBlueprint(): Promise<{
    overviewPath: string
    localTmpDir: string
    localTools: Map<string, { name: string; handler: ToolHandler }>
  }> {
    const localTmpDir = mkdtempSync(path.join(tmpdir(), 'ak-bs-adv-'))
    mkdirSync(path.join(localTmpDir, '.agent'), { recursive: true })
    mkdirSync(path.join(localTmpDir, 'blueprints', 'draft'), { recursive: true })
    writeFileSync(path.join(localTmpDir, 'package.json'), JSON.stringify({ name: 'test' }), 'utf8')
    const overviewPath = writeBlueprintFixture(localTmpDir)
    const { registrar, tools: t } = makeRegistrar()
    await registerBlueprintTools(registrar, localTmpDir)
    return { overviewPath, localTmpDir, localTools: t }
  }

  afterEach(() => {
    // Reset the injectable factory to production default after each test
    _setSyncAdapterFactory(null)
    vi.unstubAllEnvs()
  })

  it('calls pushEvent + ensureFresh when platform adapter is available', async () => {
    const pushEvent = vi.fn<SyncAdapter['pushEvent']>().mockResolvedValue(undefined)
    const ensureFresh = vi.fn<SyncAdapter['ensureFresh']>().mockResolvedValue(undefined)
    const mockAdapter: SyncAdapter = { pushEvent, ensureFresh }
    _setSyncAdapterFactory(() => mockAdapter)

    const { overviewPath, localTmpDir, localTools } = await setupWithBlueprint()

    const result = await callTool(localTools, 'wp_blueprint_task_advance', {
      project_id: localTmpDir,
      task_id: '1.1',
      to: 'in-progress',
    })
    const data = parseResult(result) as {
      summary: string
      task_id: string
      old_status: string
      new_status: string
      failures: string[]
    }

    expect(result.isError).toStrictEqual(false)
    expect(data.task_id).toStrictEqual('1.1')
    expect(data.new_status).toStrictEqual('in-progress')

    // Platform-first: pushEvent must be called with task.status_changed payload
    expect(pushEvent).toHaveBeenCalledOnce()
    const [eventArg] = pushEvent.mock.calls[0] ?? []
    expect(eventArg?.type).toStrictEqual('task.status_changed')
    expect(eventArg?.payload).toMatchObject({
      type: 'task.status_changed',
      taskId: '1.1',
      toStatus: 'in-progress',
    })
    expect(typeof eventArg?.eventId).toStrictEqual('string')
    expect(eventArg?.eventId.length).toBeGreaterThan(0)

    // ensureFresh must be called to pull updated state
    expect(ensureFresh).toHaveBeenCalledOnce()

    // Markdown must still be updated (derived artifact)
    const md = readFileSync(overviewPath, 'utf8')
    expect(md).toContain('**Status:** in-progress')
  })

  it('does NOT call pushEvent when WP_BLUEPRINT_PLATFORM_DISABLED=1 (iron rule)', async () => {
    vi.stubEnv('WP_BLUEPRINT_PLATFORM_DISABLED', '1')

    const pushEvent = vi.fn<SyncAdapter['pushEvent']>().mockResolvedValue(undefined)
    const ensureFresh = vi.fn<SyncAdapter['ensureFresh']>().mockResolvedValue(undefined)
    const mockAdapter: SyncAdapter = { pushEvent, ensureFresh }
    // Even if someone injects an adapter, DISABLED must win
    _setSyncAdapterFactory(() => mockAdapter)

    const { overviewPath, localTmpDir, localTools } = await setupWithBlueprint()

    // Use 'blocked' instead of 'done' — 'done' is now forbidden via wp_blueprint_task_advance
    // (Task 3.2: done requires evidence via wp_blueprint_task_verify)
    const result = await callTool(localTools, 'wp_blueprint_task_advance', {
      project_id: localTmpDir,
      task_id: '1.1',
      to: 'blocked',
    })
    const data = parseResult(result) as { new_status: string; failures: string[] }

    // Iron rule: result must be successful (markdown-canonical path)
    expect(result.isError).toStrictEqual(false)
    expect(data.new_status).toStrictEqual('blocked')
    expect(data.failures).toHaveLength(0)

    // Iron rule: platform calls must NOT happen when disabled
    expect(pushEvent).not.toHaveBeenCalled()
    expect(ensureFresh).not.toHaveBeenCalled()

    // Markdown must still be updated via the canonical path
    const md = readFileSync(overviewPath, 'utf8')
    expect(md).toContain('**Status:** blocked')
  })

  it('falls back to markdown-canonical path when factory returns null (no credentials)', async () => {
    // Factory returns null = no credentials available
    _setSyncAdapterFactory(() => null)

    const { overviewPath, localTmpDir, localTools } = await setupWithBlueprint()

    const result = await callTool(localTools, 'wp_blueprint_task_advance', {
      project_id: localTmpDir,
      task_id: '1.1',
      to: 'blocked',
    })
    const data = parseResult(result) as { new_status: string; failures: string[] }

    expect(result.isError).toStrictEqual(false)
    expect(data.new_status).toStrictEqual('blocked')
    expect(data.failures).toHaveLength(0)

    // Markdown canonical path must have run
    const md = readFileSync(overviewPath, 'utf8')
    expect(md).toContain('**Status:** blocked')
  })

  it('returns error when task_id does not exist in DB', async () => {
    _setSyncAdapterFactory(() => null)

    const result = await callTool(tools, 'wp_blueprint_task_advance', {
      task_id: 'nonexistent.99',
      to: 'done',
    })
    expect(result.isError).toBe(true)
    const data = parseResult(result) as { failures: string[] }
    expect(data.failures.length).toBeGreaterThan(0)
  })
})

// ---------------------------------------------------------------------------
// wp_blueprint_promote — platform-first path (Task 2.2)
// ---------------------------------------------------------------------------

/**
 * Fixture blueprint used by promote tests.
 * Lives in blueprints/draft/<slug>/_overview.md, already validated so the
 * promote guard does not refuse it.
 */
const PROMOTE_BLUEPRINT = `---
type: blueprint
title: Promote Test Blueprint
status: draft
complexity: S
owner: tester
created: '2026-01-01'
last_updated: '2026-05-01'
---

## Product wedge anchor

- **Stage outcome:** Phase 1 — ship promote feature
- **Consuming surface:** /promote route
- **New user-visible capability:** Users can promote blueprints.

## Summary

Blueprint used to test promote.

#### Task 1.1: The promote task

**Status:** todo
**Wave:** 0

**Acceptance:**
- [ ] The blueprint is promoted
`

describe('wp_blueprint_promote — platform-first (Task 2.2)', () => {
  const PROMOTE_SLUG = 'promote-test-blueprint'

  async function setupWithPromoteBlueprint(): Promise<{
    localTmpDir: string
    localTools: Map<string, { name: string; handler: ToolHandler }>
  }> {
    const localTmpDir = mkdtempSync(path.join(tmpdir(), 'ak-bs-prm-'))
    mkdirSync(path.join(localTmpDir, '.agent'), { recursive: true })
    mkdirSync(path.join(localTmpDir, 'blueprints', 'draft', PROMOTE_SLUG), { recursive: true })
    writeFileSync(path.join(localTmpDir, 'package.json'), JSON.stringify({ name: 'test' }), 'utf8')
    const overviewPath = path.join(localTmpDir, 'blueprints', 'draft', PROMOTE_SLUG, '_overview.md')
    writeFileSync(overviewPath, PROMOTE_BLUEPRINT, 'utf8')
    const { registrar, tools: t } = makeRegistrar()
    await registerBlueprintTools(registrar, localTmpDir)
    // Validate first so the promote guard passes
    await callTool(t, 'wp_blueprint_validate', { path: overviewPath })
    markBlueprintValidated(localTmpDir, PROMOTE_SLUG)
    return { localTmpDir, localTools: t }
  }

  afterEach(() => {
    _setSyncAdapterFactory(null)
    vi.unstubAllEnvs()
  })

  it('calls pushEvent + ensureFresh when platform adapter is available', async () => {
    const pushEvent = vi.fn<SyncAdapter['pushEvent']>().mockResolvedValue(undefined)
    const ensureFresh = vi.fn<SyncAdapter['ensureFresh']>().mockResolvedValue(undefined)
    _setSyncAdapterFactory(() => ({ pushEvent, ensureFresh }))

    const { localTools } = await setupWithPromoteBlueprint()

    const result = await callTool(localTools, 'wp_blueprint_promote', {
      slug: PROMOTE_SLUG,
      to_state: 'planned',
    })
    const data = parseResult(result) as {
      summary: string
      slug: string
      from_state: string
      to_state: string
      failures: string[]
    }

    expect(result.isError).toStrictEqual(false)
    expect(data.slug).toStrictEqual(PROMOTE_SLUG)
    expect(data.from_state).toStrictEqual('draft')
    expect(data.to_state).toStrictEqual('planned')

    // Platform-first: pushEvent with blueprint.status_changed
    expect(pushEvent).toHaveBeenCalledOnce()
    const [eventArg] = pushEvent.mock.calls[0] ?? []
    expect(eventArg?.type).toStrictEqual('blueprint.status_changed')
    expect(eventArg?.payload).toMatchObject({
      type: 'blueprint.status_changed',
      slug: PROMOTE_SLUG,
      fromStatus: 'draft',
      toStatus: 'planned',
    })
    expect(typeof eventArg?.eventId).toStrictEqual('string')
    expect(eventArg?.eventId.length).toBeGreaterThan(0)

    // ensureFresh must be called
    expect(ensureFresh).toHaveBeenCalledOnce()
  })

  it('does NOT call pushEvent when WP_BLUEPRINT_PLATFORM_DISABLED=1 (iron rule)', async () => {
    vi.stubEnv('WP_BLUEPRINT_PLATFORM_DISABLED', '1')

    const pushEvent = vi.fn<SyncAdapter['pushEvent']>().mockResolvedValue(undefined)
    const ensureFresh = vi.fn<SyncAdapter['ensureFresh']>().mockResolvedValue(undefined)
    _setSyncAdapterFactory(() => ({ pushEvent, ensureFresh }))

    const { localTools } = await setupWithPromoteBlueprint()

    const result = await callTool(localTools, 'wp_blueprint_promote', {
      slug: PROMOTE_SLUG,
      to_state: 'planned',
    })
    const data = parseResult(result) as { to_state: string; failures: string[] }

    expect(result.isError).toStrictEqual(false)
    expect(data.to_state).toStrictEqual('planned')
    expect(data.failures).toHaveLength(0)

    // Iron rule: no platform calls when disabled
    expect(pushEvent).not.toHaveBeenCalled()
    expect(ensureFresh).not.toHaveBeenCalled()
  })

})

// ---------------------------------------------------------------------------
// wp_blueprint_finalize — platform-first path (Task 2.3)
// ---------------------------------------------------------------------------

/**
 * Fixture blueprint where all tasks are already done, so finalize succeeds.
 */
const FINALIZE_BLUEPRINT = `---
type: blueprint
title: Finalize Test Blueprint
status: in-progress
complexity: S
owner: tester
created: '2026-01-01'
last_updated: '2026-05-01'
---

## Product wedge anchor

- **Stage outcome:** Phase 1 — ship finalize feature
- **Consuming surface:** /finalize route
- **New user-visible capability:** Users can finalize blueprints.

## Summary

Blueprint used to test finalize.

#### Task 1.1: The finalize task

**Status:** done
**Wave:** 0

**Acceptance:**
- [x] The blueprint is finalized
`

describe('wp_blueprint_finalize — platform-first (Task 2.3)', () => {
  const FINALIZE_SLUG = 'finalize-test-blueprint'

  async function setupWithFinalizeBlueprint(): Promise<{
    localTmpDir: string
    localTools: Map<string, { name: string; handler: ToolHandler }>
  }> {
    const localTmpDir = mkdtempSync(path.join(tmpdir(), 'ak-bs-fin-'))
    mkdirSync(path.join(localTmpDir, '.agent'), { recursive: true })
    mkdirSync(path.join(localTmpDir, 'blueprints', 'in-progress', FINALIZE_SLUG), {
      recursive: true,
    })
    writeFileSync(path.join(localTmpDir, 'package.json'), JSON.stringify({ name: 'test' }), 'utf8')
    const overviewPath = path.join(
      localTmpDir,
      'blueprints',
      'in-progress',
      FINALIZE_SLUG,
      '_overview.md',
    )
    writeFileSync(overviewPath, FINALIZE_BLUEPRINT, 'utf8')
    const { registrar, tools: t } = makeRegistrar()
    await registerBlueprintTools(registrar, localTmpDir)
    return { localTmpDir, localTools: t }
  }

  afterEach(() => {
    _setSyncAdapterFactory(null)
    vi.unstubAllEnvs()
  })

  it('calls pushEvent + ensureFresh when platform adapter is available', async () => {
    const pushEvent = vi.fn<SyncAdapter['pushEvent']>().mockResolvedValue(undefined)
    const ensureFresh = vi.fn<SyncAdapter['ensureFresh']>().mockResolvedValue(undefined)
    _setSyncAdapterFactory(() => ({ pushEvent, ensureFresh }))

    const { localTools } = await setupWithFinalizeBlueprint()

    const result = await callTool(localTools, 'wp_blueprint_finalize', {
      slug: FINALIZE_SLUG,
    })
    const data = parseResult(result) as {
      summary: string
      slug: string
      failures: string[]
    }

    expect(result.isError).toStrictEqual(false)
    expect(data.slug).toStrictEqual(FINALIZE_SLUG)
    expect(data.summary).toMatch(/finalized/i)
    expect(data.failures).toHaveLength(0)

    // Platform-first: pushEvent with blueprint.finalized
    expect(pushEvent).toHaveBeenCalledOnce()
    const [eventArg] = pushEvent.mock.calls[0] ?? []
    expect(eventArg?.type).toStrictEqual('blueprint.finalized')
    expect(eventArg?.payload).toMatchObject({
      type: 'blueprint.finalized',
      slug: FINALIZE_SLUG,
    })
    expect(typeof eventArg?.eventId).toStrictEqual('string')
    expect(eventArg?.eventId.length).toBeGreaterThan(0)

    // ensureFresh must be called
    expect(ensureFresh).toHaveBeenCalledOnce()
  })

  it('does NOT call pushEvent when WP_BLUEPRINT_PLATFORM_DISABLED=1 (iron rule)', async () => {
    vi.stubEnv('WP_BLUEPRINT_PLATFORM_DISABLED', '1')

    const pushEvent = vi.fn<SyncAdapter['pushEvent']>().mockResolvedValue(undefined)
    const ensureFresh = vi.fn<SyncAdapter['ensureFresh']>().mockResolvedValue(undefined)
    _setSyncAdapterFactory(() => ({ pushEvent, ensureFresh }))

    const { localTools } = await setupWithFinalizeBlueprint()

    const result = await callTool(localTools, 'wp_blueprint_finalize', {
      slug: FINALIZE_SLUG,
    })
    const data = parseResult(result) as { slug: string; failures: string[] }

    expect(result.isError).toStrictEqual(false)
    expect(data.slug).toStrictEqual(FINALIZE_SLUG)
    expect(data.failures).toHaveLength(0)

    // Iron rule: no platform calls when disabled
    expect(pushEvent).not.toHaveBeenCalled()
    expect(ensureFresh).not.toHaveBeenCalled()
  })
})

// ---------------------------------------------------------------------------
// wp_blueprint_new — platform-first path (Task 2.4)
// ---------------------------------------------------------------------------

describe('wp_blueprint_new — platform-first (Task 2.4)', () => {
  afterEach(() => {
    _setSyncAdapterFactory(null)
    vi.unstubAllEnvs()
  })

  it('pushes blueprint.created event before returning scaffold when adapter is available', async () => {
    const pushEvent = vi.fn<SyncAdapter['pushEvent']>().mockResolvedValue(undefined)
    const ensureFresh = vi.fn<SyncAdapter['ensureFresh']>().mockResolvedValue(undefined)
    _setSyncAdapterFactory(() => ({ pushEvent, ensureFresh }))

    const result = await callTool(tools, 'wp_blueprint_new', {
      title: 'Platform New Feature',
      complexity: 'M',
      goal_prompt: 'Register this blueprint with the platform.',
    })
    const data = parseResult(result) as {
      summary: string
      target_path: string
      template: string
      failures: string[]
    }

    expect(result.isError).toStrictEqual(false)
    expect(data.target_path).toMatch(/_overview\.md$/)
    expect(data.template).toContain('Platform New Feature')

    // Platform-first: pushEvent must have fired with blueprint.created
    expect(pushEvent).toHaveBeenCalledOnce()
    const [eventArg] = pushEvent.mock.calls[0] ?? []
    expect(eventArg?.type).toStrictEqual('blueprint.created')
    expect(eventArg?.payload).toMatchObject({
      type: 'blueprint.created',
      slug: 'platform-new-feature',
      title: 'Platform New Feature',
      complexity: 'M',
      status: 'draft',
    })
    expect(typeof eventArg?.eventId).toStrictEqual('string')
    expect(eventArg?.eventId.length).toBeGreaterThan(0)

    // ensureFresh is NOT called for new (no remote state to pull)
    expect(ensureFresh).not.toHaveBeenCalled()
  })

  it('does NOT call pushEvent when WP_BLUEPRINT_PLATFORM_DISABLED=1 (iron rule)', async () => {
    vi.stubEnv('WP_BLUEPRINT_PLATFORM_DISABLED', '1')

    const pushEvent = vi.fn<SyncAdapter['pushEvent']>().mockResolvedValue(undefined)
    const ensureFresh = vi.fn<SyncAdapter['ensureFresh']>().mockResolvedValue(undefined)
    _setSyncAdapterFactory(() => ({ pushEvent, ensureFresh }))

    const result = await callTool(tools, 'wp_blueprint_new', {
      title: 'Disabled New Feature',
      goal_prompt: 'Should not push event.',
    })
    const data = parseResult(result) as { failures: string[] }

    expect(result.isError).toStrictEqual(false)
    expect(data.failures).toHaveLength(0)

    // Iron rule: no platform calls when disabled
    expect(pushEvent).not.toHaveBeenCalled()
    expect(ensureFresh).not.toHaveBeenCalled()
  })

})

// ---------------------------------------------------------------------------
// wp_blueprint_task_next — ensureFresh-before-read (Task 2.5)
// ---------------------------------------------------------------------------

describe('wp_blueprint_task_next — ensureFresh-before-read (Task 2.5)', () => {
  afterEach(() => {
    _setSyncAdapterFactory(null)
    vi.unstubAllEnvs()
  })

  it('calls ensureFresh before reading when adapter is available', async () => {
    const pushEvent = vi.fn<SyncAdapter['pushEvent']>().mockResolvedValue(undefined)
    const ensureFresh = vi.fn<SyncAdapter['ensureFresh']>().mockResolvedValue(undefined)
    _setSyncAdapterFactory(() => ({ pushEvent, ensureFresh }))

    const result = await callTool(tools, 'wp_blueprint_task_next', {})
    const data = parseResult(result) as { task: unknown; failures: string[] }

    expect(result.isError).toStrictEqual(false)
    expect(data.task).toBeNull()

    // ensureFresh must be called before reading
    expect(ensureFresh).toHaveBeenCalledOnce()

    // pushEvent must NOT be called (read-only handler)
    expect(pushEvent).not.toHaveBeenCalled()
  })

  it('calls ensureFresh with slug when blueprint filter is specified', async () => {
    const pushEvent = vi.fn<SyncAdapter['pushEvent']>().mockResolvedValue(undefined)
    const ensureFresh = vi.fn<SyncAdapter['ensureFresh']>().mockResolvedValue(undefined)
    _setSyncAdapterFactory(() => ({ pushEvent, ensureFresh }))

    const result = await callTool(tools, 'wp_blueprint_task_next', {
      blueprint: 'some-slug',
    })

    expect(result.isError).toStrictEqual(false)

    // ensureFresh must be called with the slug
    expect(ensureFresh).toHaveBeenCalledOnce()
    expect(ensureFresh).toHaveBeenCalledWith({ slug: 'some-slug' })

    expect(pushEvent).not.toHaveBeenCalled()
  })

  it('does NOT call ensureFresh when WP_BLUEPRINT_PLATFORM_DISABLED=1 (iron rule)', async () => {
    vi.stubEnv('WP_BLUEPRINT_PLATFORM_DISABLED', '1')

    const pushEvent = vi.fn<SyncAdapter['pushEvent']>().mockResolvedValue(undefined)
    const ensureFresh = vi.fn<SyncAdapter['ensureFresh']>().mockResolvedValue(undefined)
    _setSyncAdapterFactory(() => ({ pushEvent, ensureFresh }))

    const result = await callTool(tools, 'wp_blueprint_task_next', {})
    const data = parseResult(result) as { task: unknown; failures: string[] }

    expect(result.isError).toStrictEqual(false)
    expect(data.task).toBeNull()

    // Iron rule: no platform calls when disabled
    expect(ensureFresh).not.toHaveBeenCalled()
    expect(pushEvent).not.toHaveBeenCalled()
  })

  it('falls back to local replica when ensureFresh times out', async () => {
    vi.stubEnv('WP_BLUEPRINT_READ_FRESH_TIMEOUT_MS', '1')

    const pushEvent = vi.fn<SyncAdapter['pushEvent']>().mockResolvedValue(undefined)
    const ensureFresh = vi
      .fn<SyncAdapter['ensureFresh']>()
      .mockImplementation(() => new Promise<void>(() => {}))
    _setSyncAdapterFactory(() => ({ pushEvent, ensureFresh }))

    const result = await callTool(tools, 'wp_blueprint_task_next', {})
    const data = parseResult(result) as { task: unknown; failures: string[] }

    expect(result.isError).toStrictEqual(false)
    expect(data.task).toBeNull()
    expect(data.failures).toEqual(
      expect.arrayContaining([
        expect.stringContaining('Platform freshness refresh skipped: ensureFresh timed out'),
      ]),
    )
    expect(ensureFresh).toHaveBeenCalledOnce()
    expect(pushEvent).not.toHaveBeenCalled()
  })
})
