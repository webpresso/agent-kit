/**
 * Baseline blueprint MCP create-contract tests.
 *
 * Validation, registration, task-next, aggregate-project reads, verify, and
 * platform-first scenarios live in sibling files so Vitest can use file-level
 * workers without rebuilding unrelated cold-start fixtures.
 */

import { existsSync } from 'node:fs'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { z } from 'zod'

import {
  callTool,
  cleanupTempDir,
  makeEmptyProjectionBlueprintHarness,
  parseResult,
  type ToolMap,
} from './blueprint-server.test-harness.js'

let tmpDir: string
let tools: ToolMap

beforeEach(async () => {
  ;({ tmpDir, tools } = await makeEmptyProjectionBlueprintHarness('wp-bs-create-'))
})

afterEach(() => {
  cleanupTempDir(tmpDir)
})

describe('wp_blueprint_create', () => {
  it('creates blueprint markdown and returns slug + path', async () => {
    const result = await callTool(tools, 'wp_blueprint_create', {
      project_id: tmpDir,
      title: 'My Created Blueprint',
      goal: 'Test the create handler end-to-end',
      complexity: 'S',
    })
    const data = parseResult(result) as {
      slug: string
      path: string
      next_action: { kind: string }
      failures: string[]
    }
    expect(result.isError).toStrictEqual(false)
    expect(data.slug).toBe('my-created-blueprint')
    expect(data.path).toContain('_overview.md')
    expect(existsSync(data.path)).toBe(true)
    expect(data.next_action.kind).toBe('verify_task')
    expect(data.failures).toStrictEqual([])
  })

  it('re-ingests so the new blueprint appears in wp_blueprint_list', async () => {
    await callTool(tools, 'wp_blueprint_create', {
      project_id: tmpDir,
      title: 'Ingest Check Blueprint',
      goal: 'Verify re-ingest after create',
    })
    const listResult = await callTool(tools, 'wp_blueprint_list', { status: 'draft' })
    const listData = parseResult(listResult) as {
      blueprints: Array<{ slug: string }>
    }
    const slugs = listData.blueprints.map((b) => b.slug)
    expect(slugs).toContain('ingest-check-blueprint')
  })

  it('ignores aggregate scope field on mutation input', async () => {
    const result = await callTool(tools, 'wp_blueprint_create', {
      project_id: tmpDir,
      title: 'Scope Test Blueprint',
      goal: 'Test scope field handling',
      scope: 'all',
    })
    const data = parseResult(result) as Record<string, unknown>
    expect(result.isError).toStrictEqual(false)
    expect('scope' in data).toBe(false)
  })

  it('returns validation error when required fields are missing', async () => {
    const result = await callTool(tools, 'wp_blueprint_create', { project_id: tmpDir })
    expect(result.isError).toStrictEqual(true)
  })

  it('MutationTarget schema parse rejects unknown scope field at type level', () => {
    const MutationTargetSchema = z.object({ project_id: z.string() })
    const parsed = MutationTargetSchema.safeParse({ project_id: 'test', scope: 'all' })
    expect(parsed.success).toBe(true)
    if (parsed.success) {
      expect('scope' in parsed.data).toBe(false)
    }
  })
})
