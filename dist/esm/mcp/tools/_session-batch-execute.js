import { z } from "zod";
import { resolveProjectRoot } from "./_shared/project-root.js";
import { createSummaryOutputSchema, createSummaryResult } from "./_shared/result.js";
import { createGainSummaryResult } from "./_session-gain.js";
import { runSessionCommand, searchSessionCommandOutput } from "./_session-command.js";
import { defaultIndexDbPath } from "./session-restore.js";
import { sessionElisionSchema } from "#mcp/_session-elision.js";
const MAX_CONCURRENCY = 8;
const DEFAULT_TIMEOUT_MS = 30_000;
export function totalOutputBytes(results) {
    return results.reduce((sum, result) => sum + (Number.isFinite(result.outputBytes) ? Math.trunc(result.outputBytes ?? 0) : 0), 0);
}
async function mapWithConcurrency(items, concurrency, worker) {
    const results = Array.from({ length: items.length }, () => undefined);
    let next = 0;
    async function runOne() {
        while (true) {
            const index = next;
            next += 1;
            if (index >= items.length)
                return;
            results[index] = await worker(items[index], index);
        }
    }
    await Promise.all(Array.from({ length: Math.max(1, Math.min(concurrency, items.length)) }, () => runOne()));
    return results;
}
const inputSchema = z
    .object({
    commands: z.array(z.object({ label: z.string().min(1), command: z.string().min(1) })).min(1),
    queries: z.array(z.string()).optional(),
    concurrency: z.number().int().min(1).max(MAX_CONCURRENCY).optional().default(1),
    execute: z.boolean().optional().default(false),
    timeoutMs: z.number().int().min(1).max(300_000).optional().default(DEFAULT_TIMEOUT_MS),
    cwd: z.string().optional(),
})
    .superRefine((value, ctx) => {
    const seen = new Set();
    for (const [index, command] of value.commands.entries()) {
        if (seen.has(command.label)) {
            ctx.addIssue({
                code: z.ZodIssueCode.custom,
                message: "commands labels must be unique within one batch",
                path: ["commands", index, "label"],
            });
        }
        seen.add(command.label);
    }
})
    .strict();
const outputSchema = createSummaryOutputSchema({
    details: z.object({
        results: z.array(z.object({
            label: z.string(),
            exitCode: z.number(),
            outputBytes: z.number(),
            indexed: z.boolean(),
            summary: z.string(),
            backend: z.enum(["native", "typescript"]),
            fallbackReason: z.string().optional(),
            truncated: z.boolean().optional(),
            capturedBytes: z.number().optional(),
            maxCaptureBytes: z.number().optional(),
            timedOut: z.boolean().optional(),
            signal: z.string().optional(),
            elisions: z.array(sessionElisionSchema).optional(),
            warnings: z.array(z.string()).optional(),
        })),
        queryHits: z
            .record(z.string(), z.array(z.object({
            content: z.string(),
            source: z.string(),
            rank: z.number(),
            tier: z.enum(["porter", "trigram", "levenshtein"]),
        })))
            .optional(),
    }),
});
const tool = {
    name: "wp_session_batch_execute",
    description: "Run multiple shell commands through session-memory execution, using the native backend when available and TypeScript fallback otherwise; optionally search indexed results. Use for planned multi-command evidence gathering (grep/find/git log batches); prefer over raw chained Bash; run `wp session batch-execute` directly only if this tool is unavailable.",
    inputSchema,
    outputSchema,
    annotations: {
        title: "Session Batch Execute",
        readOnlyHint: false,
        destructiveHint: false,
        openWorldHint: false,
    },
    handler: async (rawInput) => {
        const input = inputSchema.parse(rawInput);
        if (!input.execute) {
            return createSummaryResult({
                passed: false,
                summary: "wp_session_batch_execute requires execute=true before running shell commands",
                details: {
                    results: [],
                },
            }, { isError: true });
        }
        if (process.platform === "win32") {
            return createSummaryResult({
                passed: false,
                summary: "wp_session_batch_execute is not supported on win32 yet",
                details: {
                    results: [],
                },
            }, { isError: true });
        }
        try {
            const trustedRootAnchor = process.env["CLAUDE_PROJECT_DIR"] ?? process.cwd();
            const projectRoot = resolveProjectRoot({ cwd: trustedRootAnchor });
            const effectiveCwd = input.cwd ?? trustedRootAnchor;
            const dbPath = defaultIndexDbPath(effectiveCwd);
            const results = await mapWithConcurrency(input.commands, input.concurrency, async ({ label, command }) => runSessionCommand({
                command,
                label,
                timeoutMs: input.timeoutMs,
                cwd: effectiveCwd,
                projectRoot,
                dbPath,
            }));
            let queryHits;
            if (input.queries && input.queries.length > 0) {
                const indexedLabels = results
                    .filter((result) => result.indexed)
                    .map((result) => result.label);
                if (indexedLabels.length > 0) {
                    queryHits = Object.fromEntries(input.queries.map((query) => [
                        query,
                        searchSessionCommandOutput(dbPath, indexedLabels, query),
                    ]));
                }
            }
            const failedCount = results.filter((result) => result.exitCode !== 0).length;
            const elisions = results.flatMap((result) => [...(result.elisions ?? [])]);
            const warnings = results.flatMap((result) => [...(result.warnings ?? [])]);
            return createGainSummaryResult({
                passed: failedCount === 0,
                summary: failedCount === 0
                    ? `${results.length} command${results.length === 1 ? "" : "s"} completed`
                    : `${failedCount}/${results.length} command${failedCount === 1 ? "" : "s"} failed`,
                details: {
                    results,
                    ...(queryHits ? { queryHits } : {}),
                },
                ...(elisions.length > 0 ? { elisions } : {}),
                ...(warnings.length > 0 ? { warnings } : {}),
            }, failedCount === 0 ? {} : { isError: true }, {
                toolName: tool.name,
                dbPath,
                rawBasisBytes: totalOutputBytes(results),
                rawBytesBasis: "batch_command_output_total",
            });
        }
        catch (error) {
            const message = error instanceof Error ? error.message : String(error);
            return createSummaryResult({
                passed: false,
                summary: `wp_session_batch_execute failed: ${message}`,
                details: {
                    results: [],
                },
            }, { isError: true });
        }
    },
};
export default tool;
//# sourceMappingURL=_session-batch-execute.js.map