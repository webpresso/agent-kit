import { describe, expect, it } from 'vitest'

import { registerFormatCommand } from './format.js'

function buildFakeCli() {
  const options: string[] = []
  const chain = {
    option: (name: string) => {
      options.push(name)
      return chain
    },
    action: (_fn: unknown) => chain,
  }
  return {
    command: () => chain,
    getOptions: () => options,
  }
}

describe('wp format command', () => {
  it('exposes the summary-first --full escape hatch', () => {
    const cli = buildFakeCli()
    registerFormatCommand(cli as never)
    expect(cli.getOptions()).toContain('--full')
  })
})
