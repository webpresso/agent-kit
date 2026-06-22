import { mkdtempSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'

import { cac } from 'cac'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

const pretoolMain = vi.hoisted(() => vi.fn())
const postToolMain = vi.hoisted(() => vi.fn())
const stopMain = vi.hoisted(() => vi.fn())
const precompactMain = vi.hoisted(() => vi.fn())
const testQualityCheck = vi.hoisted(() => vi.fn())

vi.mock('#hooks/pretool-guard/index', () => ({ main: pretoolMain }))
vi.mock('#hooks/post-tool/lint-after-edit', () => ({ main: postToolMain }))
vi.mock('#hooks/stop/qa-changed-files', () => ({ main: stopMain }))
vi.mock('#hooks/precompact/index', () => ({ main: precompactMain }))
vi.mock('#hooks/test-quality-check', () => ({ runTestQualityCheck: testQualityCheck }))

import { readHookErrors } from '#hooks/errors/index.js'

import { registerHookCommand, runHookCommand } from './hook.js'

async function runHookCli(argv: string[]): Promise<unknown> {
  const cli = cac('wp')
  registerHookCommand(cli)
  cli.parse(['node', 'wp', ...argv], { run: false })
  return await cli.runMatchedCommand()
}

function captureProcessOutput(): {
  readonly output: () => { stdout: string; stderr: string }
  readonly restore: () => void
} {
  let stdout = ''
  let stderr = ''
  const stdoutSpy = vi
    .spyOn(process.stdout, 'write')
    .mockImplementation((chunk: string | Uint8Array) => {
      stdout += String(chunk)
      return true
    })
  const stderrSpy = vi
    .spyOn(process.stderr, 'write')
    .mockImplementation((chunk: string | Uint8Array) => {
      stderr += String(chunk)
      return true
    })

  return {
    output: () => ({ stdout, stderr }),
    restore: () => {
      stdoutSpy.mockRestore()
      stderrSpy.mockRestore()
    },
  }
}

describe('hook command', () => {
  let tmp: string
  let previousErrorsPath: string | undefined

  beforeEach(() => {
    vi.clearAllMocks()
    tmp = mkdtempSync(join(tmpdir(), 'wp-hook-command-'))
    previousErrorsPath = process.env.WP_HOOK_ERRORS_PATH
    process.env.WP_HOOK_ERRORS_PATH = join(tmp, 'hook-errors.json')
  })

  afterEach(() => {
    if (previousErrorsPath === undefined) delete process.env.WP_HOOK_ERRORS_PATH
    else process.env.WP_HOOK_ERRORS_PATH = previousErrorsPath
    rmSync(tmp, { recursive: true, force: true })
  })

  it('runs existing hook handlers by name', async () => {
    await runHookCommand('pretool-guard')

    expect(pretoolMain).toHaveBeenCalledOnce()
  })

  it('forwards extra args for the direct test-quality hook bin', async () => {
    await runHookCli(['hook', 'test-quality-check', 'src/example.test.ts'])

    expect(testQualityCheck).toHaveBeenCalledWith(['src/example.test.ts'])
  })

  it('rejects removed legacy hook names', async () => {
    await expect(runHookCli(['hook', 'check-dev-link'])).rejects.toThrow(
      'Unknown hook "check-dev-link"',
    )
  })

  it('fails closed with a single PreToolUse deny envelope when pretool-guard throws', async () => {
    pretoolMain.mockRejectedValueOnce(new Error('guard exploded'))
    const capture = captureProcessOutput()

    try {
      await expect(runHookCommand('pretool-guard')).resolves.toBeUndefined()
    } finally {
      capture.restore()
    }

    const { stdout, stderr } = capture.output()
    expect(stderr).toBe('')
    const lines = stdout.split('\n')
    expect(lines).toHaveLength(2)
    expect(lines[1]).toBe('')
    expect(JSON.parse(lines[0])).toMatchObject({
      hookSpecificOutput: {
        hookEventName: 'PreToolUse',
        permissionDecision: 'deny',
      },
    })
    expect(readHookErrors()).toEqual([
      expect.objectContaining({
        binName: 'wp-pretool-guard',
        hookName: 'pretool-guard',
        event: 'PreToolUse',
        fallback: 'fail-closed-deny',
        phase: 'handler',
        detail: 'guard exploded',
      }),
    ])
  })

  it.each([
    ['stop-qa', stopMain, 'wp-stop-qa', 'Stop'],
    ['precompact-snapshot', precompactMain, 'wp-precompact-snapshot', 'PreCompact'],
  ] as const)(
    'emits exactly empty JSON when %s throws',
    async (hookName, handler, binName, event) => {
      handler.mockRejectedValueOnce(new Error(`${hookName} exploded`))
      const capture = captureProcessOutput()

      try {
        await expect(runHookCommand(hookName)).resolves.toBeUndefined()
      } finally {
        capture.restore()
      }

      expect(capture.output()).toEqual({ stdout: '{}\n', stderr: '' })
      expect(readHookErrors()).toEqual([
        expect.objectContaining({
          binName,
          hookName,
          event,
          fallback: 'emit-empty-json',
          phase: 'handler',
          detail: `${hookName} exploded`,
        }),
      ])
    },
  )

  it('fails open without stdout and reports fallback when post-tool throws', async () => {
    postToolMain.mockRejectedValueOnce(new Error('post tool exploded'))
    const capture = captureProcessOutput()

    try {
      await expect(runHookCommand('post-tool')).resolves.toBeUndefined()
    } finally {
      capture.restore()
    }

    const { stdout, stderr } = capture.output()
    expect(stdout).toBe('')
    expect(stderr).toContain('fallback=fail-open')
    expect(stderr).toContain('post tool exploded')
    expect(readHookErrors()).toEqual([
      expect.objectContaining({
        binName: 'wp-post-tool',
        hookName: 'post-tool',
        event: 'PostToolUse',
        fallback: 'fail-open',
        phase: 'handler',
        detail: 'post tool exploded',
      }),
    ])
  })
})
