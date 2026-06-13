import { mkdtempSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'

import { afterEach, beforeEach, describe, expect, it } from 'vitest'

import sessionExecuteTool from './_session-execute.js'
import sessionSearchTool from './session-search.js'

let tmpDir: string
let previousIndexDb: string | undefined

function payload(result: Awaited<ReturnType<typeof sessionExecuteTool.handler>>) {
  return result.structuredContent as {
    passed: boolean
    exitCode: number
    details: {
      label: string
      exitCode: number
      outputBytes: number
      indexed: boolean
      summary: string
      hits?: Array<{ content: string; source: string; rank: number; tier: string }>
    }
  }
}

beforeEach(() => {
  tmpDir = mkdtempSync(join(tmpdir(), 'wp-session-execute-test-'))
  previousIndexDb = process.env.WP_SESSION_MEMORY_INDEX_DB
  process.env.WP_SESSION_MEMORY_INDEX_DB = join(tmpDir, 'index.sqlite')
})

afterEach(() => {
  if (previousIndexDb === undefined) delete process.env.WP_SESSION_MEMORY_INDEX_DB
  else process.env.WP_SESSION_MEMORY_INDEX_DB = previousIndexDb
  rmSync(tmpDir, { recursive: true, force: true })
})

describe('wp_session_execute', () => {
  it('executes, indexes output into the shared TypeScript store, and returns query hits', async () => {
    const result = await sessionExecuteTool.handler?.({
      command: 'printf "%s\\n" "indexed needle from command"',
      label: 'label',
      query: 'indexed needle',
      execute: true,
      timeoutMs: 5_000,
      cwd: tmpDir,
    })
    const data = payload(result)

    expect(data).toMatchObject({
      passed: true,
      exitCode: 0,
      details: {
        label: 'label',
        exitCode: 0,
        indexed: true,
        hits: [{ content: expect.stringContaining('indexed needle from command') }],
      },
    })

    const search = await sessionSearchTool.handler?.({
      cwd: tmpDir,
      query: 'indexed needle',
      sourceTypes: ['indexed_chunk'],
      limit: 1,
    })
    expect(JSON.stringify(search.structuredContent)).toContain('indexed needle from command')
  })

  it('returns an error envelope when execution fails while preserving indexed output', async () => {
    const result = await sessionExecuteTool.handler?.({
      command: 'printf "%s\\n" "failure sentinel"; exit 42',
      label: 'failure-label',
      query: 'failure sentinel',
      execute: true,
      cwd: tmpDir,
    })
    const data = payload(result)

    expect(result.isError).toBe(true)
    expect(data).toMatchObject({ passed: false, exitCode: 42 })
    expect(data.details.hits?.[0]?.content).toContain('failure sentinel')
  })

  it('requires explicit execute=true before running a shell command', async () => {
    const result = await sessionExecuteTool.handler?.({ command: 'echo nope' })
    expect(payload(result)).toMatchObject({ passed: false, exitCode: -1 })
  })
})
