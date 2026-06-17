import { z } from 'zod';
import { resolveSessionRepoHash } from '#session-memory/repo-hash';
import { SessionMemorySessionStore } from '#session-memory/session.js';
import { defaultSessionDbPath } from './session-restore.js';
const inputSchema = z
    .object({
    content: z.string().min(1),
    toolName: z.string().optional().default('manual'),
    sessionId: z.string().optional(),
    cwd: z.string().optional(),
    sessionDbPath: z.string().optional(),
})
    .strict();
const outputSchema = z.object({
    captured: z.boolean(),
    eventId: z.string().optional(),
    capturedEventCount: z.number(),
    toolName: z.string(),
    capturedLength: z.number(),
    truncated: z.boolean(),
});
function captureDisabled() {
    return process.env.WEBPRESSO_SESSION_MEMORY === '0';
}
const tool = {
    name: 'wp_session_capture',
    description: 'Manually capture typed continuity content into session memory so it survives compaction and becomes recallable via wp_session_restore.',
    inputSchema,
    outputSchema,
    annotations: {
        title: 'Session Capture',
        readOnlyHint: false,
        destructiveHint: false,
        idempotentHint: false,
        openWorldHint: false,
    },
    async handler(rawInput) {
        const input = inputSchema.parse(rawInput);
        const cwd = input.cwd ?? process.env['CLAUDE_PROJECT_DIR'] ?? process.cwd();
        const repoHash = resolveSessionRepoHash(cwd);
        const capturedContent = input.content.slice(0, 4096);
        if (captureDisabled()) {
            const payload = {
                captured: false,
                capturedEventCount: 0,
                toolName: input.toolName,
                capturedLength: capturedContent.length,
                truncated: capturedContent.length !== input.content.length,
            };
            return {
                content: [{ type: 'text', text: JSON.stringify(payload) }],
                structuredContent: payload,
            };
        }
        const store = new SessionMemorySessionStore(input.sessionDbPath ?? defaultSessionDbPath(cwd));
        try {
            const eventId = store.captureEvent({
                repoHash,
                ...(input.sessionId === undefined ? {} : { sessionId: input.sessionId }),
                event: {
                    eventType: 'assistant_turn_summary',
                    toolName: input.toolName,
                    content: capturedContent,
                    summary: 'Manual session capture',
                    priority: 80,
                    metadata: { source: 'wp_session_capture' },
                },
            });
            const payload = {
                captured: true,
                eventId,
                capturedEventCount: 1,
                toolName: input.toolName,
                capturedLength: capturedContent.length,
                truncated: capturedContent.length !== input.content.length,
            };
            return {
                content: [{ type: 'text', text: JSON.stringify(payload) }],
                structuredContent: payload,
            };
        }
        finally {
            store.close();
        }
    },
};
export default tool;
//# sourceMappingURL=session-capture.js.map