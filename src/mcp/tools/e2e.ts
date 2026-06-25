/**
 * `wp_e2e` MCP tool.
 *
 * First-class E2E execution surface backed by the existing portable `wp e2e`
 * planner and host-adapter architecture. This tool is suite-aware and should
 * be used for E2E execution instead of overloading `wp_test`.
 */

import { z } from "zod";

import type { ToolDescriptor } from "#mcp/auto-discover";
import { type E2eRunnerKind, type PlannedE2eRunGroup } from "#e2e";
import type { CommandConfig } from "#e2e";
import {
  createE2eExecutionPlan,
  plannedGroupsToCommandConfigs,
  runCommandConfigs,
} from "#e2e/execution";
import { formatMcpToolOutput } from "./_shared/full-output.js";
import { resolveProjectRoot } from "./_shared/project-root.js";
import { createSummaryOutputSchema, createSummaryResult } from "./_shared/result.js";

const inputSchema = z.object({
  cwd: z.string().optional(),
  suite: z.string().optional(),
  runner: z.enum(["playwright", "vitest", "command"] satisfies readonly E2eRunnerKind[]).optional(),
  config: z.string().optional(),
  files: z.array(z.string()).optional().default([]),
  headed: z.boolean().optional().default(false),
  debug: z.boolean().optional().default(false),
  reuseReset: z.boolean().optional().default(false),
  noSupervisor: z.boolean().optional().default(false),
  workers: z.union([z.number(), z.string()]).optional(),
  testList: z.string().optional(),
  passthrough: z.array(z.string()).optional(),
  timeoutMs: z
    .number()
    .int()
    .positive()
    .max(60 * 60_000)
    .optional(),
  full: z.boolean().optional().default(false),
});

export type AkE2eInput = z.infer<typeof inputSchema>;

interface E2eCommandShape {
  command: string;
  args: string[];
  env?: Record<string, string>;
}

const outputSchema = createSummaryOutputSchema({
  counts: z.object({
    suiteCount: z.number(),
    commandCount: z.number(),
  }),
  details: z.object({
    commands: z.array(
      z.object({
        command: z.string(),
        args: z.array(z.string()),
        env: z.record(z.string(), z.string()).optional(),
      }),
    ),
    suiteIds: z.array(z.string()),
    runnerSummary: z.record(z.string(), z.number()),
  }),
});

function summarizeRunners(groups: readonly PlannedE2eRunGroup[]): Record<string, number> {
  const counts = new Map<string, number>();

  for (const group of groups) {
    for (const run of group.runs) {
      counts.set(run.runner, (counts.get(run.runner) ?? 0) + 1);
    }
  }

  return Object.fromEntries([...counts.entries()].toSorted(([a], [b]) => a.localeCompare(b)));
}

function collectSuiteIds(groups: readonly PlannedE2eRunGroup[]): string[] {
  return [...new Set(groups.flatMap((group) => group.runs.map((run) => run.suiteId)))].toSorted();
}

function toSerializableCommands(commands: readonly CommandConfig[]): E2eCommandShape[] {
  return commands.map((command) => ({
    command: command.command,
    args: [...command.args],
    env: command.env,
  }));
}

function summarizeRun(
  passed: boolean,
  exitCode: number,
  suiteIds: readonly string[],
  commandCount: number,
): string {
  const suiteLabel = `${suiteIds.length} suite${suiteIds.length === 1 ? "" : "s"}`;
  const commandLabel = `${commandCount} command${commandCount === 1 ? "" : "s"}`;
  if (passed) {
    return `e2e passed: ${suiteLabel}, ${commandLabel}`;
  }
  return `e2e failed: ${suiteLabel}, ${commandLabel} (exit ${exitCode})`;
}

const tool: ToolDescriptor = {
  name: "wp_e2e",
  description:
    "Run E2E execution through the portable webpresso planner. Suite-aware and host-adapter-aware; returns `{passed, exitCode, commands, output}` plus suite and runner summaries.",
  inputSchema,
  outputSchema,
  annotations: {
    title: "E2E",
    readOnlyHint: false,
    idempotentHint: false,
    destructiveHint: false,
    openWorldHint: false,
  },
  handler: async (raw, extra) => {
    const input = inputSchema.parse(raw ?? {});
    const cwd = resolveProjectRoot(input.cwd ? { cwd: input.cwd } : {});
    const groups = await createE2eExecutionPlan(
      {
        suite: input.suite,
        runner: input.runner,
        config: input.config,
        files: input.files,
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
    const commands = plannedGroupsToCommandConfigs(groups);
    const result = await runCommandConfigs(commands, {
      cwd,
      signal: extra?.signal,
      timeoutMs: input.timeoutMs,
    });
    const suiteIds = collectSuiteIds(groups);

    const payload = {
      passed: result.passed,
      summary: summarizeRun(result.passed, result.exitCode, suiteIds, commands.length),
      exitCode: result.exitCode,
      counts: {
        suiteCount: suiteIds.length,
        commandCount: commands.length,
      },
      details: {
        commands: toSerializableCommands(commands),
        suiteIds,
        runnerSummary: summarizeRunners(groups),
      },
      ...formatMcpToolOutput(result.output, { toolName: "wp_e2e", full: input.full, cwd }),
    };

    return createSummaryResult(payload);
  },
};

export default tool;
