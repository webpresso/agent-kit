import type { CAC } from 'cac'
import type { SpawnSyncReturns } from 'node:child_process'

import { spawnSync } from 'node:child_process'

export const TYPECHECK_COMMAND_HELP = [
  'Typecheck the current workspace through the portable wp surface.',
  '',
  'Examples:',
  '  wp typecheck',
  '  wp typecheck --pretty',
].join('\n')

export interface TypecheckOptions {
  readonly pretty?: boolean
}

export interface TypecheckCommandConfig {
  readonly command: string
  readonly args: readonly string[]
}

export interface TypecheckCommandDeps {
  readonly run?: (command: string, args: readonly string[]) => SpawnSyncReturns<string>
}

export function registerTypecheckCommand(cli: CAC): void {
  cli
    .command('typecheck', TYPECHECK_COMMAND_HELP)
    .option('--pretty', 'Keep TypeScript pretty output enabled')
    .action((flags: Record<string, unknown>) =>
      runTypecheckCommand({ pretty: Boolean(flags.pretty) }),
    )
}

export function buildTypecheckCommand(options: TypecheckOptions = {}): TypecheckCommandConfig {
  return {
    command: 'tsc',
    args: ['--noEmit', ...(options.pretty ? [] : ['--pretty', 'false'])],
  }
}

export function runTypecheckCommand(
  options: TypecheckOptions = {},
  deps: TypecheckCommandDeps = {},
): number {
  const command = buildTypecheckCommand(options)
  const result = (deps.run ?? defaultRun)(command.command, command.args)
  if (typeof result.status === 'number') return result.status
  return 1
}

function defaultRun(command: string, args: readonly string[]): SpawnSyncReturns<string> {
  return spawnSync(command, [...args], {
    encoding: 'utf8',
    env: process.env,
    stdio: 'inherit',
    windowsHide: true,
  })
}
