import { z } from "zod";
import { resolveSessionRepoHash } from "#session-memory/repo-hash";
import { SessionMemorySessionStore } from "#session-memory/session.js";
import { defaultSessionDbPath } from "./session-restore.js";
const inputSchema = z
    .object({
    sessionId: z.string().optional(),
    cwd: z.string().optional(),
    sessionDbPath: z.string().optional(),
    capMs: z.number().int().min(0).max(30_000).optional().default(5_000),
})
    .strict();
const outputSchema = z.object({
    snapshotId: z.string(),
    eventsIncluded: z.number(),
    partial: z.boolean(),
});
const tool = {
    name: "wp_session_snapshot",
    description: "Create a typed session-memory snapshot before risky operations or branch switches. Use for snapshotting before compaction, risky changes, or branch switches; run `wp session snapshot` directly only if this tool is unavailable.",
    inputSchema,
    outputSchema,
    annotations: {
        title: "Session Snapshot",
        readOnlyHint: false,
        destructiveHint: false,
        idempotentHint: false,
        openWorldHint: false,
    },
    async handler(rawInput) {
        const input = inputSchema.parse(rawInput);
        const cwd = input.cwd ?? process.env["CLAUDE_PROJECT_DIR"] ?? process.cwd();
        const store = new SessionMemorySessionStore(input.sessionDbPath ?? defaultSessionDbPath(cwd));
        try {
            const result = store.snapshot({
                repoHash: resolveSessionRepoHash(cwd),
                capMs: input.capMs,
                ...(input.sessionId === undefined ? {} : { sessionId: input.sessionId }),
            });
            const payload = {
                snapshotId: result.snapshotId,
                eventsIncluded: result.eventCount,
                partial: result.status === "partial",
            };
            return {
                content: [{ type: "text", text: JSON.stringify(payload) }],
                structuredContent: payload,
            };
        }
        finally {
            store.close();
        }
    },
};
export default tool;
//# sourceMappingURL=session-snapshot.js.map