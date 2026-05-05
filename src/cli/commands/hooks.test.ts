import { describe, expect, it, vi } from 'vitest'

const printHooksDoctor = vi.hoisted(() => vi.fn())

vi.mock('#hooks/doctor', () => ({
  printHooksDoctor,
}))

import { registerHooksCommand } from './hooks.js'

function buildFakeCli() {
  let registeredAction: ((_action: string | undefined, options: { skipMcp?: boolean }) => Promise<number>) | undefined

  const cli = {
    command: (_name: string, _desc: string) => ({
      option: (_flag: string, _desc: string) => ({
        action: (fn: typeof registeredAction) => {
          registeredAction = fn
        },
      }),
    }),
    getAction: () => registeredAction,
  }

  return cli
}

describe('registerHooksCommand', () => {
  it('calls printHooksDoctor with skipMcp undefined when not provided', async () => {
    printHooksDoctor.mockResolvedValue(0)
    const cli = buildFakeCli()
    registerHooksCommand(cli as never)

    const action = cli.getAction()
    expect(action).toBeDefined()
    await action!(undefined, {})

    expect(printHooksDoctor).toHaveBeenCalledWith({ skipMcp: undefined })
  })

  it('calls printHooksDoctor with skipMcp true when flag is set', async () => {
    printHooksDoctor.mockResolvedValue(0)
    const cli = buildFakeCli()
    registerHooksCommand(cli as never)

    const action = cli.getAction()
    await action!(undefined, { skipMcp: true })

    expect(printHooksDoctor).toHaveBeenCalledWith({ skipMcp: true })
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
