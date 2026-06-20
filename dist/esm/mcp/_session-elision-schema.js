import { z } from 'zod';
export const WP_SESSION_RETRIEVE_TOOL_NAME = 'wp_session_retrieve';
export const sessionElisionKindSchema = z.enum([
    'truncated_output',
    'file_overflow',
    'command_output',
]);
export const sessionElisionSchema = z.object({
    id: z.string(),
    source: z.string(),
    kind: sessionElisionKindSchema,
    rawBytes: z.number(),
    returnedBytes: z.number(),
    retrieveTool: z.literal(WP_SESSION_RETRIEVE_TOOL_NAME),
});
//# sourceMappingURL=_session-elision-schema.js.map