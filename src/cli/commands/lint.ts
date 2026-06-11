import type { CAC } from 'cac'

import { sharedOxlintConfigArgs } from '#config/oxlint/shared-config-path'
import { getManagedRunner } from '#tool-runtime'
import { emitCliCommandOutput, runCliCommandSequence } from './quality-runner.js'

export const LINT_COMMAND_HELP = [
  'Lint via the `vp lint` facade.',
  '',
  'Examples:',
  '  wp lint',
  '  wp lint --fix',
].join('\n')

export function registerLintCommand(cli: CAC): void {
  cli
    .command('lint [...files]', LINT_COMMAND_HELP)
    .option('--fix', 'Apply autofixes via vp lint --fix')
    .option('--full', 'Print the full raw output instead of the default summary-first view')
    .action(async (files: string[] | undefined, flags: Record<string, unknown>) => {
      const command = buildLintCommand({
        files: files && files.length > 0 ? files : undefined,
        fix: Boolean(flags.fix),
        cwd: process.cwd(),
      })
      const result = await runCliCommandSequence({
        commandName: 'lint',
        commands: [command],
        cwd: process.cwd(),
        metadataOptions: {
          fix: Boolean(flags.fix),
          files: files && files.length > 0 ? files : undefined,
        },
        summary: ({ exitCode, timedOut, aborted }) => {
          if (timedOut) return 'lint timed out via vp lint'
          if (aborted) return 'lint aborted via vp lint'
          return exitCode === 0
            ? 'lint passed via vp lint'
            : `lint failed via vp lint (exit ${exitCode})`
        },
      })
      emitCliCommandOutput({
        entry: result.entry,
        summary: result.entry.summary ?? '',
        passed: result.exitCode === 0,
        full: Boolean(flags.full),
        toolName: 'lint-oxlint',
      })
      return result.exitCode
    })
}

export function buildLintCommand(
  options: {
    readonly files?: readonly string[]
    readonly fix?: boolean
    readonly cwd?: string
  } = {},
): { command: string; args: readonly string[] } {
  const cwd = options.cwd ?? process.cwd()
  const args: string[] = ['lint', '--format=json']
  args.push(...sharedOxlintConfigArgs(cwd, args))
  if (options.fix) args.push('--fix')
  if (options.files && options.files.length > 0) args.push(...options.files)
  else args.push('.')

  const resolution = getManagedRunner('vp', { outputPolicy: 'structured' })
  return {
    command: resolution.command,
    args: [...resolution.args, ...args],
  }
}
