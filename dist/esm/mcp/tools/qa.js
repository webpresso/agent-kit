/**
 * `wp_qa` MCP tool.
 *
 * Composite tool that fans out to the three sibling check tools in parallel
 * via `Promise.all` and returns an aggregated structured payload:
 *
 *   {
 *     passed: lint.passed && typecheck.passed && test.passed,
 *     lint: <wp_lint payload>,
 *     typecheck: <wp_typecheck payload>,
 *     test: <wp_test payload>,
 *   }
 *
 * Implementation calls the sibling tools' `handler` exports through their
 * default descriptors — no public re-exports needed. Parallelism is the whole
 * point: a sequential composite would be strictly worse than the user simply
 * running each tool back-to-back, since the sub-tools each spawn long-lived
 * external processes (`oxlint`, `tsc`, the test runner). Running them
 * concurrently is the only thing this composite buys you.
 */
import { z } from 'zod';
import { createSummaryOutputSchema, createSummaryResult, failureSchema } from './_shared/result.js';
import { detectUiChanges } from './_shared/ui-detection.js';
import lintTool from './lint.js';
import testTool from './test.js';
import typecheckTool from './typecheck.js';
const inputSchema = z.object({
    // Forwarded to all three sub-tools so cross-repo invocation works (e.g.
    // run webpresso's QA from a session launched in monorepo).
    cwd: z.string().optional(),
    // Forwarded to `wp_lint.files` and `wp_test.files` so a scoped QA on
    // changed files is possible. `wp_typecheck` ignores files (it operates on
    // tsconfig projects).
    files: z.array(z.string()).optional(),
    // Forwarded to `wp_typecheck.packages` and `wp_test.packages` to scope
    // the run to specific workspace packages.
    packages: z.array(z.string()).optional(),
});
const qaLeafSchema = z
    .object({
    passed: z.boolean(),
    summary: z.string(),
    exitCode: z.number().optional(),
    failures: z.array(failureSchema),
    tier: z.union([z.literal(1), z.literal(2), z.literal(3)]).optional(),
    bytes: z.number().optional(),
    tokensSaved: z.number().optional(),
    timedOut: z.boolean().optional(),
    aborted: z.boolean().optional(),
    unwrapError: z.string().optional(),
})
    .strict();
const outputSchema = createSummaryOutputSchema({
    details: z.object({
        lint: qaLeafSchema,
        typecheck: qaLeafSchema,
        test: qaLeafSchema,
    }),
});
const QA_FAILURE_LIMIT = 10;
/**
 * Sub-tool handlers return MCP `{content: [{type: 'text', text: <json>}]}`.
 * To aggregate into a single structured payload we re-parse the JSON.
 *
 * On any unwrap failure (non-text block, non-object payload, JSON parse error)
 * the step is marked `passed: false` AND annotated with a concrete
 * `unwrapError` string so the caller can distinguish "lint genuinely failed
 * with empty issues" from "we couldn't read lint's response" — the previous
 * silent collapse hid composition bugs as fake lint failures.
 */
function unwrap(result) {
    const structured = result
        .structuredContent;
    if (structured && typeof structured === 'object') {
        return structured;
    }
    const block = result.content[0];
    if (!block || block.type !== 'text' || typeof block.text !== 'string') {
        return {
            passed: false,
            unwrapError: 'sub-tool did not return a text content block',
            raw: result,
        };
    }
    let parsed;
    try {
        parsed = JSON.parse(block.text);
    }
    catch (error) {
        const reason = error instanceof Error ? error.message : String(error);
        return { passed: false, unwrapError: `JSON.parse failed: ${reason}`, raw: block.text };
    }
    if (!parsed || typeof parsed !== 'object') {
        return { passed: false, unwrapError: 'sub-tool payload was not an object', raw: block.text };
    }
    return parsed;
}
function normalizeFailureEntry(entry, fallbackMessage) {
    if (typeof entry === 'string')
        return { message: entry };
    if (entry && typeof entry === 'object') {
        const record = entry;
        const message = typeof record.message === 'string'
            ? record.message
            : typeof record.summary === 'string'
                ? record.summary
                : fallbackMessage;
        const normalized = { message };
        if (typeof record.file === 'string')
            normalized.file = record.file;
        if (typeof record.line === 'number')
            normalized.line = record.line;
        if (typeof record.code === 'string')
            normalized.code = record.code;
        return normalized;
    }
    return { message: fallbackMessage };
}
function toCompactLeaf(result) {
    const details = result.details;
    const failures = Array.isArray(result.failures)
        ? result.failures
        : details && typeof details === 'object'
            ? Array.isArray(details.failures)
                ? (details.failures ?? [])
                : Array.isArray(details.issues)
                    ? (details.issues ?? [])
                    : Array.isArray(details.errors)
                        ? (details.errors ?? [])
                        : []
            : [];
    const fallbackMessage = typeof result.summary === 'string' ? result.summary : 'failed';
    const normalizedFailures = failures.length > 0
        ? failures
            .slice(0, QA_FAILURE_LIMIT)
            .map((failure) => normalizeFailureEntry(failure, fallbackMessage))
        : result.passed === false
            ? [normalizeFailureEntry(undefined, fallbackMessage)]
            : [];
    return {
        passed: result.passed === true,
        summary: typeof result.summary === 'string' ? result.summary : '',
        ...(typeof result.exitCode === 'number' ? { exitCode: result.exitCode } : {}),
        failures: normalizedFailures,
        ...(typeof result.tier === 'number' ? { tier: result.tier } : {}),
        ...(typeof result.bytes === 'number' ? { bytes: result.bytes } : {}),
        ...(typeof result.tokensSaved === 'number' ? { tokensSaved: result.tokensSaved } : {}),
        ...(typeof result.timedOut === 'boolean' ? { timedOut: result.timedOut } : {}),
        ...(typeof result.aborted === 'boolean' ? { aborted: result.aborted } : {}),
        ...(typeof result.unwrapError === 'string' ? { unwrapError: result.unwrapError } : {}),
    };
}
const UI_QA_HINT = 'Static QA passed. For visual/UX QA, run /qa (gstack).';
function summarizeQa(lint, typecheck, test, hasUiChanges = false) {
    const failed = [];
    if (lint.passed !== true)
        failed.push('lint');
    if (typecheck.passed !== true)
        failed.push('typecheck');
    if (test.passed !== true)
        failed.push('test');
    if (failed.length > 0)
        return `qa failed: ${failed.join(', ')}`;
    return hasUiChanges ? `qa passed. ${UI_QA_HINT}` : 'qa passed';
}
const tool = {
    name: 'wp_qa',
    description: 'Run `wp_lint`, `wp_typecheck`, and `wp_test` in parallel via `Promise.all`. Returns `{passed, lint, typecheck, test}` where the top-level `passed` is the AND of the three sub-results.',
    inputSchema,
    outputSchema,
    annotations: {
        title: 'QA (lint + typecheck + test)',
        readOnlyHint: true,
        destructiveHint: false,
        idempotentHint: true,
        openWorldHint: false,
    },
    handler: async (raw, extra) => {
        const input = inputSchema.parse(raw ?? {});
        const [lintResult, typecheckResult, testResult] = await Promise.all([
            lintTool.handler({ cwd: input.cwd, files: input.files }, extra),
            typecheckTool.handler({ cwd: input.cwd, packages: input.packages }, extra),
            testTool.handler({ cwd: input.cwd, files: input.files, packages: input.packages }, extra),
        ]);
        const lint = toCompactLeaf(unwrap(lintResult));
        const typecheck = toCompactLeaf(unwrap(typecheckResult));
        const test = toCompactLeaf(unwrap(testResult));
        const passed = lint.passed === true && typecheck.passed === true && test.passed === true;
        // `isError: true` only fires when we couldn't even READ a sub-tool's
        // result (composition bug). A sub-tool legitimately reporting
        // `passed: false` is normal output the agent can act on.
        const composeError = typeof lint.unwrapError === 'string' ||
            typeof typecheck.unwrapError === 'string' ||
            typeof test.unwrapError === 'string';
        const hasUiChanges = passed && input.cwd ? detectUiChanges(input.cwd) : false;
        const payload = {
            passed,
            summary: summarizeQa(lint, typecheck, test, hasUiChanges),
            details: { lint, typecheck, test },
        };
        return createSummaryResult(payload, composeError ? { isError: true } : {});
    },
};
export default tool;
//# sourceMappingURL=qa.js.map