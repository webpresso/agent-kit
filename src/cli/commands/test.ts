import type { CommandConfig, TestCommandOptions } from '#test'
import type { CAC } from 'cac'

import {
  buildTestCommand,
  isCommandSequenceConfig,
  parseTestSuiteName,
  resolveTestTarget,
} from '#test'
import {
  emitCliCommandOutput,
  runCliCommandSequence,
  type CliSpawnCommand,
} from './quality-runner.js'

export const TEST_COMMAND_HELP = [
  'Run tests through the portable webpresso test surface.',
  '',
  'Examples:',
  '  wp test --suite unit',
  '  wp test --suite integration',
  '  wp test --package cli2',
  '  wp test --file apps/cli2/src/commands/target.test.ts',
  '  wp test --package cli2 -- --reporter=dot',
].join('\n')

export interface AkTestCommandInput extends TestCommandOptions {
  cwd?: string
  package?: readonly string[] | string
  file?: readonly string[] | string
  passthrough?: readonly string[]
}

export function createAkTestCommandConfig(input: AkTestCommandInput): CommandConfig {
  const target = resolveTestTarget({
    package: toArray(input.package),
    file: toArray(input.file),
    positional: [],
  })

  return buildTestCommand(target, { ...input, cwd: input.cwd })
}

export function registerTestCommand(cli: CAC): void {
  cli
    .command('test', TEST_COMMAND_HELP)
    .option('--suite <name>', 'Run the all, unit, or integration suite')
    .option('--package <name>', 'Run tests for a package target')
    .option('--file <path>', 'Run tests for a file target')
    .option('--watch', 'Run Vitest in watch mode or vp test:watch for package targets')
    .option('--coverage', 'Forward coverage to the underlying test runner')
    .option('-t, --test-name-pattern <pattern>', 'Forward a Vitest test name pattern')
    .option('--mutation', 'Use the vp test:mutation task for package targets')
    .option('--workers', 'Use the vp test:workers task for package targets')
    .option('--cache', 'Enable vp cache')
    .option('--no-cache', 'Disable vp cache')
    .option('--parallel', 'Forward --parallel to vp')
    .option('--concurrency-limit <n>', 'Forward a vp concurrency limit')
    .option('--log <mode>', 'Forward vp log mode')
    .option('--full', 'Print the full raw output instead of the default summary-first view')
    .option('--print-command', 'Print the resolved command instead of executing it')
    .action(async (flags: Record<string, unknown>) => {
      const rawArgv = process.argv.slice(2)
      const command = createAkTestCommandConfig({
        cwd: process.cwd(),
        package: flags.package as string | string[] | undefined,
        file: flags.file as string | string[] | undefined,
        passthrough: getPassthroughArgs(rawArgv),
        suite: parseTestSuiteName(flags.suite as string | undefined),
        watch: Boolean(flags.watch),
        coverage: Boolean(flags.coverage),
        testNamePattern: flags.testNamePattern as string | undefined,
        mutation: Boolean(flags.mutation),
        workers: Boolean(flags.workers),
        cache: rawArgv.includes('--cache'),
        noCache: rawArgv.includes('--no-cache'),
        parallel: Boolean(flags.parallel),
        concurrencyLimit: toOptionalNumber(flags.concurrencyLimit),
        log: flags.log as TestCommandOptions['log'],
      })

      if (flags.printCommand) {
        console.log(formatShellCommand(command))
        return 0
      }

      const commands = flattenCommandConfig(command)
      const result = await runCliCommandSequence({
        commandName: 'test',
        commands,
        cwd: process.cwd(),
        metadataOptions: {
          suite: parseTestSuiteName(flags.suite as string | undefined),
          package: toArray(flags.package as string | string[] | undefined),
          file: toArray(flags.file as string | string[] | undefined),
        },
        summary: ({ exitCode, timedOut, aborted }) => {
          if (timedOut) return 'test timed out'
          if (aborted) return 'test aborted'
          return exitCode === 0 ? 'test passed' : `test failed (exit ${exitCode})`
        },
      })

      emitCliCommandOutput({
        entry: result.entry,
        summary: result.entry.summary ?? '',
        passed: result.exitCode === 0,
        full: Boolean(flags.full),
        toolName: 'wp_test',
      })

      return result.exitCode
    })
}

function getPassthroughArgs(argv: readonly string[]): string[] {
  const separatorIndex = argv.indexOf('--')
  return separatorIndex === -1 ? [] : argv.slice(separatorIndex + 1)
}

function formatShellCommand(config: CommandConfig): string {
  if (isCommandSequenceConfig(config)) {
    return config.sequence.map(formatShellCommand).join(' && ')
  }

  return [config.command, ...config.args].map(shellQuote).join(' ')
}

function shellQuote(value: string): string {
  return /^[A-Za-z0-9_./:=@+-]+$/u.test(value) ? value : `'${value.replace(/'/gu, "'\\''")}'`
}

function toArray(value: readonly string[] | string | undefined): string[] {
  if (value === undefined) return []
  return typeof value === 'string' ? [value] : [...value]
}

function toOptionalNumber(value: unknown): number | undefined {
  if (value === undefined) return
  const parsed = Number(value)
  return Number.isFinite(parsed) ? parsed : undefined
}

function flattenCommandConfig(config: CommandConfig): CliSpawnCommand[] {
  if (isCommandSequenceConfig(config)) {
    return config.sequence.map((step) => ({
      command: step.command,
      args: step.args,
      env: step.env,
    }))
  }
  return [{ command: config.command, args: config.args, env: config.env }]
}
