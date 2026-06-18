import type { CAC } from 'cac'

import { getManagedRunner } from '#tool-runtime'
import { emitCliCommandOutput, runCliCommandSequence } from './quality-runner.js'

export const FORMAT_COMMAND_HELP = [
  'Format the workspace via the portable wp surface. Writes in place by default.',
  '',
  'Examples:',
  '  wp format            # rewrite files in place',
  '  wp format --file src/index.ts',
  '  wp format --check    # exit 1 on any unformatted file (no writes)',
].join('\n')

export function registerFormatCommand(cli: CAC): void {
  cli
    .command('format', FORMAT_COMMAND_HELP)
    .option('--file <path>', 'Format a file or path target (repeatable)')
    .option('--check', 'Check formatting without writing changes; exit 1 on drift')
    .option('--full', 'Print the full raw output instead of the default summary-first view')
    .action(async (flags: Record<string, unknown>) => {
      const result = await runFormatSafely({
        files: toArray(flags.file as string | string[] | undefined),
        check: Boolean(flags.check),
        cwd: process.cwd(),
      })

      if (!result.ok) {
        // Surface the missing-binary message to the user and exit non-zero so
        // CI / husky / agent loops fail loud.
        console.error(result.message)
        return 1
      }

      emitCliCommandOutput({
        entry: result.value.entry,
        summary: result.value.entry.summary ?? '',
        passed: result.value.exitCode === 0,
        full: Boolean(flags.full),
        toolName: 'wp_format',
      })
      return result.value.exitCode
    })
}

type SafeResult<T> = { ok: true; value: T } | { ok: false; message: string }

async function runFormatSafely(options: {
  readonly files?: readonly string[]
  readonly check?: boolean
  readonly cwd?: string
}): Promise<SafeResult<{ exitCode: number; entry: import('./quality-log-store.js').CliLogEntry }>> {
  try {
    const command = buildFormatCommand(options)
    const result = await runCliCommandSequence({
      commandName: 'format',
      commands: [command],
      cwd: options.cwd,
      metadataOptions: {
        check: Boolean(options.check),
        files: options.files,
      },
      summary: ({ exitCode, timedOut, aborted }) => {
        if (timedOut) return 'format timed out'
        if (aborted) return 'format aborted'
        if (exitCode === 0) return options.check ? 'format check passed' : 'format applied'
        return options.check
          ? `format check failed (exit ${exitCode}) — run \`wp format\` to apply fixes`
          : `format failed (exit ${exitCode})`
      },
    })
    return { ok: true, value: { exitCode: result.exitCode, entry: result.entry } }
  } catch (error) {
    return { ok: false, message: error instanceof Error ? error.message : String(error) }
  }
}

function buildFormatCommand(options: {
  readonly files?: readonly string[]
  readonly check?: boolean
}): { command: string; args: readonly string[] } {
  const args: string[] = [options.check ? '--check' : '--write', '--ignore-path', '.gitignore']
  if (options.files && options.files.length > 0) args.push(...options.files)
  const resolution = getManagedRunner('oxfmt', { outputPolicy: 'structured' })
  return {
    command: resolution.command,
    args: [...resolution.args, ...args],
  }
}

function toArray(value: readonly string[] | string | undefined): string[] {
  if (value === undefined) return []
  return typeof value === 'string' ? [value] : [...value]
}
