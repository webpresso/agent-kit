import type { CAC } from 'cac'
import type { SpawnSyncReturns } from 'node:child_process'
import { getManagedRunner } from '#tool-runtime'
import { getPackageScript, isRecursiveWpScript } from '#cli/package-scripts.js'
import { runTypecheck } from '../../typecheck/index.js'

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
  readonly cwd?: string
}

export interface TypecheckCommandConfig {
  readonly command: string
  readonly args: readonly string[]
}

export interface TypecheckCommandDeps {
  readonly run?: (command: string, args: readonly string[]) => SpawnSyncReturns<string>
  readonly runTypecheck?: typeof runTypecheck
  readonly stderr?: Pick<NodeJS.WriteStream, 'write'>
  readonly stdout?: Pick<NodeJS.WriteStream, 'write'>
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
  const cwd = options.cwd ?? process.cwd()
  const checkTypesScript = getPackageScript(cwd, 'check-types')
  if (checkTypesScript && !isRecursiveWpScript(checkTypesScript, 'typecheck')) {
    const resolution = getManagedRunner('vp', { outputPolicy: 'structured' })
    return {
      command: resolution.command,
      args: [...resolution.args, 'run', 'check-types'],
    }
  }

  const resolution = getManagedRunner('tsc', { cwd, outputPolicy: 'structured' })
  return {
    command: resolution.command,
    args: [...resolution.args, '--noEmit', ...(options.pretty ? [] : ['--pretty', 'false'])],
  }
}

export async function runTypecheckCommand(
  options: TypecheckOptions = {},
  deps: TypecheckCommandDeps = {},
): Promise<number> {
  const cwd = options.cwd ?? process.cwd()
  const checkTypesScript = getPackageScript(cwd, 'check-types')

  if (checkTypesScript && !isRecursiveWpScript(checkTypesScript, 'typecheck')) {
    const command = buildTypecheckCommand(options)
    const result = (deps.run ?? defaultRun)(command.command, command.args)
    if (typeof result.status === 'number') return result.status
    return 1
  }

  try {
    const result = await (deps.runTypecheck ?? runTypecheck)({
      cwd,
      pretty: options.pretty,
    })

    if (result.output) {
      ;(deps.stdout ?? process.stdout).write(result.output)
    }

    return result.passed ? 0 : 1
  } catch (error) {
    ;(deps.stderr ?? process.stderr).write(
      `${error instanceof Error ? error.message : String(error)}\n`,
    )
    return 1
  }
}

function defaultRun(command: string, args: readonly string[]): SpawnSyncReturns<string> {
  return spawnSync(command, [...args], {
    encoding: 'utf8',
    env: process.env,
    stdio: 'inherit',
    windowsHide: true,
  })
}
