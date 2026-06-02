import { describe, expect, it, vi } from 'vitest'

const runCommand = vi.hoisted(() => vi.fn())

vi.mock('#mcp/tools/_shared/run-command', () => ({
  isRunFailure: () => false,
  runCommand,
}))

import { runTypecheck } from './index.js'

describe('runTypecheck', () => {
  it('routes root typecheck through the managed TypeScript runner', async () => {
    runCommand.mockResolvedValueOnce({
      stdout: '',
      stderr: '',
      exitCode: 0,
      timedOut: false,
      aborted: false,
    })

    await runTypecheck({ cwd: process.cwd() })

    expect(runCommand).toHaveBeenCalledWith(
      expect.stringContaining('typescript'),
      ['--noEmit'],
      expect.objectContaining({ cwd: process.cwd() }),
    )
  })
})
