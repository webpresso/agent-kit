import type { CAC } from 'cac'

import { runFormat } from '../../format/index.js'

export const FORMAT_COMMAND_HELP = [
  'Format the workspace via `oxfmt`. Writes in place by default.',
  '',
  'Examples:',
  '  ak format            # rewrite files in place',
  '  ak format --check    # exit 1 on any unformatted file (no writes)',
].join('\n')

export function registerFormatCommand(cli: CAC): void {
  cli
    .command('format [...files]', FORMAT_COMMAND_HELP)
    .option('--check', 'Check formatting without writing changes; exit 1 on drift')
    .action(async (files: string[] | undefined, flags: Record<string, unknown>) => {
      const result = await runFormatSafely({
        files: files && files.length > 0 ? files : undefined,
        check: Boolean(flags.check),
      })

      if (!result.ok) {
        // Surface the missing-binary message and the install hint to the user
        // and exit non-zero so CI / husky / agent loops fail loud.
        console.error(result.message)
        console.error('Install with: pnpm add -D oxfmt')
        return 1
      }

      const formatResult = result.value
      if (formatResult.spawnError) {
        console.error(formatResult.spawnError)
        return formatResult.exitCode || 1
      }

      if (formatResult.output) {
        process.stderr.write(formatResult.output)
      }

      const verb = formatResult.passed ? 'passed' : 'failed'
      const mode = flags.check ? 'check' : 'write'
      console.error(`format ${verb} (${mode})`)
      return formatResult.exitCode
    })
}

type SafeResult<T> = { ok: true; value: T } | { ok: false; message: string }

async function runFormatSafely(
  options: Parameters<typeof runFormat>[0],
): Promise<SafeResult<Awaited<ReturnType<typeof runFormat>>>> {
  try {
    return { ok: true, value: await runFormat(options) }
  } catch (error) {
    return { ok: false, message: error instanceof Error ? error.message : String(error) }
  }
}
