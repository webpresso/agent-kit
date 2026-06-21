import type { CAC } from 'cac'

import { getManagedRunner } from '#tool-runtime'
import { createCliLogSink } from './quality-log-store.js'
import { emitCliCommandOutput, runCliCommandSequence } from './quality-runner.js'

export const QA_COMMAND_HELP = [
  'Run the repository QA gate through the portable wp surface.',
  '',
  'Examples:',
  '  wp qa',
  '  wp qa --print-command',
].join('\n')

export interface QaCommandConfig {
  readonly command: string
  readonly args: readonly string[]
}

export function registerQaCommand(cli: CAC): void {
  cli
    .command('qa', QA_COMMAND_HELP)
    .option('--full', 'Print the full raw output instead of the default summary-first view')
    .option('--print-command', 'Print the resolved command instead of executing it')
    .action(async (flags: Record<string, unknown>) => {
      const command = buildQaCommand({ cwd: process.cwd() })

      if (flags.printCommand) {
        console.log(formatShellCommand(command))
        return 0
      }

      const result = await runQaCommand({ cwd: process.cwd() })
      emitCliCommandOutput({
        entry: result.entry,
        summary: result.entry.summary ?? '',
        passed: result.exitCode === 0,
        full: Boolean(flags.full),
        toolName: 'wp_qa',
      })
      return result.exitCode
    })
}

export function buildQaCommand(_options: { cwd?: string } = {}): readonly QaCommandConfig[] {
  const resolution = getManagedRunner('vp')
  const vp = (script: string): QaCommandConfig => ({
    command: resolution.command,
    args: [...resolution.args, 'run', script],
  })
  const wp = (...args: string[]): QaCommandConfig => ({ command: './bin/wp', args })
  return [
    vp('build'),
    wp('typecheck'),
    wp('lint'),
    wp('format', '--check'),
    wp('test', '--suite', 'all'),
    wp('test', '--suite', 'package-smoke'),
    vp('lint:pkg'),
    wp('audit', 'guardrails'),
    vp('workflow-actions:check'),
    wp('hooks', 'doctor', '--skip-mcp'),
  ]
}

export async function runQaCommand(
  options: { cwd?: string } = {},
  deps: { stderr?: Pick<typeof process.stderr, 'write'> } = {},
): Promise<{ exitCode: number; entry: import('./quality-log-store.js').CliLogEntry }> {
  void deps
  const commands = buildQaCommand(options)

  const result = await runCliCommandSequence({
    commandName: 'qa',
    commands,
    cwd: options.cwd,
    summary: ({ exitCode, timedOut, aborted }) => {
      if (timedOut) return 'qa timed out'
      if (aborted) return 'qa aborted'
      return exitCode === 0 ? 'qa passed' : `qa failed (exit ${exitCode})`
    },
  })
  return { exitCode: result.exitCode, entry: result.entry }
}

function formatShellCommand(config: readonly QaCommandConfig[]): string {
  return config.map((command) => [command.command, ...command.args].map(shellQuote).join(' ')).join(' && ')
}

function shellQuote(value: string): string {
  return /^[A-Za-z0-9_./:=@+-]+$/u.test(value) ? value : `'${value.replace(/'/gu, "'\\''")}'`
}
