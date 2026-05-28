import { afterAll, beforeAll, describe, expect, it } from 'vitest'

import type { ToolMap } from './blueprint-server.test-harness.js'
import {
  callTool,
  cleanupTempDir,
  makeProjectionBackedBlueprintHarness,
  parseResult,
  VALID_BLUEPRINT,
} from './blueprint-server.test-harness.js'

describe('Task 3.3 — wp_blueprint_list with aggregate scope', () => {
  let tmpDir: string
  let tools: ToolMap

  beforeAll(async () => {
    ;({ tmpDir, tools } = await makeProjectionBackedBlueprintHarness('wp-bs-projects-list-', [
      {
        stateDir: 'draft',
        slug: 'scope-current-blueprint',
        content: VALID_BLUEPRINT,
      },
    ]))
  })

  afterAll(() => {
    cleanupTempDir(tmpDir)
  })

  it('wp legacy blueprint facade is NOT registered (old facade deleted)', () => {
    expect(tools.has('ak_blueprint')).toBe(false)
  })

  it('wp_blueprint_list with scope: current returns blueprints from single project', async () => {
    const result = await callTool(tools, 'wp_blueprint_list', { scope: 'current' })
    expect(result.isError).toStrictEqual(false)
    const data = parseResult<{
      blueprints: Array<{ slug: string }>
      failures: unknown[]
    }>(result)
    expect(Array.isArray(data.blueprints)).toBe(true)
    expect(Array.isArray(data.failures)).toBe(true)
    expect(data.blueprints.some((blueprint) => blueprint.slug === 'scope-current-blueprint')).toBe(
      true,
    )
  })

  it('wp_blueprint_list with scope: all returns blueprints and failures array', async () => {
    const result = await callTool(tools, 'wp_blueprint_list', { scope: 'all' })
    expect(result.isError).toStrictEqual(false)
    const data = parseResult<{
      blueprints: Array<{ slug: string; project_id: string }>
      failures: unknown[]
      duplicate_slugs: unknown[]
    }>(result)
    expect(Array.isArray(data.blueprints)).toBe(true)
    expect(Array.isArray(data.failures)).toBe(true)
    expect(Array.isArray(data.duplicate_slugs)).toBe(true)
    for (const blueprint of data.blueprints) {
      expect(typeof blueprint.project_id).toBe('string')
      expect(blueprint.project_id.length).toBeGreaterThan(0)
    }
  })

  it('wp_blueprint_list with scope: roots returns blueprints and failures array', async () => {
    const result = await callTool(tools, 'wp_blueprint_list', { scope: 'roots' })
    expect(result.isError).toStrictEqual(false)
    const data = parseResult<{
      blueprints: unknown[]
      failures: unknown[]
      duplicate_slugs: unknown[]
    }>(result)
    expect(Array.isArray(data.blueprints)).toBe(true)
    expect(Array.isArray(data.failures)).toBe(true)
    expect(Array.isArray(data.duplicate_slugs)).toBe(true)
  })

  it('wp_blueprint_list with scope: workspace returns blueprints and failures array', async () => {
    const result = await callTool(tools, 'wp_blueprint_list', { scope: 'workspace' })
    expect(result.isError).toStrictEqual(false)
    const data = parseResult<{
      blueprints: unknown[]
      failures: unknown[]
      duplicate_slugs: unknown[]
    }>(result)
    expect(Array.isArray(data.blueprints)).toBe(true)
    expect(Array.isArray(data.failures)).toBe(true)
    expect(Array.isArray(data.duplicate_slugs)).toBe(true)
  })
})

describe('Task 3.3 — wp_blueprint_get with aggregate scope', () => {
  let tmpDir: string
  let tools: ToolMap

  beforeAll(async () => {
    ;({ tmpDir, tools } = await makeProjectionBackedBlueprintHarness('wp-bs-projects-get-', [
      {
        stateDir: 'draft',
        slug: 'single-scope-test-bp',
        content: VALID_BLUEPRINT,
      },
    ]))
  })

  afterAll(() => {
    cleanupTempDir(tmpDir)
  })

  it('wp_blueprint_get with scope: current (single-project) finds blueprint by directory-derived slug', async () => {
    const result = await callTool(tools, 'wp_blueprint_get', {
      slug: 'single-scope-test-bp',
      scope: 'current',
    })
    expect(result.isError).toStrictEqual(false)
    const data = parseResult<{
      blueprint: { slug: string } | null
      failures: unknown[]
    }>(result)
    expect(data.blueprint).not.toBeNull()
    expect(data.blueprint?.slug).toBe('single-scope-test-bp')
  })

  it('wp_blueprint_get with scope: all returns structured response with failures/blueprint fields', async () => {
    const result = await callTool(tools, 'wp_blueprint_get', {
      slug: 'any-slug',
      scope: 'all',
    })
    expect(result.isError).toStrictEqual(false)
    const data = parseResult<Record<string, unknown>>(result)
    expect(Array.isArray(data.failures)).toBe(true)
    expect('blueprint' in data).toBe(true)
    if (data.blueprint === null) {
      expect(typeof (data.next_action as { kind: string })?.kind).toBe('string')
    }
  })

  it('wp_blueprint_get with scope: all returns disambiguate_slug next_action when slug not found anywhere', async () => {
    const result = await callTool(tools, 'wp_blueprint_get', {
      slug: 'nonexistent-everywhere',
      scope: 'all',
    })
    expect(result.isError).toStrictEqual(false)
    const data = parseResult<{
      blueprint: unknown
      next_action: { kind: string }
      failures: unknown[]
    }>(result)
    expect(data.blueprint).toBeNull()
    expect(data.next_action.kind).toBe('disambiguate_slug')
  })
})
