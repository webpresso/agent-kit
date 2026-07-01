import { z } from "zod";
export declare const WP_SESSION_RETRIEVE_TOOL_NAME = "wp_session_retrieve";
export declare const sessionElisionKindSchema: z.ZodEnum<{
    truncated_output: "truncated_output";
    file_overflow: "file_overflow";
    command_output: "command_output";
}>;
export declare const sessionElisionSchema: z.ZodObject<{
    id: z.ZodString;
    source: z.ZodString;
    kind: z.ZodEnum<{
        truncated_output: "truncated_output";
        file_overflow: "file_overflow";
        command_output: "command_output";
    }>;
    rawBytes: z.ZodNumber;
    returnedBytes: z.ZodNumber;
    retrieveTool: z.ZodLiteral<"wp_session_retrieve">;
}, z.core.$strip>;
export type SessionElisionKind = z.infer<typeof sessionElisionKindSchema>;
export type SessionElision = z.infer<typeof sessionElisionSchema>;
//# sourceMappingURL=_session-elision-schema.d.ts.map