/**
 * Tests for the blueprint MCP server (Task 2.2).
 *
 * These tests exercise `ak_blueprint_validate` (primary structural-check tool),
 * `ak_blueprint_new` (drafting bundle), and `ak_blueprint_task_next` (next-task
 * query against an empty DB) — the minimum required by the task spec.
 *
 * All tests use an in-memory DB via a temp directory so they leave no state.
 */

import { mkdtempSync, mkdirSync, writeFileSync, rmSync } from 'node:fs'
import path from 'node:path'
import { tmpdir } from 'node:os'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'

import type { ToolRegistrar, ToolHandler, ToolHandlerResult } from './auto-discover.js'
import { registerBlueprintTools } from './blueprint-server.js'

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

    expect(result.isError).toBeFalsy()
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

    expect(result.isError).toBeFalsy()
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

    expect(result.isError).toBeFalsy()
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

    expect(result.isError).toBeFalsy()
    expect(data.task).toBeNull()
    expect(data.summary).toMatch(/no ready tasks/i)
  })

  it('returns null task when scoped to a nonexistent blueprint slug', async () => {
    const result = await callTool(tools, 'ak_blueprint_task_next', {
      blueprint: 'nonexistent-slug',
    })
    const data = parseResult(result) as { task: unknown }

    expect(result.isError).toBeFalsy()
    expect(data.task).toBeNull()
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
