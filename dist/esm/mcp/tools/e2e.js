/**
 * `ak_e2e` MCP tool.
 *
 * First-class E2E execution surface backed by the existing portable `ak e2e`
 * planner and host-adapter architecture. This tool is suite-aware and should
 * be used for E2E execution instead of overloading `ak_test`.
 */
import { z } from 'zod';
import {} from '#e2e';
import { createE2eExecutionPlan, plannedGroupsToCommandConfigs, runCommandConfigs, } from '#e2e/execution';
import { applyOutputTransform } from '#output-transforms/index';
import { createSummaryOutputSchema, createSummaryResult } from './_shared/result.js';
const inputSchema = z.object({
    cwd: z.string().optional(),
    suite: z.string().optional(),
    runner: z.enum(['playwright', 'vitest', 'command']).optional(),
    config: z.string().optional(),
    files: z.array(z.string()).optional().default([]),
    headed: z.boolean().optional().default(false),
    debug: z.boolean().optional().default(false),
    reuseReset: z.boolean().optional().default(false),
    noSupervisor: z.boolean().optional().default(false),
    workers: z.union([z.number(), z.string()]).optional(),
    testList: z.string().optional(),
    passthrough: z.array(z.string()).optional(),
});
const outputSchema = createSummaryOutputSchema({
    counts: z.object({
        suiteCount: z.number(),
        commandCount: z.number(),
    }),
    details: z.object({
        commands: z.array(z.object({
            command: z.string(),
            args: z.array(z.string()),
            env: z.record(z.string(), z.string()).optional(),
        })),
        suiteIds: z.array(z.string()),
        runnerSummary: z.record(z.string(), z.number()),
    }),
});
function summarizeRunners(groups) {
    const counts = new Map();
    for (const group of groups) {
        for (const run of group.runs) {
            counts.set(run.runner, (counts.get(run.runner) ?? 0) + 1);
        }
    }
    return Object.fromEntries([...counts.entries()].toSorted(([a], [b]) => a.localeCompare(b)));
}
function collectSuiteIds(groups) {
    return [...new Set(groups.flatMap((group) => group.runs.map((run) => run.suiteId)))].toSorted();
}
function toSerializableCommands(commands) {
    return commands.map((command) => ({
        command: command.command,
        args: [...command.args],
        env: command.env,
    }));
}
function summarizeRun(passed, exitCode, suiteIds, commandCount) {
    const suiteLabel = `${suiteIds.length} suite${suiteIds.length === 1 ? '' : 's'}`;
    const commandLabel = `${commandCount} command${commandCount === 1 ? '' : 's'}`;
    if (passed) {
        return `e2e passed: ${suiteLabel}, ${commandLabel}`;
    }
    return `e2e failed: ${suiteLabel}, ${commandLabel} (exit ${exitCode})`;
}
const tool = {
    name: 'ak_e2e',
    description: 'Run E2E execution through the portable agent-kit planner. Suite-aware and host-adapter-aware; returns `{passed, exitCode, commands, output}` plus suite and runner summaries.',
    inputSchema,
    outputSchema,
    annotations: {
        title: 'E2E',
        destructiveHint: false,
        openWorldHint: false,
    },
    handler: async (raw, extra) => {
        const input = inputSchema.parse(raw ?? {});
        const groups = await createE2eExecutionPlan({
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
        }, input.cwd);
        const commands = plannedGroupsToCommandConfigs(groups);
        const result = await runCommandConfigs(commands, { signal: extra?.signal });
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
            ...applyOutputTransform(result.output, { toolName: 'ak_e2e' }),
        };
        return createSummaryResult(payload);
    },
};
export default tool;
//# sourceMappingURL=e2e.js.map