import type { CAC } from 'cac'
import { getManagedRunner } from '#tool-runtime'
import { getPackageScript, isRecursiveWpScript } from '#cli/package-scripts.js'
import { emitCliCommandOutput, runCliCommandSequence } from './quality-runner.js'

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
  readonly env?: Record<string, string>
}

export function registerTypecheckCommand(cli: CAC): void {
  cli
    .command('typecheck', TYPECHECK_COMMAND_HELP)
    .option('--pretty', 'Keep TypeScript pretty output enabled')
    .option('--full', 'Print the full raw output instead of the default summary-first view')
    .action(async (flags: Record<string, unknown>) => {
      const result = await runTypecheckCommand({ pretty: Boolean(flags.pretty) })
      emitCliCommandOutput({
        entry: result.entry,
        summary: result.entry.summary ?? '',
        passed: result.exitCode === 0,
        full: Boolean(flags.full),
        toolName: 'wp_typecheck',
      })
      return result.exitCode
    })
}

export function buildTypecheckCommand(options: TypecheckOptions = {}): TypecheckCommandConfig {
  const cwd = options.cwd ?? process.cwd()
  const checkTypesScript = getPackageScript(cwd, 'check-types')
  if (checkTypesScript && !isRecursiveWpScript(checkTypesScript, 'typecheck')) {
    const resolution = getManagedRunner('vp')
    return {
      command: resolution.command,
      args: [...resolution.args, 'run', 'check-types'],
    }
  }

  const resolution = getManagedRunner('tsc')
  return {
    command: resolution.command,
    args: [...resolution.args, '--noEmit', ...(options.pretty ? [] : ['--pretty', 'false'])],
  }
}

export async function runTypecheckCommand(
  options: TypecheckOptions = {},
): Promise<{ exitCode: number; entry: import('./quality-log-store.js').CliLogEntry }> {
  const command = buildTypecheckCommand(options)
  const result = await runCliCommandSequence({
    commandName: 'typecheck',
    commands: [{ command: command.command, args: command.args, env: command.env }],
    cwd: options.cwd,
    metadataOptions: { pretty: Boolean(options.pretty) },
    summary: ({ exitCode, timedOut, aborted }) => {
      if (timedOut) return 'typecheck timed out'
      if (aborted) return 'typecheck aborted'
      return exitCode === 0 ? 'typecheck passed' : `typecheck failed (exit ${exitCode})`
    },
  })
  return { exitCode: result.exitCode, entry: result.entry }
}
