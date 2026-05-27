import { afterEach, describe, expect, it, vi } from 'vitest'

import akFormatTool from './format.js'

const spawnMock = vi.hoisted(() => vi.fn())

vi.mock('node:child_process', () => ({
  spawn: spawnMock,
}))

function fakeChild(
  opts: {
    stdout?: string
    stderr?: string
    exitCode?: number
    error?: NodeJS.ErrnoException
  } = {},
): unknown {
  return {
    stdout: {
      on: (event: string, fn: (data: Buffer) => void) => {
        if (event === 'data' && opts.stdout) fn(Buffer.from(opts.stdout))
      },
    },
    stderr: {
      on: (event: string, fn: (data: Buffer) => void) => {
        if (event === 'data' && opts.stderr) fn(Buffer.from(opts.stderr))
      },
    },
    on: (event: string, fn: (arg: unknown) => void) => {
      if (event === 'error' && opts.error) {
        queueMicrotask(() => fn(opts.error))
        return
      }
      if (event === 'close' && !opts.error) {
        queueMicrotask(() => fn(opts.exitCode ?? 0))
      }
    },
  }
}

afterEach(() => {
  spawnMock.mockReset()
})

describe('wp_format tool', () => {
  it('exposes the expected descriptor surface', () => {
    expect(akFormatTool.name).toBe('wp_format')
    expect(typeof akFormatTool.description).toBe('string')
    expect(akFormatTool.handler).toBeTypeOf('function')
  })

  it('returns passed=true when oxfmt exits 0 (no check)', async () => {
    spawnMock.mockReturnValue(fakeChild({ stdout: 'Finished\n', exitCode: 0 }))

    const result = await akFormatTool.handler({})
    const payload = result.structuredContent as Record<string, unknown>

    expect(spawnMock).toHaveBeenCalledOnce()
    const [cmd, args] = spawnMock.mock.calls[0]!
    expect(cmd).toBe('oxfmt')
    expect(args).toEqual(['--write', '--ignore-path', '.gitignore'])
    expect(payload).toMatchObject({
      passed: true,
      summary: 'format applied',
    })
    expect((result.content[0] as { text: string }).text).toBe('format applied')
  })

  it('passes --check and returns passed=false on dirty', async () => {
    spawnMock.mockReturnValue(fakeChild({ stderr: 'a.ts not formatted\n', exitCode: 1 }))

    const result = await akFormatTool.handler({ check: true })
    const payload = result.structuredContent as Record<string, unknown>

    const [, args] = spawnMock.mock.calls[0]!
    expect(args).toEqual(['--check', '--ignore-path', '.gitignore'])
    expect(payload.passed).toBe(false)
    expect(payload.summary).toMatch(/format check failed/)
  })

  it('surfaces missing-binary with isError=true and a helpful summary', async () => {
    const enoent = new Error('spawn oxfmt ENOENT') as NodeJS.ErrnoException
    enoent.code = 'ENOENT'
    spawnMock.mockReturnValue(fakeChild({ error: enoent }))

    const result = await akFormatTool.handler({})
    const payload = result.structuredContent as {
      passed: boolean
      summary: string
      details?: { spawnError?: string }
    }

    expect(result.isError).toBe(true)
    expect(payload.passed).toBe(false)
    expect(payload.summary).toMatch(/oxfmt binary missing/)
    expect(payload.details?.spawnError).toMatch(/oxfmt binary not found/)
  })

  it('clips long output and marks it truncated', async () => {
    spawnMock.mockReturnValue(fakeChild({ stderr: `WARN ${'y'.repeat(5_000)}`, exitCode: 1 }))

    const result = await akFormatTool.handler({ check: true })
    const payload = result.structuredContent as {
      rawOutput?: string
      truncated?: boolean
    }
    expect(payload.rawOutput).toHaveLength(4_000)
    expect(payload.truncated).toBe(true)
  })
})
