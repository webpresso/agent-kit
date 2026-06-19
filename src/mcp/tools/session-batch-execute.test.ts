import { existsSync, mkdtempSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'

import { afterEach, beforeEach, describe, expect, it } from 'vitest'

import sessionBatchExecuteTool, { totalOutputBytes } from './_session-batch-execute.js'
import sessionSearchTool from './session-search.js'

let tmpDir: string
let previousIndexDb: string | undefined
let previousClaudeProjectDir: string | undefined
let previousNativePath: string | undefined
let previousBuildFromSource: string | undefined

function payload(result: Awaited<ReturnType<typeof sessionBatchExecuteTool.handler>>) {
  return result.structuredContent as {
    passed: boolean
    gain?: { rawBasisBytes: number; rawBytesBasis: string; gainBytes: number }
    details: {
      results: Array<{
        label: string
        exitCode: number
        indexed: boolean
        summary: string
        backend: 'native' | 'typescript'
        fallbackReason?: string
        truncated?: boolean
        capturedBytes?: number
        maxCaptureBytes?: number
        timedOut?: boolean
        signal?: string
      }>
      queryHits?: Record<string, Array<{ content: string; source: string; rank: number }>>
    }
  }
}

beforeEach(() => {
  tmpDir = mkdtempSync(join(tmpdir(), 'wp-session-batch-test-'))
  previousIndexDb = process.env.WP_SESSION_MEMORY_INDEX_DB
  previousClaudeProjectDir = process.env.CLAUDE_PROJECT_DIR
  previousNativePath = process.env.WP_NATIVE_SESSION_MEMORY_PATH
  previousBuildFromSource = process.env.WP_NATIVE_SESSION_MEMORY_BUILD_FROM_SOURCE
  process.env.WP_SESSION_MEMORY_INDEX_DB = join(tmpDir, 'index.sqlite')
  process.env.CLAUDE_PROJECT_DIR = tmpDir
  process.env.WP_NATIVE_SESSION_MEMORY_PATH = join(tmpDir, 'missing-native.node')
  delete process.env.WP_NATIVE_SESSION_MEMORY_BUILD_FROM_SOURCE
})

afterEach(() => {
  if (previousIndexDb === undefined) delete process.env.WP_SESSION_MEMORY_INDEX_DB
  else process.env.WP_SESSION_MEMORY_INDEX_DB = previousIndexDb
  if (previousClaudeProjectDir === undefined) delete process.env.CLAUDE_PROJECT_DIR
  else process.env.CLAUDE_PROJECT_DIR = previousClaudeProjectDir
  if (previousNativePath === undefined) delete process.env.WP_NATIVE_SESSION_MEMORY_PATH
  else process.env.WP_NATIVE_SESSION_MEMORY_PATH = previousNativePath
  if (previousBuildFromSource === undefined) delete process.env.WP_NATIVE_SESSION_MEMORY_BUILD_FROM_SOURCE
  else process.env.WP_NATIVE_SESSION_MEMORY_BUILD_FROM_SOURCE = previousBuildFromSource
  rmSync(tmpDir, { recursive: true, force: true })
})

describe('wp_session_batch_execute', () => {
  it('sums only finite integer child output bytes for the batch gain basis', () => {
    expect(
      totalOutputBytes([
        { outputBytes: 3.9 },
        { outputBytes: Number.NaN },
        {},
        { outputBytes: Number.POSITIVE_INFINITY },
        { outputBytes: 4 },
      ]),
    ).toBe(7)
  })

  it('runs multiple commands and aggregates query hits from the shared TypeScript store', async () => {
    const result = await sessionBatchExecuteTool.handler?.({
      commands: [
        { label: 'cmd-a', command: 'printf "%s\\n" "shared batch sentinel alpha"' },
        { label: 'cmd-b', command: 'printf "%s\\n" "shared batch sentinel beta"' },
      ],
      queries: ['shared batch sentinel'],
      concurrency: 2,
      execute: true,
      timeoutMs: 5_000,
      cwd: tmpDir,
    })
    const data = payload(result)

    expect(data).toMatchObject({
      passed: true,
      details: {
        results: [
          { label: 'cmd-a', exitCode: 0, indexed: true },
          { label: 'cmd-b', exitCode: 0, indexed: true },
        ],
      },
    })
    expect(data.details.results).toEqual([
      expect.objectContaining({
        label: 'cmd-a',
        backend: 'typescript',
        fallbackReason: expect.stringContaining('no prebuilt addon found'),
      }),
      expect.objectContaining({
        label: 'cmd-b',
        backend: 'typescript',
        fallbackReason: expect.stringContaining('no prebuilt addon found'),
      }),
    ])
    expect(
      data.details.queryHits?.['shared batch sentinel']?.map((hit) => hit.source).sort(),
    ).toEqual(['cmd-a', 'cmd-b'])

    const search = await sessionSearchTool.handler?.({
      cwd: tmpDir,
      query: 'shared batch sentinel beta',
      sourceTypes: ['indexed_chunk'],
      limit: 1,
    })
    expect(JSON.stringify(search.structuredContent)).toContain('shared batch sentinel beta')
  })


  it('records one batch-level gain event without child command gain rows', async () => {
    const result = await sessionBatchExecuteTool.handler?.({
      commands: [
        { label: 'a', command: 'printf abc' },
        { label: 'b', command: 'printf defg' },
      ],
      execute: true,
      timeoutMs: 5_000,
      cwd: tmpDir,
    })
    const data = payload(result)

    expect(data.gain).toMatchObject({ rawBasisBytes: 7, rawBytesBasis: 'batch_command_output_total' })

    const { SessionMemoryStore } = await import('../../session-memory/store.js')
    const store = new SessionMemoryStore(process.env.WP_SESSION_MEMORY_INDEX_DB!)
    expect(store.gainStats()).toMatchObject({
      eventCount: 1,
      byTool: [{ toolName: 'wp_session_batch_execute', eventCount: 1 }],
    })
    store.close()
  })

  it('surfaces failures when any command fails', async () => {
    const result = await sessionBatchExecuteTool.handler?.({
      commands: [
        {
          label: 'cmd',
          command: `${JSON.stringify(process.execPath)} -e "process.stdout.write('oops'); process.exit(42)"`,
        },
      ],
      concurrency: 1,
      execute: true,
      cwd: tmpDir,
    })
    expect(result.isError).toBe(true)
    expect(payload(result)).toMatchObject({
      passed: false,
      gain: { rawBasisBytes: 4, rawBytesBasis: 'batch_command_output_total' },
      details: { results: [{ label: 'cmd', exitCode: 42 }] },
    })
  })

  it('rejects batch containing metacharacter commands', async () => {
    const markerPath = join(tmpDir, 'pwned-by-batch-injection')
    const result = await sessionBatchExecuteTool.handler?.({
      commands: [
        {
          label: 'malicious',
          command: `printf "%s\n" "safe"; touch ${JSON.stringify(markerPath)}`,
        },
      ],
      concurrency: 1,
      execute: true,
      cwd: tmpDir,
    })

    expect(result.isError).toBe(true)
    expect(payload(result)).toMatchObject({ passed: false, details: { results: [] } })
    expect(existsSync(markerPath)).toBe(false)
  })

  it('rejects batch with cwd outside the trusted project root', async () => {
    const outsideRoot = mkdtempSync(join(tmpdir(), 'wp-session-batch-outside-'))
    try {
      const result = await sessionBatchExecuteTool.handler?.({
        commands: [{ label: 'cmd', command: 'echo should-not-run' }],
        concurrency: 1,
        execute: true,
        cwd: outsideRoot,
      })

      expect(result.isError).toBe(true)
      expect(payload(result)).toMatchObject({ passed: false, details: { results: [] } })
    } finally {
      rmSync(outsideRoot, { recursive: true, force: true })
    }
  })

  it('rejects duplicate labels in one batch', async () => {
    await expect(
      sessionBatchExecuteTool.handler?.({
        commands: [
          { label: 'dup', command: 'echo one' },
          { label: 'dup', command: 'echo two' },
        ],
        execute: true,
      }),
    ).rejects.toBeTruthy()
  })

  it('requires explicit execute=true before running shell commands', async () => {
    const result = await sessionBatchExecuteTool.handler?.({
      commands: [{ label: 'cmd', command: 'echo nope' }],
    })
    expect(payload(result)).toMatchObject({ passed: false })
  })
})
