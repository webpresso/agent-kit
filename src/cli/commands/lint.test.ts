import { describe, expect, it } from 'vitest'

import { buildLintCommand, LINT_COMMAND_HELP, registerLintCommand } from './lint.js'

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

describe('wp lint command', () => {
  it('builds the lint command through vp with JSON output', () => {
    const command = buildLintCommand({ files: ['src/index.ts'], fix: true })
    expect(command.command).toBe('vp')
    expect(command.args).toContain('lint')
    expect(command.args).toContain('--format=json')
    expect(command.args).toContain('--fix')
    expect(command.args).toContain('src/index.ts')
  })

  it('exposes the summary-first --full escape hatch', () => {
    const cli = buildFakeCli()
    registerLintCommand(cli as never)
    expect(cli.getOptions()).toContain('--file <path>')
    expect(cli.getOptions()).toContain('--full')
  })

  it('documents the standardized --file syntax', () => {
    expect(LINT_COMMAND_HELP).toContain('wp lint --file src/index.ts')
  })
})
