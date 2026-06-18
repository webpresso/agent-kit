import { existsSync, mkdtempSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'

import { afterEach, beforeEach, describe, expect, it } from 'vitest'

import sessionExecuteTool from './_session-execute.js'
import { measureToolResultBytes } from './_session-gain.js'
import sessionSearchTool from './session-search.js'
import { SessionMemoryStore } from '../../session-memory/store.js'

let tmpDir: string
let previousIndexDb: string | undefined
let previousClaudeProjectDir: string | undefined

function payload(result: Awaited<ReturnType<typeof sessionExecuteTool.handler>>) {
  return result.structuredContent as {
    passed: boolean
    exitCode: number
    gain?: { rawBasisBytes: number; returnedToolResultBytes: number; gainBytes: number; approxTokensSaved: number; precision: string; rawBytesBasis: string }
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
  previousClaudeProjectDir = process.env.CLAUDE_PROJECT_DIR
  process.env.WP_SESSION_MEMORY_INDEX_DB = join(tmpDir, 'index.sqlite')
  process.env.CLAUDE_PROJECT_DIR = tmpDir
})

afterEach(() => {
  if (previousIndexDb === undefined) delete process.env.WP_SESSION_MEMORY_INDEX_DB
  else process.env.WP_SESSION_MEMORY_INDEX_DB = previousIndexDb
  if (previousClaudeProjectDir === undefined) delete process.env.CLAUDE_PROJECT_DIR
  else process.env.CLAUDE_PROJECT_DIR = previousClaudeProjectDir
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


  it('records exact command-output gain using total stdout/stderr bytes', async () => {
    const result = await sessionExecuteTool.handler?.({
      command: `${JSON.stringify(process.execPath)} -e "process.stdout.write('x'.repeat(12000))"`,
      label: 'gain-large',
      execute: true,
      timeoutMs: 5_000,
      cwd: tmpDir,
    })
    const data = payload(result)

    expect(data.gain).toMatchObject({
      rawBasisBytes: 12000,
      precision: 'exact_utf8_bytes_approx_tokens',
      rawBytesBasis: 'command_output_total',
    })
    expect(data.gain?.gainBytes).toBeGreaterThan(0)
    expect(data.gain?.approxTokensSaved).toBe(Math.floor((data.gain?.gainBytes ?? 0) / 4))
  })

  it('includes stderr bytes, query hits, and telemetry overhead in persisted gain totals', async () => {
    const result = await sessionExecuteTool.handler?.({
      command: `${JSON.stringify(process.execPath)} -e "process.stdout.write('out-needle'); process.stderr.write('err-needle')"`,
      label: 'gain-with-hits',
      query: 'needle',
      execute: true,
      timeoutMs: 5_000,
      cwd: tmpDir,
    })
    const data = payload(result)

    expect(data.details).toMatchObject({
      outputBytes: 20,
      hits: [
        {
          content: expect.stringMatching(/^(out-needleerr-needle|err-needleout-needle)$/u),
          source: 'gain-with-hits',
          rank: 1,
        },
      ],
    })
    expect(data.gain).toStrictEqual({
      rawBasisBytes: 20,
      returnedToolResultBytes: measureToolResultBytes(result),
      gainBytes: 0,
      approxTokensSaved: 0,
      precision: 'exact_utf8_bytes_approx_tokens',
      rawBytesBasis: 'command_output_total',
    })

    const store = new SessionMemoryStore(process.env.WP_SESSION_MEMORY_INDEX_DB!)
    expect(store.gainStats()).toMatchObject({
      eventCount: 1,
      rawBasisBytes: 20,
      returnedToolResultBytes: measureToolResultBytes(result),
      gainBytes: 0,
      approxTokensSaved: 0,
      byTool: [
        {
          toolName: 'wp_session_execute',
          eventCount: 1,
          rawBasisBytes: 20,
          returnedToolResultBytes: measureToolResultBytes(result),
        },
      ],
    })
    store.close()
  })

  it('records a zero-gain event for tiny command output', async () => {
    const result = await sessionExecuteTool.handler?.({
      command: 'printf x',
      label: 'gain-tiny',
      execute: true,
      timeoutMs: 5_000,
      cwd: tmpDir,
    })
    const data = payload(result)

    expect(data.gain).toMatchObject({ rawBasisBytes: 1, gainBytes: 0 })
  })

  it('returns an error envelope when execution fails while preserving indexed output', async () => {
    const result = await sessionExecuteTool.handler?.({
      command: `${JSON.stringify(process.execPath)} -e "process.stdout.write('failure sentinel'); process.exit(42)"`,
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

  it('rejects shell metacharacters and returns an error before spawning', async () => {
    const markerPath = join(tmpDir, 'pwned-by-injection')
    const result = await sessionExecuteTool.handler?.({
      command: `printf "%s\n" "safe"; touch ${JSON.stringify(markerPath)}`,
      execute: true,
      cwd: tmpDir,
    })

    expect(result.isError).toBe(true)
    expect(payload(result)).toMatchObject({ passed: false, exitCode: -1 })
    expect(existsSync(markerPath)).toBe(false)
  })

  it('rejects cwd outside the trusted project root', async () => {
    const outsideRoot = mkdtempSync(join(tmpdir(), 'wp-session-execute-outside-'))
    try {
      const result = await sessionExecuteTool.handler?.({
        command: 'echo should-not-run',
        execute: true,
        cwd: outsideRoot,
      })

      expect(result.isError).toBe(true)
      expect(payload(result)).toMatchObject({ passed: false, exitCode: -1 })
    } finally {
      rmSync(outsideRoot, { recursive: true, force: true })
    }
  })

  it('requires explicit execute=true before running a shell command', async () => {
    const result = await sessionExecuteTool.handler?.({ command: 'echo nope' })
    expect(payload(result)).toMatchObject({ passed: false, exitCode: -1 })
  })
})
