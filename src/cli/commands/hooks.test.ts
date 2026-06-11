import { describe, expect, it, vi } from 'vitest'

const printHooksDoctor = vi.hoisted(() => vi.fn())

vi.mock('#hooks/doctor', () => ({
  printHooksDoctor,
}))

import { registerHooksCommand } from './hooks.js'

function buildFakeCli() {
  let registeredAction:
    | ((
        _action: string | undefined,
        options: {
          skipMcp?: boolean
          hosts?: 'auto' | 'skip' | 'required'
          host?: Array<'codex' | 'opencode' | 'claude'>
        },
      ) => Promise<number>)
    | undefined

  const chain = {
    option: (_flag: string, _desc: string, _config?: unknown) => chain,
    action: (fn: typeof registeredAction) => {
      registeredAction = fn
    },
  }

  const cli = {
    command: (_name: string, _desc: string) => chain,
    getAction: () => registeredAction,
  }

  return cli
}

describe('registerHooksCommand', () => {
  it('calls printHooksDoctor with defaults when not provided', async () => {
    printHooksDoctor.mockResolvedValue(0)
    const cli = buildFakeCli()
    registerHooksCommand(cli as never)

    const action = cli.getAction()
    expect(action).not.toBe(undefined)
    await action!(undefined, {})

    expect(printHooksDoctor).toHaveBeenCalledWith({
      skipMcp: undefined,
      hosts: undefined,
      hostNames: undefined,
    })
  })

  it('passes through skipMcp, hosts, and host filters', async () => {
    printHooksDoctor.mockResolvedValue(0)
    const cli = buildFakeCli()
    registerHooksCommand(cli as never)

    const action = cli.getAction()
    await action!(undefined, { skipMcp: true, hosts: 'required', host: ['codex', 'opencode'] })

    expect(printHooksDoctor).toHaveBeenCalledWith({
      skipMcp: true,
      hosts: 'required',
      hostNames: ['codex', 'opencode'],
    })
  })

  it('returns the exit code from printHooksDoctor', async () => {
    printHooksDoctor.mockResolvedValue(1)
    const cli = buildFakeCli()
    registerHooksCommand(cli as never)

    const action = cli.getAction()
    const result = await action!(undefined, {})

    expect(result).toEqual(1)
  })
})
