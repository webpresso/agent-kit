import { cac } from 'cac'
import { beforeEach, describe, expect, it, vi } from 'vitest'

const pretoolMain = vi.hoisted(() => vi.fn())
const testQualityCheck = vi.hoisted(() => vi.fn())

vi.mock('#hooks/pretool-guard/index', () => ({ main: pretoolMain }))
vi.mock('#hooks/test-quality-check', () => ({ runTestQualityCheck: testQualityCheck }))

import { registerHookCommand, runHookCommand } from './hook.js'

async function runHookCli(argv: string[]): Promise<unknown> {
  const cli = cac('wp')
  registerHookCommand(cli)
  cli.parse(['node', 'wp', ...argv], { run: false })
  return await cli.runMatchedCommand()
}

describe('hook command', () => {
  beforeEach(() => {
    vi.clearAllMocks()
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
    await expect(runHookCli(['hook', 'check-dev-link'])).rejects.toThrow('Unknown hook "check-dev-link"')
  })
})
