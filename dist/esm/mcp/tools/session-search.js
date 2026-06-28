import { createSummaryResult } from "./_shared/result.js";
import { buildRecallPayload, sessionRecallInputSchema, sessionRecallOutputSchema, } from "./session-restore.js";
const tool = {
    name: "wp_session_search",
    description: "Search indexed chunks and continuity events with unified provenance and bounded previews. Use for searching prior indexed evidence / recalling decisions; prefer over grep over transcripts; run `wp session search` directly only if this tool is unavailable.",
    inputSchema: sessionRecallInputSchema,
    outputSchema: sessionRecallOutputSchema,
    annotations: {
        title: "Session search",
        readOnlyHint: true,
        destructiveHint: false,
        idempotentHint: true,
        openWorldHint: false,
    },
    handler: async (raw) => {
        const input = sessionRecallInputSchema.parse(raw ?? {});
        const payload = buildRecallPayload(input, "search");
        return createSummaryResult(payload, payload.passed ? {} : { isError: true });
    },
};
export default tool;
//# sourceMappingURL=session-search.js.map