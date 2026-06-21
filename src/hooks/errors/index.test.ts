import { mkdtempSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'

import { formatHookErrors, hooksErrorsCommand, readHookErrors } from './index.js'

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
})
