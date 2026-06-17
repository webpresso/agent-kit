import { z } from 'zod';
import { SessionMemorySessionStore } from '#session-memory/session.js';
import { SessionMemoryStore } from '#session-memory/store.js';
import { createSummaryOutputSchema, createSummaryResult } from './_shared/result.js';
import { defaultIndexDbPath, defaultSessionDbPath } from './session-restore.js';
const inputSchema = z
    .object({
    cwd: z.string().optional(),
    sessionDbPath: z.string().optional(),
    indexDbPath: z.string().optional(),
})
    .strict();
const outputSchema = createSummaryOutputSchema({
    counts: z.object({
        eventCount: z.number(),
        repoCount: z.number(),
        sessionCount: z.number(),
        snapshotCount: z.number(),
        chunkCount: z.number(),
        sourceCount: z.number(),
        warningCount: z.number(),
    }),
    details: z.object({
        warnings: z.array(z.string()),
    }),
}).extend({
    warnings: z.array(z.string()),
});
function boundedWarning(scope, error) {
    const name = error instanceof Error ? error.name : 'Error';
    return `${scope} diagnostic failed: ${name}`;
}
const tool = {
    name: 'wp_session_doctor',
    description: 'Report bounded local diagnostics for session-memory continuity and index stores.',
    inputSchema,
    outputSchema,
    annotations: {
        title: 'Session doctor',
        readOnlyHint: true,
        destructiveHint: false,
        idempotentHint: true,
        openWorldHint: false,
    },
    handler: async (raw) => {
        const input = inputSchema.parse(raw ?? {});
        const warnings = [];
        let eventCount = 0;
        let repoCount = 0;
        let sessionCount = 0;
        let snapshotCount = 0;
        let chunkCount = 0;
        let sourceCount = 0;
        try {
            const sessionStore = new SessionMemorySessionStore(input.sessionDbPath ?? defaultSessionDbPath(input.cwd));
            try {
                const result = sessionStore.doctor();
                eventCount = result.eventCount;
                repoCount = result.repoCount;
                sessionCount = result.sessionCount;
                snapshotCount = result.snapshotCount;
                warnings.push(...result.warnings);
            }
            finally {
                sessionStore.close();
            }
        }
        catch (error) {
            warnings.push(boundedWarning('session store', error));
        }
        try {
            const indexStore = new SessionMemoryStore(input.indexDbPath ?? defaultIndexDbPath(input.cwd));
            try {
                const result = indexStore.doctor();
                chunkCount = result.chunkCount;
                sourceCount = result.sourceCount;
                warnings.push(...result.warnings);
            }
            finally {
                indexStore.close();
            }
        }
        catch (error) {
            warnings.push(boundedWarning('index store', error));
        }
        const passed = warnings.length === 0;
        const payload = {
            passed,
            summary: passed
                ? 'session doctor found healthy stores'
                : 'session doctor found store warnings',
            warnings,
            counts: {
                eventCount,
                repoCount,
                sessionCount,
                snapshotCount,
                chunkCount,
                sourceCount,
                warningCount: warnings.length,
            },
            details: { warnings },
        };
        return createSummaryResult(payload, passed ? {} : { isError: true });
    },
};
export default tool;
//# sourceMappingURL=session-doctor.js.map