import type { CommandConfig, E2eRunnerKind, PlannedE2eRunGroup } from "#e2e";
import type { CAC } from "cac";

import { planGenericE2eRun } from "#e2e";
import {
  createE2eExecutionPlan,
  formatShellCommand,
  plannedGroupsToCommandConfigs,
} from "#e2e/execution";
import { emitCliCommandOutput, runCliCommandSequence } from "./quality-runner.js";

export const E2E_COMMAND_HELP = [
  "Build and run a portable E2E command from host-supplied suite metadata.",
  "",
  "Examples:",
  "  wp e2e --suite smoke --config playwright.config.ts",
  "  wp e2e --file tests/smoke.spec.ts --test-list .tmp/e2e-list.txt",
  "  wp e2e --suite platform-api --reuse-reset",
].join("\n");

export interface AkE2eCommandInput {
  suite?: string;
  runner?: E2eRunnerKind;
  config?: string;
  file?: readonly string[] | string;
  headed?: boolean;
  debug?: boolean;
  reuseReset?: boolean;
  noSupervisor?: boolean;
  workers?: number | string;
  testList?: string;
  timeoutMs?: number;
  passthrough?: readonly string[];
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
  });

  const command = plannedGroupsToCommandConfigs(groups)[0];
  if (!command) {
    throw new Error("No E2E command could be planned.");
  }

  return command;
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
  );
}

export function registerE2eCommand(cli: CAC): void {
  cli
    .command("e2e", E2E_COMMAND_HELP)
    .option("--suite <name>", "Host-provided suite id")
    .option("--runner <kind>", "Runner kind: playwright, vitest, or command")
    .option("--config <path>", "Runner config path")
    .option("--file <path>", "E2E file path")
    .option("--headed", "Forward headed mode to Playwright")
    .option("--debug", "Forward debug mode to Playwright")
    .option("--reuse-reset", "Forward host-managed reuse reset mode when supported")
    .option("--no-supervisor", "Forward host-managed direct startup mode when supported")
    .option("--workers <n>", "Forward worker count")
    .option("--test-list <path>", "Forward a Playwright test-list file")
    .option("--timeout-ms <ms>", "Kill the e2e child process group if it exceeds this timeout")
    .option("--full", "Print the full raw output instead of the default summary-first view")
    .option("--print-command", "Print the resolved command instead of executing it")
    .action(async (flags: Record<string, unknown>) => {
      const files = toArray(flags.file as string | string[] | undefined);
      const groups = await createAkE2eExecutionPlan({
        suite: flags.suite as string | undefined,
        runner: flags.runner as E2eRunnerKind | undefined,
        config: flags.config as string | undefined,
        file: files,
        headed: Boolean(flags.headed),
        debug: Boolean(flags.debug),
        reuseReset: Boolean(flags.reuseReset),
        noSupervisor: Boolean(flags.noSupervisor),
        workers: flags.workers as string | undefined,
        testList: flags.testList as string | undefined,
        passthrough: getPassthroughArgs(process.argv.slice(2)),
      });

      const commands = plannedGroupsToCommandConfigs(groups);
      if (flags.printCommand) {
        console.log(commands.map(formatShellCommand).join("\n"));
        return 0;
      }

      const result = await runCliCommandSequence({
        commandName: "e2e",
        commands,
        cwd: process.cwd(),
        timeoutMs:
          flags.timeoutMs === undefined ? undefined : Number.parseInt(String(flags.timeoutMs), 10),
        metadataOptions: {
          suite: flags.suite as string | undefined,
          runner: flags.runner as string | undefined,
          file: files,
        },
        summary: ({ exitCode, timedOut, aborted }) => {
          if (timedOut) return "e2e timed out";
          if (aborted) return "e2e aborted";
          return exitCode === 0 ? "e2e passed" : `e2e failed (exit ${exitCode})`;
        },
      });
      emitCliCommandOutput({
        entry: result.entry,
        summary: result.entry.summary ?? "",
        passed: result.exitCode === 0,
        full: Boolean(flags.full),
        toolName: "wp_e2e",
      });
      return result.exitCode;
    });
}

export { plannedGroupsToCommandConfigs };

function getPassthroughArgs(argv: readonly string[]): string[] {
  const separatorIndex = argv.indexOf("--");
  return separatorIndex === -1 ? [] : argv.slice(separatorIndex + 1);
}

function toArray(value: readonly string[] | string | undefined): string[] {
  if (value === undefined) return [];
  return typeof value === "string" ? [value] : [...value];
}
