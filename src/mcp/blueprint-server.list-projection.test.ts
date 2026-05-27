import { existsSync } from 'node:fs'

import { afterEach, beforeEach, describe, expect, it } from 'vitest'

import { resolveBlueprintProjectionDbPath } from '#db/paths.js'

import {
  callTool,
  cleanupTempDir,
  makeLazyBlueprintHarness,
  makeProjectionBackedBlueprintHarness,
  parseResult,
  type ToolMap,
  VALID_BLUEPRINT,
  writeStaleProjectionMetadata,
} from './blueprint-server.test-harness.js'

let tmpDir: string
let tools: ToolMap
const tempDirs: string[] = []

beforeEach(async () => {
  ;({ tmpDir, tools } = await makeLazyBlueprintHarness('ak-bs-list-base-'))
})

afterEach(() => {
  cleanupTempDir(tmpDir)
  while (tempDirs.length > 0) cleanupTempDir(tempDirs.pop())
})

async function makeSingleBlueprintHarness(prefix: string, slug: string) {
  const harness = await makeProjectionBackedBlueprintHarness(prefix, [
    { stateDir: 'draft', slug, content: VALID_BLUEPRINT },
  ])
  tempDirs.push(harness.tmpDir)
  return harness
}

describe('wp_blueprint_list — read/projection contract', () => {
  it('returns empty list when DB has no blueprints', async () => {
    const result = await callTool(tools, 'wp_blueprint_list', {})
    const data = parseResult<{
      summary: string
      blueprints: unknown[]
      freshness_ok: boolean
      failures: string[]
    }>(result)
    expect(result.isError).toStrictEqual(false)
    expect(Array.isArray(data.blueprints)).toBe(true)
    expect(data.failures).toStrictEqual([])
  })

  it('lazily creates the DB when it is missing', async () => {
    const { tmpDir: localTmpDir, tools: localTools } = await makeLazyBlueprintHarness('ak-bs-list-')
    tempDirs.push(localTmpDir)
    const dbFile = resolveBlueprintProjectionDbPath(localTmpDir)

    expect(existsSync(dbFile)).toBe(false)

    const result = await callTool(localTools, 'wp_blueprint_list', {})
    const data = parseResult<{
      blueprints: unknown[]
      freshness_ok: boolean
      next_action?: { kind: string }
    }>(result)
    expect(result.isError).toStrictEqual(false)
    expect(data.blueprints).toStrictEqual([])
    expect(data.freshness_ok).toBe(true)
    expect(data.next_action).toBeUndefined()
    expect(existsSync(dbFile)).toBe(true)
  })

  it('filters by status when provided', async () => {
    const { tools: localTools } = await makeSingleBlueprintHarness('ak-bs-list-filter-', 'list-test')

    const result = await callTool(localTools, 'wp_blueprint_list', { status: 'draft' })
    const data = parseResult<{
      blueprints: Array<{ slug: string; status: string }>
      failures: string[]
    }>(result)
    expect(result.isError).toStrictEqual(false)
    expect(data.failures).toStrictEqual([])
    expect(data.blueprints.some((blueprint) => blueprint.slug === 'list-test')).toBe(true)
    for (const blueprint of data.blueprints) {
      expect(blueprint.status).toBe('draft')
    }
  })

  it('returns next_action reingest_project when HEAD changed after ingest on single-project path', async () => {
    const { tmpDir: localTmpDir, tools: localTools } = await makeSingleBlueprintHarness(
      'ak-bs-stale-list-',
      'stale-bp',
    )
    writeStaleProjectionMetadata(localTmpDir)

    const result = await callTool(localTools, 'wp_blueprint_list', {})
    const data = parseResult<{
      freshness_ok: boolean
      next_action: { kind: string }
      blueprints: unknown[]
    }>(result)

    expect(result.isError).toStrictEqual(false)
    expect(data.freshness_ok).toBe(false)
    expect(data.next_action.kind).toBe('reingest_project')
    expect(data.blueprints).toEqual([])
  })

  it('rejects input with unknown field gracefully (extra fields pass through zod)', async () => {
    const result = await callTool(tools, 'wp_blueprint_list', { limit: 10 })
    expect(result.isError).toStrictEqual(false)
  })
})
