import { afterEach, beforeEach, describe, expect, it } from 'vitest'

import {
  callTool,
  cleanupTempDir,
  makeLazyBlueprintHarness,
  makeProjectionBackedBlueprintHarness,
  parseResult,
  type ToolMap,
  VALID_BLUEPRINT,
} from './blueprint-server.test-harness.js'

let tmpDir: string
let tools: ToolMap
const tempDirs: string[] = []

beforeEach(async () => {
  ;({ tmpDir, tools } = await makeLazyBlueprintHarness('ak-bs-context-base-'))
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

describe('wp_blueprint_context — read/projection contract', () => {
  it('returns chunks array for existing blueprint', async () => {
    const bpSlug = 'context-test-blueprint'
    const { tools: localTools } = await makeSingleBlueprintHarness('ak-bs-context-', bpSlug)

    const result = await callTool(localTools, 'wp_blueprint_context', { slug: bpSlug })
    const data = parseResult<{
      chunks: Array<{ kind: string; label: string; content: string; byte_size: number }>
      total_bytes: number
      content_hash: string
      ingested_at: number
      head_at_ingest: string | null
      failures: string[]
    }>(result)
    expect(result.isError).toStrictEqual(false)
    expect(Array.isArray(data.chunks)).toBe(true)
    expect(data.chunks.length).toBeGreaterThan(0)
    expect(typeof data.total_bytes).toBe('number')
    expect(typeof data.content_hash).toBe('string')
    expect(typeof data.ingested_at).toBe('number')
    expect(data.head_at_ingest === null || typeof data.head_at_ingest === 'string').toBe(true)
    expect(data.failures).toStrictEqual([])
    expect(data.chunks[0]?.kind).toBe('summary')
  })

  it('returns disambiguate_slug next_action for unknown slug', async () => {
    const result = await callTool(tools, 'wp_blueprint_context', { slug: 'unknown-slug-abc' })
    const data = parseResult<{
      chunks: unknown[]
      next_action: { kind: string }
    }>(result)
    expect(result.isError).toStrictEqual(false)
    expect(data.chunks).toStrictEqual([])
    expect(data.next_action.kind).toBe('disambiguate_slug')
  })

  it('returns verify_task next_action when task_id not found', async () => {
    const bpSlug = 'context-task-test'
    const { tools: localTools } = await makeSingleBlueprintHarness('ak-bs-context-task-', bpSlug)

    const result = await callTool(localTools, 'wp_blueprint_context', {
      slug: bpSlug,
      task_id: 'nonexistent-task-99.99',
    })
    const data = parseResult<{
      chunks: unknown[]
      next_action: { kind: string }
    }>(result)
    expect(result.isError).toStrictEqual(false)
    expect(data.next_action.kind).toBe('verify_task')
  })

  it('returns validation error when slug is missing', async () => {
    const result = await callTool(tools, 'wp_blueprint_context', {})
    expect(result.isError).toStrictEqual(true)
  })
})
