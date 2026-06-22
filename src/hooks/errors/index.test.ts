import { mkdirSync, mkdtempSync, readdirSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

import { formatHookErrors, hooksErrorsCommand, readHookErrors, recordHookError } from './index.js'

describe('hook error store', () => {
  let tmp: string
  let previousErrorsPath: string | undefined

  beforeEach(() => {
    tmp = mkdtempSync(join(tmpdir(), 'wp-hook-errors-'))
    previousErrorsPath = process.env.WP_HOOK_ERRORS_PATH
    process.env.WP_HOOK_ERRORS_PATH = join(tmp, 'hook-errors.json')
  })

  afterEach(() => {
    if (previousErrorsPath === undefined) delete process.env.WP_HOOK_ERRORS_PATH
    else process.env.WP_HOOK_ERRORS_PATH = previousErrorsPath
    rmSync(tmp, { recursive: true, force: true })
  })

  it('reads persisted managed hook errors from the override path', () => {
    writeFileSync(
      process.env.WP_HOOK_ERRORS_PATH!,
      JSON.stringify({
        version: 1,
        entries: [
          {
            timestamp: '2026-06-21T12:00:00.000Z',
            binName: 'wp-stop-qa',
            hookName: 'stop-qa',
            event: 'Stop',
            phase: 'child',
            fallback: 'emit-empty-json',
            status: 1,
          },
        ],
      }),
      'utf8',
    )

    expect(readHookErrors()).toEqual([
      {
        timestamp: '2026-06-21T12:00:00.000Z',
        binName: 'wp-stop-qa',
        hookName: 'stop-qa',
        event: 'Stop',
        phase: 'child',
        fallback: 'emit-empty-json',
        status: 1,
      },
    ])
  })

  it('formats an empty store with a concise no-errors message', () => {
    expect(formatHookErrors([])).toBe(
      'wp hooks errors: no managed hook errors recorded for this repo\n',
    )
  })

  it('prints bounded human-readable and JSON output', async () => {
    writeFileSync(
      process.env.WP_HOOK_ERRORS_PATH!,
      JSON.stringify({
        version: 1,
        entries: [
          {
            timestamp: '2026-06-21T12:00:00.000Z',
            binName: 'wp-pretool-guard',
            hookName: 'pretool-guard',
            event: 'PreToolUse',
            phase: 'child',
            fallback: 'fail-closed-deny',
            status: 1,
            detail: 'bounded diagnostic',
          },
          {
            timestamp: '2026-06-21T12:01:00.000Z',
            binName: 'wp-sessionstart-routing',
            hookName: 'sessionstart-routing',
            event: 'SessionStart',
            phase: 'child',
            fallback: 'fail-open',
            status: 1,
          },
        ],
      }),
      'utf8',
    )

    let output = ''
    await hooksErrorsCommand(['--limit', '1'], { write: (chunk: string) => (output += chunk) })
    expect(output).toContain('showing 1 recent managed hook degradation')
    expect(output).toContain('wp-pretool-guard (PreToolUse/pretool-guard)')
    expect(output).not.toContain('wp-sessionstart-routing')

    output = ''
    await hooksErrorsCommand(['--json', '--limit', '1'], {
      write: (chunk: string) => (output += chunk),
    })
    expect(JSON.parse(output)).toMatchObject({
      version: 1,
      entries: [{ binName: 'wp-pretool-guard', status: 1 }],
    })
  })

  it('records hook errors newest-first', () => {
    recordHookError({
      binName: 'wp-post-tool',
      hookName: 'post-tool',
      event: 'PostToolUse',
      phase: 'handler',
      fallback: 'fail-open',
      detail: 'first',
    })
    recordHookError({
      binName: 'wp-stop-qa',
      hookName: 'stop-qa',
      event: 'Stop',
      phase: 'handler',
      fallback: 'emit-empty-json',
      detail: 'second',
    })

    expect(readHookErrors().map((entry) => entry.detail)).toStrictEqual(['second', 'first'])
  })

  it('caps recorded hook errors at 50 entries', () => {
    for (let index = 0; index < 55; index += 1) {
      recordHookError({
        binName: 'wp-post-tool',
        hookName: 'post-tool',
        event: 'PostToolUse',
        phase: 'handler',
        fallback: 'fail-open',
        detail: `entry-${index}`,
      })
    }

    const entries = readHookErrors()
    expect(entries).toHaveLength(50)
    expect(entries[0]?.detail).toBe('entry-54')
    expect(entries.at(-1)?.detail).toBe('entry-5')
  })

  it('renames the temp file away after a successful recorder write', () => {
    recordHookError({
      binName: 'wp-pretool-guard',
      hookName: 'pretool-guard',
      event: 'PreToolUse',
      phase: 'handler',
      fallback: 'fail-closed-deny',
      detail: 'temporary write check',
    })

    expect(readdirSync(tmp).filter((entry) => entry.endsWith('.tmp'))).toStrictEqual([])
  })

  it('does not throw when recorder writes fail and emits one stderr breadcrumb', () => {
    const badPath = join(tmp, 'directory-target')
    mkdirSync(badPath)
    process.env.WP_HOOK_ERRORS_PATH = badPath
    let stderr = ''
    const stderrSpy = vi
      .spyOn(process.stderr, 'write')
      .mockImplementation((chunk: string | Uint8Array) => {
        stderr += String(chunk)
        return true
      })

    try {
      expect(() => {
        recordHookError({
          binName: 'wp-post-tool',
          hookName: 'post-tool',
          event: 'PostToolUse',
          phase: 'handler',
          fallback: 'fail-open',
          detail: 'first failure',
        })
        recordHookError({
          binName: 'wp-post-tool',
          hookName: 'post-tool',
          event: 'PostToolUse',
          phase: 'handler',
          fallback: 'fail-open',
          detail: 'second failure',
        })
      }).not.toThrow()
    } finally {
      stderrSpy.mockRestore()
    }

    expect(stderr).toContain('webpresso hook error recorder unavailable:')
    expect(stderr.match(/webpresso hook error recorder unavailable:/gu)).toHaveLength(1)
    expect(readdirSync(tmp).filter((entry) => entry.endsWith('.tmp'))).toStrictEqual([])
  })
})
