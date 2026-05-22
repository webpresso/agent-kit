import { describe, expect, it, vi } from 'vitest'

import { buildTypecheckCommand, runTypecheckCommand } from './typecheck'

describe('ak typecheck command', () => {
  it('builds the default no-emit command with stable non-pretty output', () => {
    expect(buildTypecheckCommand()).toEqual({
      command: 'tsc',
      args: ['--noEmit', '--pretty', 'false'],
    })
  })

  it('can preserve pretty output when requested', () => {
    expect(buildTypecheckCommand({ pretty: true })).toEqual({
      command: 'tsc',
      args: ['--noEmit'],
    })
  })

  it('returns the child process exit status', () => {
    const run = vi.fn(() => ({ status: 2, signal: null, output: [], pid: 1, stdout: '', stderr: '' }))
    expect(runTypecheckCommand({}, { run })).toBe(2)
    expect(run).toHaveBeenCalledWith('tsc', ['--noEmit', '--pretty', 'false'])
  })
})
