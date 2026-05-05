import type { CommandConfig, E2eRunnerKind, PlannedE2eRunGroup } from '#e2e'
import type { CAC } from 'cac'

import { planGenericE2eRun } from '#e2e'
import {
  createE2eExecutionPlan,
  formatShellCommand,
  plannedGroupsToCommandConfigs,
  runCommandConfigs,
} from '#e2e/execution'

export const E2E_COMMAND_HELP = [
  'Build and run a portable E2E command from host-supplied suite metadata.',
  '',
  'Examples:',
  '  ak e2e --suite smoke --config playwright.config.ts',
  '  ak e2e --file tests/smoke.spec.ts --test-list .tmp/e2e-list.txt',
  '  ak e2e --suite platform-api --reuse-reset',
].join('\n')

export interface AkE2eCommandInput {
  suite?: string
  runner?: E2eRunnerKind
  config?: string
  file?: readonly string[] | string
  headed?: boolean
  debug?: boolean
  reuseReset?: boolean
  noSupervisor?: boolean
  workers?: number | string
  testList?: string
  passthrough?: readonly string[]
}

export function createAkE2eCommandConfig(input: AkE2eCommandInput): CommandConfig {
  const groups = planGenericE2eRun({
    suite: input.suite,
    runner: input.runner,
    config: input.config,
    files: toArray(input.file),
    headed: input.headed,
    debug: input.debug,
    reuseReset: input.reuseReset,
    noSupervisor: input.noSupervisor,
    workers: input.workers,
    testList: input.testList,
    passthrough: input.passthrough,
  })

  const command = plannedGroupsToCommandConfigs(groups)[0]
  if (!command) {
    throw new Error('No E2E command could be planned.')
  }

  return command
}

export async function createAkE2eExecutionPlan(
  input: AkE2eCommandInput,
  cwd = process.cwd(),
): Promise<PlannedE2eRunGroup[]> {
  return createE2eExecutionPlan(
    {
      suite: input.suite,
      runner: input.runner,
      config: input.config,
      files: toArray(input.file),
      headed: input.headed,
      debug: input.debug,
      reuseReset: input.reuseReset,
      noSupervisor: input.noSupervisor,
      workers: input.workers,
      testList: input.testList,
      passthrough: input.passthrough,
    },
    cwd,
  )
}

export function registerE2eCommand(cli: CAC): void {
  cli
    .command('e2e [...files]', E2E_COMMAND_HELP)
    .option('--suite <name>', 'Host-provided suite id')
    .option('--runner <kind>', 'Runner kind: playwright, vitest, or command')
    .option('--config <path>', 'Runner config path')
    .option('--file <path>', 'E2E file path')
    .option('--headed', 'Forward headed mode to Playwright')
    .option('--debug', 'Forward debug mode to Playwright')
    .option('--reuse-reset', 'Forward host-managed reuse reset mode when supported')
    .option('--no-supervisor', 'Forward host-managed direct startup mode when supported')
    .option('--workers <n>', 'Forward worker count')
    .option('--test-list <path>', 'Forward a Playwright test-list file')
    .option('--print-command', 'Print the resolved command instead of executing it')
    .action(async (files: string[] | string | undefined, flags: Record<string, unknown>) => {
      const groups = await createAkE2eExecutionPlan({
        suite: flags.suite as string | undefined,
        runner: flags.runner as E2eRunnerKind | undefined,
        config: flags.config as string | undefined,
        file: [...toArray(flags.file as string | string[] | undefined), ...toArray(files ?? [])],
        headed: Boolean(flags.headed),
        debug: Boolean(flags.debug),
        reuseReset: Boolean(flags.reuseReset),
        noSupervisor: Boolean(flags.noSupervisor),
        workers: flags.workers as string | undefined,
        testList: flags.testList as string | undefined,
        passthrough: getPassthroughArgs(process.argv.slice(2)),
      })

      const commands = plannedGroupsToCommandConfigs(groups)
      if (flags.printCommand) {
        console.log(commands.map(formatShellCommand).join('\n'))
        return 0
      }

      return runCommands(commands)
    })
}

async function runCommands(commands: readonly CommandConfig[]): Promise<number> {
  const result = await runCommandConfigs(commands)
  if (result.output) {
    process.stdout.write(result.output)
  }
  return result.exitCode
}

export { plannedGroupsToCommandConfigs }

function getPassthroughArgs(argv: readonly string[]): string[] {
  const separatorIndex = argv.indexOf('--')
  return separatorIndex === -1 ? [] : argv.slice(separatorIndex + 1)
}

function toArray(value: readonly string[] | string | undefined): string[] {
  if (value === undefined) return []
  return typeof value === 'string' ? [value] : [...value]
}
