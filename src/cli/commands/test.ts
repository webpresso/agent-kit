import type { CommandConfig, TestCommandOptions } from '#test'
import type { CAC } from 'cac'

import { spawnSync } from 'node:child_process'

import { buildTestCommand, resolveTestTarget } from '#test'

export const TEST_COMMAND_HELP = [
  'Run tests through the portable agent-kit test surface.',
  '',
  'Examples:',
  '  wp test --package cli2',
  '  wp test --file apps/cli2/src/commands/target.test.ts',
  '  wp test --package cli2 -- --reporter=dot',
].join('\n')

export interface AkTestCommandInput extends TestCommandOptions {
  package?: readonly string[] | string
  file?: readonly string[] | string
  targets?: readonly string[] | string
  passthrough?: readonly string[]
}

export function createAkTestCommandConfig(input: AkTestCommandInput): CommandConfig {
  const target = resolveTestTarget({
    package: toArray(input.package),
    file: toArray(input.file),
    positional: toArray(input.targets),
  })

  return buildTestCommand(target, input)
}

export function registerTestCommand(cli: CAC): void {
  cli
    .command('test [...targets]', TEST_COMMAND_HELP)
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
    .option('--print-command', 'Print the resolved command instead of executing it')
    .action((targets: string[] | string | undefined, flags: Record<string, unknown>) => {
      const rawArgv = process.argv.slice(2)
      const command = createAkTestCommandConfig({
        package: flags.package as string | string[] | undefined,
        file: flags.file as string | string[] | undefined,
        targets: targets ?? [],
        passthrough: getPassthroughArgs(rawArgv),
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

      return runCommand(command)
    })
}

function runCommand(config: CommandConfig): number {
  const result = spawnSync(config.command, config.args, {
    env: { ...process.env, ...config.env },
    stdio: 'inherit',
  })

  return result.status ?? 1
}

function getPassthroughArgs(argv: readonly string[]): string[] {
  const separatorIndex = argv.indexOf('--')
  return separatorIndex === -1 ? [] : argv.slice(separatorIndex + 1)
}

function formatShellCommand(config: CommandConfig): string {
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
