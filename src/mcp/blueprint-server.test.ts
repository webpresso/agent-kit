/**
 * Tests for the blueprint MCP server (Tasks 2.1–2.5).
 *
 * Task 2.1 tests exercise `ak_blueprint_task_advance` with platform-first path,
 * iron rule regression (AK_BLUEPRINT_PLATFORM_DISABLED=1), and null-credentials
 * fallback — all patterns established here for Wave 2 tasks 2.2-2.7 to copy.
 *
 * Task 2.2 tests exercise `ak_blueprint_promote` platform-first path.
 * Task 2.3 tests exercise `ak_blueprint_finalize` platform-first path.
 * Task 2.4 tests exercise `ak_blueprint_new` platform-first path (pushEvent before scaffold).
 * Task 2.5 tests exercise `ak_blueprint_task_next` ensureFresh-before-read path.
 *
 * Prior Task 2.2 tests (validate, new bundle, task_next empty-DB) remain unchanged.
 *
 * All tests use an in-memory DB via a temp directory so they leave no state.
 */

import { mkdtempSync, mkdirSync, writeFileSync, readFileSync, rmSync } from 'node:fs'
import path from 'node:path'
import { tmpdir } from 'node:os'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

import type { ToolRegistrar, ToolHandler, ToolHandlerResult } from './auto-discover.js'
import { registerBlueprintTools, _setSyncAdapterFactory } from './blueprint-server.js'
import type { SyncAdapter } from './blueprint-server.js'

// ---------------------------------------------------------------------------
// Minimal ToolRegistrar implementation for testing
// ---------------------------------------------------------------------------

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

// ---------------------------------------------------------------------------
// Fixture blueprints
// ---------------------------------------------------------------------------

const VALID_BLUEPRINT = `---
type: blueprint
title: My Feature Blueprint
status: draft
complexity: M
owner: alice
created: '2026-01-15'
last_updated: '2026-04-01'
---

## Product wedge anchor

- **Stage outcome:** Phase 1 — ship feature X
- **Consuming surface:** /dashboard route
- **New user-visible capability:** Users can see feature X on the dashboard.

## Summary

A well-formed blueprint for testing.

#### Task 1.1: Do the thing

**Status:** todo
**Wave:** 0

**Acceptance:**
- [ ] The thing is done
`

const INVALID_BLUEPRINT_MISSING_WEDGE = `---
type: blueprint
title: Bad Blueprint
status: draft
complexity: M
owner: alice
created: '2026-01-15'
last_updated: '2026-04-01'
---

## Summary

This blueprint is missing the product wedge anchor and task acceptance.

#### Task 1.1: Do the thing

**Status:** todo
`

const INVALID_BLUEPRINT_NO_TASKS = `---
type: blueprint
title: No Tasks Blueprint
status: draft
complexity: S
owner: bob
created: '2026-01-15'
last_updated: '2026-04-01'
---

## Product wedge anchor

- **Stage outcome:** something
- **Consuming surface:** /somewhere
- **New user-visible capability:** something

## Summary

Blueprint with no task sections at all.
`

const INVALID_BLUEPRINT_MISSING_FRONTMATTER = `---
type: blueprint
title: ''
status: draft
complexity: M
---

## Product wedge anchor

- **Stage outcome:** x
- **Consuming surface:** /x
- **New user-visible capability:** x

#### Task 1.1: A task

**Status:** todo

**Acceptance:**
- [ ] something
`

// ---------------------------------------------------------------------------
// Test setup
// ---------------------------------------------------------------------------

let tmpDir: string
let tools: Map<string, { name: string; handler: ToolHandler }>

beforeEach(async () => {
  tmpDir = mkdtempSync(path.join(tmpdir(), 'ak-bs-test-'))
  // Create .agent dir (needed by cold-start)
  mkdirSync(path.join(tmpDir, '.agent'), { recursive: true })
  // Create a minimal blueprints directory so coldStartIfNeeded doesn't crash
  mkdirSync(path.join(tmpDir, 'blueprints', 'draft'), { recursive: true })
  // Create package.json marker so resolveBlueprintRoot picks up the default layout
  writeFileSync(path.join(tmpDir, 'package.json'), JSON.stringify({ name: 'test' }), 'utf8')

  const { registrar, tools: t } = makeRegistrar()
  await registerBlueprintTools(registrar, tmpDir)
  tools = t
})

afterEach(() => {
  rmSync(tmpDir, { recursive: true, force: true })
})

// ---------------------------------------------------------------------------
// ak_blueprint_validate — valid blueprint
// ---------------------------------------------------------------------------

describe('ak_blueprint_validate', () => {
  it('passes for a well-formed blueprint', async () => {
    const overviewPath = path.join(tmpDir, 'blueprints', 'draft', 'my-feature', '_overview.md')
    mkdirSync(path.dirname(overviewPath), { recursive: true })
    writeFileSync(overviewPath, VALID_BLUEPRINT, 'utf8')

    const result = await callTool(tools, 'ak_blueprint_validate', { path: overviewPath })
    const data = parseResult(result) as { valid: boolean; gaps: string[]; summary: string }

    expect(result.isError).toStrictEqual(false)
    expect(data.valid).toBe(true)
    expect(data.gaps).toHaveLength(0)
    expect(data.summary).toContain('is valid')
  })

  it('returns gaps for a blueprint missing the product wedge anchor and task acceptance', async () => {
    const overviewPath = path.join(tmpDir, 'blueprints', 'draft', 'bad-bp', '_overview.md')
    mkdirSync(path.dirname(overviewPath), { recursive: true })
    writeFileSync(overviewPath, INVALID_BLUEPRINT_MISSING_WEDGE, 'utf8')

    const result = await callTool(tools, 'ak_blueprint_validate', { path: overviewPath })
    const data = parseResult(result) as { valid: boolean; gaps: string[] }

    expect(result.isError).toStrictEqual(false)
    expect(data.valid).toBe(false)
    expect(data.gaps.length).toBeGreaterThan(0)
    // Should call out the missing wedge anchor
    const hasWedgeGap = data.gaps.some((g) => g.toLowerCase().includes('wedge'))
    expect(hasWedgeGap).toBe(true)
  })

  it('returns gap when there are no task sections', async () => {
    const overviewPath = path.join(tmpDir, 'blueprints', 'draft', 'no-tasks', '_overview.md')
    mkdirSync(path.dirname(overviewPath), { recursive: true })
    writeFileSync(overviewPath, INVALID_BLUEPRINT_NO_TASKS, 'utf8')

    const result = await callTool(tools, 'ak_blueprint_validate', { path: overviewPath })
    const data = parseResult(result) as { valid: boolean; gaps: string[] }

    expect(data.valid).toBe(false)
    const hasTaskGap = data.gaps.some((g) => g.toLowerCase().includes('task'))
    expect(hasTaskGap).toBe(true)
  })

  it('returns gap for missing required frontmatter fields', async () => {
    const overviewPath = path.join(tmpDir, 'blueprints', 'draft', 'no-fm', '_overview.md')
    mkdirSync(path.dirname(overviewPath), { recursive: true })
    writeFileSync(overviewPath, INVALID_BLUEPRINT_MISSING_FRONTMATTER, 'utf8')

    const result = await callTool(tools, 'ak_blueprint_validate', { path: overviewPath })
    const data = parseResult(result) as { valid: boolean; gaps: string[] }

    expect(data.valid).toBe(false)
    // owner and title are empty
    const hasFmGap = data.gaps.some((g) => g.includes('frontmatter'))
    expect(hasFmGap).toBe(true)
  })

  it('returns error when file does not exist', async () => {
    const result = await callTool(tools, 'ak_blueprint_validate', {
      path: '/nonexistent/path/_overview.md',
    })
    const data = parseResult(result) as { valid: boolean; gaps: string[] }

    expect(data.valid).toBe(false)
    expect(data.gaps[0]).toMatch(/not found/i)
  })
})

// ---------------------------------------------------------------------------
// ak_blueprint_new — drafting bundle
// ---------------------------------------------------------------------------

describe('ak_blueprint_new', () => {
  it('returns a bundle with all required fields', async () => {
    const result = await callTool(tools, 'ak_blueprint_new', {
      title: 'Test Feature',
      complexity: 'S',
      goal_prompt: 'Build a test feature that does something useful.',
    })

    const data = parseResult(result) as {
      summary: string
      target_path: string
      template: string
      rules_context: string | null
      examples: unknown[]
      lifecycle_advice: string
      validation_required: boolean
      bytes: number
    }

    expect(result.isError).toStrictEqual(false)
    expect(typeof data.summary).toBe('string')
    expect(data.target_path).toMatch(/_overview\.md$/)
    expect(data.target_path).toContain('draft')
    expect(data.template).toContain('Test Feature')
    expect(data.template).toContain('Build a test feature')
    expect(Array.isArray(data.examples)).toBe(true)
    expect(data.lifecycle_advice).toContain('/plan-refine')
    expect(data.validation_required).toBe(true)
    expect(data.bytes).toBeGreaterThan(0)
  })

  it('includes the goal_prompt in the template', async () => {
    const goalPrompt = 'Enable users to export their data in CSV format'
    const result = await callTool(tools, 'ak_blueprint_new', {
      title: 'CSV Export',
      goal_prompt: goalPrompt,
    })
    const data = parseResult(result) as { template: string }
    expect(data.template).toContain(goalPrompt)
  })

  it('defaults complexity to M when not specified', async () => {
    const result = await callTool(tools, 'ak_blueprint_new', {
      title: 'No Complexity',
      goal_prompt: 'some goal',
    })
    const data = parseResult(result) as { template: string; summary: string }
    expect(data.template).toContain('complexity: M')
    expect(data.summary).toContain('complexity M')
  })

  it('returns validation error for missing required fields', async () => {
    const result = await callTool(tools, 'ak_blueprint_new', { title: 'Only Title' })
    const data = parseResult(result) as { failures: string[] }
    expect(result.isError).toBe(true)
    expect(data.failures.length).toBeGreaterThan(0)
  })
})

// ---------------------------------------------------------------------------
// ak_blueprint_task_next — empty DB
// ---------------------------------------------------------------------------

describe('ak_blueprint_task_next', () => {
  it('returns null task on an empty DB', async () => {
    const result = await callTool(tools, 'ak_blueprint_task_next', {})
    const data = parseResult(result) as { task: unknown; summary: string }

    expect(result.isError).toStrictEqual(false)
    expect(data.task).toBeNull()
    expect(data.summary).toMatch(/no ready tasks/i)
  })

  it('returns null task when scoped to a nonexistent blueprint slug', async () => {
    const result = await callTool(tools, 'ak_blueprint_task_next', {
      blueprint: 'nonexistent-slug',
    })
    const data = parseResult(result) as { task: unknown }

    expect(result.isError).toStrictEqual(false)
    expect(data.task).toBeNull()
  })
})

// ---------------------------------------------------------------------------
// ak_blueprint_task_advance — platform-first path (Task 2.1)
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

describe('ak_blueprint_task_advance', () => {
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
    localTools: Map<string, { name: string; handler: ToolHandler }>
  }> {
    const localTmpDir = mkdtempSync(path.join(tmpdir(), 'ak-bs-adv-'))
    mkdirSync(path.join(localTmpDir, '.agent'), { recursive: true })
    mkdirSync(path.join(localTmpDir, 'blueprints', 'draft'), { recursive: true })
    writeFileSync(path.join(localTmpDir, 'package.json'), JSON.stringify({ name: 'test' }), 'utf8')
    const overviewPath = writeBlueprintFixture(localTmpDir)
    const { registrar, tools: t } = makeRegistrar()
    await registerBlueprintTools(registrar, localTmpDir)
    return { overviewPath, localTools: t }
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

    const { overviewPath, localTools } = await setupWithBlueprint()

    const result = await callTool(localTools, 'ak_blueprint_task_advance', {
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

  it('does NOT call pushEvent when AK_BLUEPRINT_PLATFORM_DISABLED=1 (iron rule)', async () => {
    vi.stubEnv('AK_BLUEPRINT_PLATFORM_DISABLED', '1')

    const pushEvent = vi.fn<SyncAdapter['pushEvent']>().mockResolvedValue(undefined)
    const ensureFresh = vi.fn<SyncAdapter['ensureFresh']>().mockResolvedValue(undefined)
    const mockAdapter: SyncAdapter = { pushEvent, ensureFresh }
    // Even if someone injects an adapter, DISABLED must win
    _setSyncAdapterFactory(() => mockAdapter)

    const { overviewPath, localTools } = await setupWithBlueprint()

    const result = await callTool(localTools, 'ak_blueprint_task_advance', {
      task_id: '1.1',
      to: 'done',
    })
    const data = parseResult(result) as { new_status: string; failures: string[] }

    // Iron rule: result must be successful (markdown-canonical path)
    expect(result.isError).toStrictEqual(false)
    expect(data.new_status).toStrictEqual('done')
    expect(data.failures).toHaveLength(0)

    // Iron rule: platform calls must NOT happen when disabled
    expect(pushEvent).not.toHaveBeenCalled()
    expect(ensureFresh).not.toHaveBeenCalled()

    // Markdown must still be updated via the canonical path
    const md = readFileSync(overviewPath, 'utf8')
    expect(md).toContain('**Status:** done')
  })

  it('falls back to markdown-canonical path when factory returns null (no credentials)', async () => {
    // Factory returns null = no credentials available
    _setSyncAdapterFactory(() => null)

    const { overviewPath, localTools } = await setupWithBlueprint()

    const result = await callTool(localTools, 'ak_blueprint_task_advance', {
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

    const result = await callTool(tools, 'ak_blueprint_task_advance', {
      task_id: 'nonexistent.99',
      to: 'done',
    })
    expect(result.isError).toBe(true)
    const data = parseResult(result) as { failures: string[] }
    expect(data.failures.length).toBeGreaterThan(0)
  })
})

// ---------------------------------------------------------------------------
// ak_blueprint_promote — platform-first path (Task 2.2)
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

describe('ak_blueprint_promote — platform-first (Task 2.2)', () => {
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
    await callTool(t, 'ak_blueprint_validate', { path: overviewPath })
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

    const result = await callTool(localTools, 'ak_blueprint_promote', {
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

  it('does NOT call pushEvent when AK_BLUEPRINT_PLATFORM_DISABLED=1 (iron rule)', async () => {
    vi.stubEnv('AK_BLUEPRINT_PLATFORM_DISABLED', '1')

    const pushEvent = vi.fn<SyncAdapter['pushEvent']>().mockResolvedValue(undefined)
    const ensureFresh = vi.fn<SyncAdapter['ensureFresh']>().mockResolvedValue(undefined)
    _setSyncAdapterFactory(() => ({ pushEvent, ensureFresh }))

    const { localTools } = await setupWithPromoteBlueprint()

    const result = await callTool(localTools, 'ak_blueprint_promote', {
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
// ak_blueprint_finalize — platform-first path (Task 2.3)
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

describe('ak_blueprint_finalize — platform-first (Task 2.3)', () => {
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

    const result = await callTool(localTools, 'ak_blueprint_finalize', {
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

  it('does NOT call pushEvent when AK_BLUEPRINT_PLATFORM_DISABLED=1 (iron rule)', async () => {
    vi.stubEnv('AK_BLUEPRINT_PLATFORM_DISABLED', '1')

    const pushEvent = vi.fn<SyncAdapter['pushEvent']>().mockResolvedValue(undefined)
    const ensureFresh = vi.fn<SyncAdapter['ensureFresh']>().mockResolvedValue(undefined)
    _setSyncAdapterFactory(() => ({ pushEvent, ensureFresh }))

    const { localTools } = await setupWithFinalizeBlueprint()

    const result = await callTool(localTools, 'ak_blueprint_finalize', {
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
// ak_blueprint_new — platform-first path (Task 2.4)
// ---------------------------------------------------------------------------

describe('ak_blueprint_new — platform-first (Task 2.4)', () => {
  afterEach(() => {
    _setSyncAdapterFactory(null)
    vi.unstubAllEnvs()
  })

  it('pushes blueprint.created event before returning scaffold when adapter is available', async () => {
    const pushEvent = vi.fn<SyncAdapter['pushEvent']>().mockResolvedValue(undefined)
    const ensureFresh = vi.fn<SyncAdapter['ensureFresh']>().mockResolvedValue(undefined)
    _setSyncAdapterFactory(() => ({ pushEvent, ensureFresh }))

    const result = await callTool(tools, 'ak_blueprint_new', {
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

  it('does NOT call pushEvent when AK_BLUEPRINT_PLATFORM_DISABLED=1 (iron rule)', async () => {
    vi.stubEnv('AK_BLUEPRINT_PLATFORM_DISABLED', '1')

    const pushEvent = vi.fn<SyncAdapter['pushEvent']>().mockResolvedValue(undefined)
    const ensureFresh = vi.fn<SyncAdapter['ensureFresh']>().mockResolvedValue(undefined)
    _setSyncAdapterFactory(() => ({ pushEvent, ensureFresh }))

    const result = await callTool(tools, 'ak_blueprint_new', {
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
// ak_blueprint_task_next — ensureFresh-before-read (Task 2.5)
// ---------------------------------------------------------------------------

describe('ak_blueprint_task_next — ensureFresh-before-read (Task 2.5)', () => {
  afterEach(() => {
    _setSyncAdapterFactory(null)
    vi.unstubAllEnvs()
  })

  it('calls ensureFresh before reading when adapter is available', async () => {
    const pushEvent = vi.fn<SyncAdapter['pushEvent']>().mockResolvedValue(undefined)
    const ensureFresh = vi.fn<SyncAdapter['ensureFresh']>().mockResolvedValue(undefined)
    _setSyncAdapterFactory(() => ({ pushEvent, ensureFresh }))

    const result = await callTool(tools, 'ak_blueprint_task_next', {})
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

    const result = await callTool(tools, 'ak_blueprint_task_next', {
      blueprint: 'some-slug',
    })

    expect(result.isError).toStrictEqual(false)

    // ensureFresh must be called with the slug
    expect(ensureFresh).toHaveBeenCalledOnce()
    expect(ensureFresh).toHaveBeenCalledWith({ slug: 'some-slug' })

    expect(pushEvent).not.toHaveBeenCalled()
  })

  it('does NOT call ensureFresh when AK_BLUEPRINT_PLATFORM_DISABLED=1 (iron rule)', async () => {
    vi.stubEnv('AK_BLUEPRINT_PLATFORM_DISABLED', '1')

    const pushEvent = vi.fn<SyncAdapter['pushEvent']>().mockResolvedValue(undefined)
    const ensureFresh = vi.fn<SyncAdapter['ensureFresh']>().mockResolvedValue(undefined)
    _setSyncAdapterFactory(() => ({ pushEvent, ensureFresh }))

    const result = await callTool(tools, 'ak_blueprint_task_next', {})
    const data = parseResult(result) as { task: unknown; failures: string[] }

    expect(result.isError).toStrictEqual(false)
    expect(data.task).toBeNull()

    // Iron rule: no platform calls when disabled
    expect(ensureFresh).not.toHaveBeenCalled()
    expect(pushEvent).not.toHaveBeenCalled()
  })
})

// ---------------------------------------------------------------------------
// General registration test
// ---------------------------------------------------------------------------

describe('registerBlueprintTools', () => {
  it('registers all 8 blueprint tools', () => {
    const expectedTools = [
      'ak_blueprint_query',
      'ak_blueprint_new',
      'ak_blueprint_validate',
      'ak_blueprint_task_next',
      'ak_blueprint_task_advance',
      'ak_blueprint_promote',
      'ak_blueprint_finalize',
      'ak_blueprint_depgraph',
    ]
    for (const name of expectedTools) {
      expect(tools.has(name), `${name} should be registered`).toBe(true)
    }
    expect(tools.size).toBe(expectedTools.length)
  })
})
