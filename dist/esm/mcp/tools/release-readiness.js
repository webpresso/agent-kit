import { z } from 'zod';
import { createSummaryOutputSchema, createSummaryResult } from './_shared/result.js';
import { commandCounts, readonlyOpsBaseSchema, resolveReadonlyCwd, runReadonlyCommand, summarizeCommands, } from './_readonly-ops.js';
const inputSchema = readonlyOpsBaseSchema
    .extend({
    includePublicReadiness: z.boolean().optional().default(false),
    includeChangesetStatus: z.boolean().optional().default(true),
    includeReferenceParity: z.boolean().optional().default(true),
})
    .strict();
const outputSchema = createSummaryOutputSchema({
    details: z.object({
        cwd: z.string(),
        commands: z.array(z.record(z.string(), z.unknown())),
    }),
});
function commandsFor(input) {
    const commands = [{ id: 'package_surface', command: './bin/wp', args: ['audit', 'package-surface'] }];
    if (input.includeReferenceParity) {
        commands.push({
            id: 'reference_parity',
            command: './bin/wp',
            args: ['audit', 'reference-parity-matrix', '--strict'],
        });
    }
    if (input.includeChangesetStatus) {
        commands.push({ id: 'changeset_status', command: 'vp', args: ['run', 'changeset:status'] });
    }
    return commands;
}
const tool = {
    name: 'wp_release_readiness',
    description: 'Aggregate read-only release readiness checks without publishing, tagging, versioning, merging, or mutating release state.',
    inputSchema,
    outputSchema,
    annotations: {
        title: 'WP release readiness',
        readOnlyHint: true,
        destructiveHint: false,
        idempotentHint: true,
        openWorldHint: false,
    },
    handler: async (raw, extra) => {
        const input = inputSchema.parse(raw ?? {});
        const cwd = resolveReadonlyCwd(input);
        if (input.includePublicReadiness) {
            return createSummaryResult({
                passed: false,
                summary: 'release readiness refused public:readiness because it is not guaranteed read-only',
                counts: { commandCount: 0, passedCount: 0, failedCount: 0 },
                details: { cwd, commands: [] },
                warnings: ['public_readiness_not_read_only'],
            }, { isError: true });
        }
        const commands = [];
        for (const command of commandsFor(input)) {
            commands.push(await runReadonlyCommand(command.id, command.command, command.args, {
                cwd,
                timeoutMs: input.timeoutMs,
                maxOutputBytes: input.maxOutputBytes,
                signal: extra?.signal,
            }));
        }
        const passed = commands.every((command) => command.passed);
        const warnings = [
            ...commands.flatMap((command) => command.warnings ?? []),
            ...(input.includePublicReadiness ? ['public_readiness_not_read_only'] : []),
        ];
        return createSummaryResult({
            passed,
            summary: summarizeCommands('release readiness', commands),
            counts: commandCounts(commands),
            details: { cwd, commands },
            warnings,
        });
    },
};
export default tool;
//# sourceMappingURL=release-readiness.js.map