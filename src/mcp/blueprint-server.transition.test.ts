import { readFileSync } from 'node:fs'

import { afterEach, beforeEach, describe, expect, it } from 'vitest'

import {
  bootstrapBlueprintProjection,
  callTool,
  cleanupTempDir,
  makeProjectionBackedBlueprintHarness,
  parseResult,
  type ToolMap,
} from './blueprint-server.test-harness.js'

const TRANSITION_SLUG = 'transition-test-blueprint'

const TRANSITION_ZERO_TASK_BLUEPRINT = `---
type: blueprint
title: Transition Zero Task Blueprint
status: planned
complexity: S
owner: tester
created: '2026-01-01'
last_updated: '2026-05-01'
---

## Product wedge anchor

- **Stage outcome:** Phase 1 — prove transition behavior
- **Consuming surface:** /transition route
- **New user-visible capability:** Users can transition blueprints safely.

## Summary

Blueprint used to test zero-task completed transition rejection.
`

const TRANSITION_BLUEPRINT = `---
type: blueprint
title: Transition Test Blueprint
status: draft
complexity: S
owner: tester
created: '2026-01-01'
last_updated: '2026-05-01'
---

## Product wedge anchor

- **Stage outcome:** Phase 1 — prove transition behavior
- **Consuming surface:** /transition route
- **New user-visible capability:** Users can transition blueprints safely.

## Summary

Blueprint used to test atomic transitions.

#### Task 1.1: First task

**Status:** todo
**Wave:** 0

**Acceptance:**
- [ ] Task remains pending until transitioned work begins
`

let tmpDir: string
let overviewPath: string
let tools: ToolMap

beforeEach(async () => {
  const harness = await makeProjectionBackedBlueprintHarness('wp-bs-transition-', [
    { stateDir: 'draft', slug: TRANSITION_SLUG, content: TRANSITION_BLUEPRINT },
  ])
  tmpDir = harness.tmpDir
  overviewPath = harness.overviewPaths[0]!
  tools = harness.tools
})

afterEach(() => {
  cleanupTempDir(tmpDir)
})

describe('wp_blueprint_transition', () => {
  it('transitions a draft blueprint to planned when expected_version matches', async () => {
    const getResult = await callTool(tools, 'wp_blueprint_get', {
      project_id: tmpDir,
      slug: TRANSITION_SLUG,
    })
    const before = parseResult(getResult) as { content_hash: string }

    const result = await callTool(tools, 'wp_blueprint_transition', {
      project_id: tmpDir,
      slug: TRANSITION_SLUG,
      to_state: 'planned',
      expected_version: before.content_hash,
    })
    const data = parseResult(result) as {
      slug: string
      status: string
      content_hash: string
      old_status: string
      new_status: string
      failures: string[]
    }

    expect(result.isError).toStrictEqual(false)
    expect(data.slug).toBe(TRANSITION_SLUG)
    expect(data.old_status).toBe('draft')
    expect(data.new_status).toBe('planned')
    expect(data.status).toBe('planned')
    expect(data.content_hash).not.toBe(before.content_hash)
    expect(data.failures).toStrictEqual([])
    const plannedPath = overviewPath.replace('/draft/', '/planned/')
    expect(readFileSync(plannedPath, 'utf8')).toContain('status: planned')
  })

  it('rejects stale expected_version with structured conflict information', async () => {
    const result = await callTool(tools, 'wp_blueprint_transition', {
      project_id: tmpDir,
      slug: TRANSITION_SLUG,
      to_state: 'planned',
      expected_version: 'stale-version-token',
    })

    expect(result.isError).toStrictEqual(true)
    const data = parseResult(result) as {
      error?: string
      failures: string[]
      next_action?: { kind: string }
    }
    expect(data.error).toBe('stale_blueprint_revision')
    expect(data.failures[0]).toMatch(/expected_version/i)
    expect(data.next_action?.kind).toBe('reingest_project')
  })

  it('refuses invalid structure before transitioning lifecycle state', async () => {
    const putResult = await callTool(tools, 'wp_blueprint_put', {
      project_id: tmpDir,
      slug: TRANSITION_SLUG,
      document: {
        type: 'blueprint',
        title: 'Broken transition blueprint',
        status: 'draft',
        complexity: 'S',
        owner: 'tester',
        created: '2026-01-01',
        last_updated: '2026-05-01',
        product_wedge_anchor: {
          stage_outcome: 'broken',
          consuming_surface: 'broken',
          new_user_visible_capability: 'broken',
        },
        summary: 'broken',
        tasks: [
          {
            id: '1.1',
            title: 'Broken task',
            status: 'todo',
            acceptance: ['broken'],
          },
        ],
      },
    })
    parseResult(putResult) as { content_hash: string }

    // Break structure after put to exercise transition-time revalidation.
    const raw = readFileSync(overviewPath, 'utf8').replace(
      '## Product wedge anchor',
      '## Missing wedge',
    )
    await import('node:fs/promises').then(({ writeFile }) => writeFile(overviewPath, raw, 'utf8'))
    await bootstrapBlueprintProjection(tmpDir)
    const refreshed = await callTool(tools, 'wp_blueprint_get', {
      project_id: tmpDir,
      slug: TRANSITION_SLUG,
    })
    const refreshedData = parseResult(refreshed) as { content_hash: string }

    const result = await callTool(tools, 'wp_blueprint_transition', {
      project_id: tmpDir,
      slug: TRANSITION_SLUG,
      to_state: 'planned',
      expected_version: refreshedData.content_hash,
    })

    expect(result.isError).toStrictEqual(true)
    const data = parseResult(result) as { failures: string[] }
    expect(data.failures[0]).toMatch(/product wedge anchor/i)
  })

  it('refuses to transition directly to completed while a task is still open (closes the finalize-bypass hole)', async () => {
    const getResult = await callTool(tools, 'wp_blueprint_get', {
      project_id: tmpDir,
      slug: TRANSITION_SLUG,
    })
    const before = parseResult(getResult) as { content_hash: string }

    const result = await callTool(tools, 'wp_blueprint_transition', {
      project_id: tmpDir,
      slug: TRANSITION_SLUG,
      to_state: 'completed',
      expected_version: before.content_hash,
    })

    expect(result.isError).toStrictEqual(true)
    const data = parseResult(result) as { failures: string[] }
    expect(data.failures.some((f) => /not done/i.test(f))).toBe(true)
  })

  it('refuses to transition a zero-task planned blueprint directly to completed', async () => {
    const harness = await makeProjectionBackedBlueprintHarness('wp-bs-transition-zero-task-', [
      {
        stateDir: 'planned',
        slug: 'transition-zero-task-blueprint',
        content: TRANSITION_ZERO_TASK_BLUEPRINT,
      },
    ])
    try {
      const getResult = await callTool(harness.tools, 'wp_blueprint_get', {
        project_id: harness.tmpDir,
        slug: 'transition-zero-task-blueprint',
      })
      const before = parseResult(getResult) as { content_hash: string }

      const result = await callTool(harness.tools, 'wp_blueprint_transition', {
        project_id: harness.tmpDir,
        slug: 'transition-zero-task-blueprint',
        to_state: 'completed',
        expected_version: before.content_hash,
      })

      expect(result.isError).toStrictEqual(true)
      const data = parseResult(result) as { failures: string[] }
      expect(data.failures.some((f) => /zero-task|0 tasks|no tasks/i.test(f))).toBe(true)
    } finally {
      cleanupTempDir(harness.tmpDir)
    }
  })

  it('allows transitioning to completed when all remaining tasks are dropped', async () => {
    const raw = readFileSync(overviewPath, 'utf8').replace(
      '**Status:** todo',
      '**Status:** dropped',
    )
    await import('node:fs/promises').then(({ writeFile }) => writeFile(overviewPath, raw, 'utf8'))
    await bootstrapBlueprintProjection(tmpDir)

    const getResult = await callTool(tools, 'wp_blueprint_get', {
      project_id: tmpDir,
      slug: TRANSITION_SLUG,
    })
    const before = parseResult(getResult) as { content_hash: string }

    const result = await callTool(tools, 'wp_blueprint_transition', {
      project_id: tmpDir,
      slug: TRANSITION_SLUG,
      to_state: 'completed',
      expected_version: before.content_hash,
    })

    expect(result.isError).toStrictEqual(false)
    const data = parseResult(result) as { new_status: string; status: string; failures: string[] }
    expect(data.new_status).toBe('completed')
    expect(data.status).toBe('completed')
    expect(data.failures).toStrictEqual([])
  })
})
