import { z } from "zod";
import { createSummaryOutputSchema, createSummaryResult } from "./_shared/result.js";
import { readonlyOpsBaseSchema, resolveReadonlyCwd, runReadonlyCommand } from "./_readonly-ops.js";
const inputSchema = readonlyOpsBaseSchema
    .extend({
    suite: z.literal("session-memory").optional().default("session-memory"),
    mode: z.enum(["dry-run", "live"]).optional().default("dry-run"),
    scenario: z.string().optional(),
    variant: z.string().optional(),
    allVariants: z.boolean().optional(),
    trials: z.number().int().positive().optional(),
    model: z.string().optional(),
    outputRoot: z.string().optional(),
})
    .strict();
const outputSchema = createSummaryOutputSchema({
    details: z.object({
        cwd: z.string(),
        suite: z.literal("session-memory"),
        mode: z.enum(["dry-run", "live"]),
        command: z.record(z.string(), z.unknown()),
        result: z.record(z.string(), z.unknown()),
    }),
});
function buildArgs(input) {
    const args = ["bench", "session-memory"];
    if (input.mode === "dry-run")
        args.push("--dry-run");
    if (input.scenario)
        args.push("--scenario", input.scenario);
    if (input.variant)
        args.push("--variant", input.variant);
    if (input.allVariants)
        args.push("--all-variants");
    if (input.trials !== undefined)
        args.push("--trials", String(input.trials));
    if (input.model)
        args.push("--model", input.model);
    if (input.outputRoot)
        args.push("--output-root", input.outputRoot);
    return args;
}
const tool = {
    name: "wp_bench",
    description: "Run bounded Webpresso benchmark flows. Defaults session-memory benchmarks to --dry-run unless live mode is explicit. Use for session-memory benchmark evidence (defaults to dry-run); run `wp bench` directly only if this tool is unavailable.",
    inputSchema,
    outputSchema,
    annotations: {
        title: "WP bench",
        readOnlyHint: false,
        destructiveHint: false,
        idempotentHint: false,
        openWorldHint: false,
    },
    handler: async (raw, extra) => {
        const input = inputSchema.parse(raw ?? {});
        const cwd = resolveReadonlyCwd(input);
        const args = buildArgs(input);
        const result = await runReadonlyCommand("bench", "./bin/wp", args, {
            cwd,
            timeoutMs: input.timeoutMs,
            maxOutputBytes: input.maxOutputBytes,
            signal: extra?.signal,
            parseJson: true,
        });
        return createSummaryResult({
            passed: result.passed,
            summary: result.passed
                ? `bench ${input.suite} ${input.mode} passed`
                : `bench ${input.suite} ${input.mode} failed`,
            exitCode: result.exitCode,
            counts: {
                commandCount: 1,
                passedCount: result.passed ? 1 : 0,
                failedCount: result.passed ? 0 : 1,
            },
            details: {
                cwd,
                suite: input.suite,
                mode: input.mode,
                command: result.command,
                result,
            },
            rawOutput: result.rawOutput,
            truncated: result.truncated,
            timedOut: result.timedOut,
            aborted: result.aborted,
            warnings: result.warnings,
        });
    },
};
export default tool;
//# sourceMappingURL=bench.js.map