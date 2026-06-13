import { mkdtempSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

import captureTool from '#mcp/tools/session-capture'
import executeTool from '#mcp/tools/session-execute'
import restoreTool from '#mcp/tools/session-restore'
import searchTool from '#mcp/tools/session-search'
import snapshotTool from '#mcp/tools/session-snapshot'
import { computeRepoHash } from './repo-hash.js'
import { resolveDbPath } from './session.js'
import { closeStore } from './store.js'

let repoDir: string
let memoryDir: string

function parsePayload<T>(result: { content: Array<{ text?: string }> }): T {
  return JSON.parse(result.content[0]?.text ?? '{}') as T
}

beforeEach(() => {
  repoDir = mkdtempSync(join(tmpdir(), 'ak-session-memory-repo-'))
  memoryDir = mkdtempSync(join(tmpdir(), 'ak-session-memory-db-'))
  vi.stubEnv('AK_SESSION_MEMORY_DIR', memoryDir)
  vi.stubEnv('CLAUDE_SESSION_ID', 'integration-session')
})

afterEach(() => {
  closeStore(resolveDbPath(computeRepoHash(repoDir), memoryDir))
  rmSync(repoDir, { recursive: true, force: true })
  rmSync(memoryDir, { recursive: true, force: true })
  vi.unstubAllEnvs()
})

describe('session-memory MCP integration', () => {
  it('captures, snapshots, and restores a manual decision through the real SQLite store', async () => {
    const capture = await captureTool.handler({
      cwd: repoDir,
      sessionId: 'integration-session',
      toolName: 'decision',
      content: 'Decision: preserve independent v1 option framing in public docs.',
    })
    expect(parsePayload<{ captured: boolean }>(capture).captured).toBe(true)

    const snapshot = await snapshotTool.handler({ cwd: repoDir, capMs: 5_000 })
    expect(parsePayload<{ eventsIncluded: number; partial: boolean }>(snapshot)).toMatchObject({
      eventsIncluded: 1,
      partial: false,
    })

    const restore = await restoreTool.handler({ cwd: repoDir, query: 'independent v1 option' })
    const payload = parsePayload<{ hitCount: number; sessionKnowledge: string }>(restore)
    expect(payload.hitCount).toBeGreaterThan(0)
    expect(payload.sessionKnowledge).toContain('independent v1 option')
  })

  it('executes a large command, indexes full output, and searches by source label', async () => {
    const command = `python3 -c 'import sys; sys.stdout.write("selection-benchmark-readiness " * 120)'`

    const executed = await executeTool.handler({
      cwd: repoDir,
      command,
      label: 'integration-large-output',
      query: 'selection benchmark readiness',
    })
    const executePayload = parsePayload<{
      indexed: boolean
      outputBytes: number
      hits?: Array<{ source: string; content: string }>
    }>(executed)

    expect(executePayload.indexed).toBe(true)
    expect(executePayload.outputBytes).toBeGreaterThan(2 * 1024)
    expect(executePayload.hits?.[0]?.source).toBe('integration-large-output')

    const search = await searchTool.handler({
      cwd: repoDir,
      query: 'selection benchmark readiness',
      source: 'integration-large-output',
      limit: 3,
    })
    const searchPayload = parsePayload<{ hitCount: number; hits: Array<{ source: string }> }>(
      search,
    )
    expect(searchPayload.hitCount).toBeGreaterThan(0)
    expect(searchPayload.hits.every((hit) => hit.source === 'integration-large-output')).toBe(true)
  })
})
