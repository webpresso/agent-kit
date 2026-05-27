import { afterEach, beforeEach, describe, expect, it } from 'vitest'

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
  ;({ tmpDir, tools } = await makeLazyBlueprintHarness('ak-bs-get-base-'))
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

describe('wp_blueprint_get — read/projection contract', () => {
  it('returns next_action disambiguate_slug for unknown slug', async () => {
    const result = await callTool(tools, 'wp_blueprint_get', { slug: 'nonexistent-slug-xyz' })
    const data = parseResult<{
      blueprint: null
      next_action: { kind: string }
      failures: string[]
    }>(result)
    expect(result.isError).toStrictEqual(false)
    expect(data.blueprint).toBeNull()
    expect(data.next_action.kind).toBe('disambiguate_slug')
    expect(data.failures.length).toBeGreaterThan(0)
  })

  it('returns blueprint with tasks and freshness metadata when found', async () => {
    const bpSlug = 'get-test-blueprint'
    const { tools: localTools } = await makeSingleBlueprintHarness('ak-bs-get-', bpSlug)

    const result = await callTool(localTools, 'wp_blueprint_get', { slug: bpSlug })
    const data = parseResult<{
      blueprint: { slug: string; title: string; status: string; tasks: unknown[] }
      content_hash: string
      ingested_at: number
      head_at_ingest: string | null
      failures: string[]
    }>(result)
    expect(result.isError).toStrictEqual(false)
    expect(data.blueprint).not.toBeNull()
    expect(data.blueprint.slug).toBe(bpSlug)
    expect(typeof data.content_hash).toBe('string')
    expect(typeof data.ingested_at).toBe('number')
    expect(data.head_at_ingest === null || typeof data.head_at_ingest === 'string').toBe(true)
    expect(Array.isArray(data.blueprint.tasks)).toBe(true)
    expect(data.failures).toStrictEqual([])
  })

  it('returns validation error when slug is missing', async () => {
    const result = await callTool(tools, 'wp_blueprint_get', {})
    expect(result.isError).toStrictEqual(true)
  })

  it('returns next_action reingest_project when HEAD changed after ingest on single-project path', async () => {
    const { tmpDir: localTmpDir, tools: localTools } = await makeSingleBlueprintHarness(
      'ak-bs-stale-get-',
      'stale-get',
    )
    writeStaleProjectionMetadata(localTmpDir)

    const result = await callTool(localTools, 'wp_blueprint_get', { slug: 'stale-get' })
    const data = parseResult<{
      blueprint: unknown
      next_action: { kind: string }
    }>(result)

    expect(result.isError).toStrictEqual(false)
    expect(data.blueprint).toBeNull()
    expect(data.next_action.kind).toBe('reingest_project')
  })
})
