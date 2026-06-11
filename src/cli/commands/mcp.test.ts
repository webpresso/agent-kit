import { describe, expect, it, vi } from 'vitest'

const runStdioServer = vi.hoisted(() => vi.fn())

vi.mock('#mcp/cli', () => ({
  runStdioServer,
}))

import { registerMcpCommand } from './mcp.js'

function buildFakeCli() {
  let registeredAction: (() => Promise<number>) | undefined

  const cli = {
    command: (_name: string, _desc: string) => ({
      action: (fn: typeof registeredAction) => {
        registeredAction = fn
      },
    }),
    getAction: () => registeredAction,
  }

  return cli
}

describe('registerMcpCommand', () => {
  it('calls runStdioServer once with no args', async () => {
    runStdioServer.mockResolvedValue(undefined)
    const cli = buildFakeCli()
    registerMcpCommand(cli as never)

    const action = cli.getAction()
    expect(action).not.toBe(undefined)
    await action!()

    expect(runStdioServer).toHaveBeenCalledOnce()
    expect(runStdioServer).toHaveBeenCalledWith()
  })

  it('returns 0', async () => {
    runStdioServer.mockResolvedValue(undefined)
    const cli = buildFakeCli()
    registerMcpCommand(cli as never)

    const action = cli.getAction()
    const result = await action!()

    expect(result).toEqual(0)
  })
})
