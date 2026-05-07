import type { SpawnSyncReturns } from 'node:child_process'

import { describe, expect, it } from 'vitest'

import { ERR_COMMAND_HELP, runErrCommand } from './err.js'

function spawnResult(overrides: Partial<SpawnSyncReturns<string>> = {}): SpawnSyncReturns<string> {
  return {
    pid: 123,
    output: [],
    stdout: '',
    stderr: '',
    signal: null,
    status: 0,
    ...overrides,
  }
}

function writable() {
  let value = ''
  return {
    stream: {
      write(chunk: string) {
        value += chunk
        return true
      },
    },
    read: () => value,
  }
}

describe('runErrCommand', () => {
  it('prints only failure-looking lines and propagates the subcommand exit code', () => {
    const stdout = writable()
    const code = runErrCommand(['sh', '-c', 'echo unused'], {
      run: (command, args) => {
        expect(command).toBe('sh')
        expect(args).toEqual(['-c', 'echo unused'])
        return spawnResult({
          stdout: 'a\nERROR: x\nb\n',
          status: 7,
        })
      },
      stdout: stdout.stream,
    })

    expect(code).toBe(7)
    expect(stdout.read()).toBe('ERROR: x\n')
  })

  it('captures stderr as well as stdout', () => {
    const stdout = writable()
    const code = runErrCommand(['node', '-e', 'throw new Error("boom")'], {
      run: () =>
        spawnResult({
          stdout: 'noise\n',
          stderr: 'FAIL stderr\n',
          status: 1,
        }),
      stdout: stdout.stream,
    })

    expect(code).toBe(1)
    expect(stdout.read()).toBe('FAIL stderr\n')
  })

  it('returns usage failure for a missing command', () => {
    const stderr = writable()

    const code = runErrCommand([], { stderr: stderr.stream })

    expect(code).toBe(1)
    expect(stderr.read()).toContain('Usage: ak err <cmd> [...args]')
  })

  it('documents the command in help text', () => {
    expect(ERR_COMMAND_HELP).toContain('ak err sh -c')
    expect(ERR_COMMAND_HELP).toContain('print only failure-looking output')
  })
})
