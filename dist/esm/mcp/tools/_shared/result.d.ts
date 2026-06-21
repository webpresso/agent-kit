import { z } from 'zod';
import { type SessionElision } from '#mcp/_session-elision-schema.js';
export declare const failureSchema: z.ZodObject<{
    file: z.ZodOptional<z.ZodString>;
    line: z.ZodOptional<z.ZodNumber>;
    code: z.ZodOptional<z.ZodString>;
    message: z.ZodString;
}, z.core.$strip>;
export declare const transformMetadataSchema: z.ZodObject<{
    toolName: z.ZodString;
    normalizedToolName: z.ZodString;
    tier: z.ZodEnum<{
        passthrough: "passthrough";
        registered: "registered";
    }>;
    rawBytes: z.ZodNumber;
}, z.core.$strip>;
export declare const gainTelemetrySchema: z.ZodObject<{
    rawBasisBytes: z.ZodNumber;
    returnedToolResultBytes: z.ZodNumber;
    gainBytes: z.ZodNumber;
    approxTokensSaved: z.ZodNumber;
    precision: z.ZodLiteral<"exact_utf8_bytes_approx_tokens">;
    rawBytesBasis: z.ZodEnum<{
        command_output_total: "command_output_total";
        batch_command_output_total: "batch_command_output_total";
        file_read_buffer: "file_read_buffer";
        file_metadata_buffer: "file_metadata_buffer";
        index_accepted_text: "index_accepted_text";
        fetch_indexed_text: "fetch_indexed_text";
    }>;
}, z.core.$strip>;
export declare const elisionSchema: z.ZodObject<{
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
export declare const summaryFirstResultSchema: z.ZodObject<{
    passed: z.ZodBoolean;
    summary: z.ZodString;
    exitCode: z.ZodOptional<z.ZodNumber>;
    counts: z.ZodOptional<z.ZodRecord<z.ZodString, z.ZodNumber>>;
    details: z.ZodOptional<z.ZodRecord<z.ZodString, z.ZodUnknown>>;
    rawOutput: z.ZodOptional<z.ZodString>;
    truncated: z.ZodOptional<z.ZodBoolean>;
    timedOut: z.ZodOptional<z.ZodBoolean>;
    aborted: z.ZodOptional<z.ZodBoolean>;
    logPath: z.ZodOptional<z.ZodString>;
    failures: z.ZodOptional<z.ZodArray<z.ZodObject<{
        file: z.ZodOptional<z.ZodString>;
        line: z.ZodOptional<z.ZodNumber>;
        code: z.ZodOptional<z.ZodString>;
        message: z.ZodString;
    }, z.core.$strip>>>;
    tier: z.ZodOptional<z.ZodUnion<readonly [z.ZodLiteral<1>, z.ZodLiteral<2>, z.ZodLiteral<3>]>>;
    bytes: z.ZodOptional<z.ZodNumber>;
    tokensSaved: z.ZodOptional<z.ZodNumber>;
    gain: z.ZodOptional<z.ZodObject<{
        rawBasisBytes: z.ZodNumber;
        returnedToolResultBytes: z.ZodNumber;
        gainBytes: z.ZodNumber;
        approxTokensSaved: z.ZodNumber;
        precision: z.ZodLiteral<"exact_utf8_bytes_approx_tokens">;
        rawBytesBasis: z.ZodEnum<{
            command_output_total: "command_output_total";
            batch_command_output_total: "batch_command_output_total";
            file_read_buffer: "file_read_buffer";
            file_metadata_buffer: "file_metadata_buffer";
            index_accepted_text: "index_accepted_text";
            fetch_indexed_text: "fetch_indexed_text";
        }>;
    }, z.core.$strip>>;
    elisions: z.ZodOptional<z.ZodArray<z.ZodObject<{
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
    }, z.core.$strip>>>;
    warnings: z.ZodOptional<z.ZodArray<z.ZodString>>;
    transform: z.ZodOptional<z.ZodObject<{
        toolName: z.ZodString;
        normalizedToolName: z.ZodString;
        tier: z.ZodEnum<{
            passthrough: "passthrough";
            registered: "registered";
        }>;
        rawBytes: z.ZodNumber;
    }, z.core.$strip>>;
}, z.core.$strip>;
type SummaryShapeOptions = {
    counts?: z.ZodTypeAny;
    details?: z.ZodTypeAny;
};
export declare function createSummaryOutputSchema(options?: SummaryShapeOptions): z.ZodObject<{
    [x: string]: z.ZodType<unknown, unknown, z.core.$ZodTypeInternals<unknown, unknown>>;
}, z.core.$strip>;
export interface SummaryFirstPayload {
    readonly passed: boolean;
    readonly summary: string;
    readonly [key: string]: unknown;
}
export declare function clipRawOutput(rawOutput: string | undefined, maxChars?: number, options?: {
    toolName?: string;
    persistOverflow?: boolean;
    elisionRecorder?: {
        record(input: {
            source: string;
            kind: 'truncated_output';
            text: string;
            returnedText?: string;
            metadata?: Record<string, unknown>;
        }): {
            elision?: SessionElision;
            warning?: string;
        };
    };
}): {
    rawOutput?: string;
    truncated?: true;
    logPath?: string;
    elisions?: SessionElision[];
    warnings?: string[];
};
export declare function createSummaryResult<TPayload extends SummaryFirstPayload>(payload: TPayload, options?: {
    isError?: boolean;
    text?: string;
}): {
    isError?: boolean | undefined;
    content: {
        type: "text";
        text: string;
    }[];
    structuredContent: TPayload;
};
export {};
//# sourceMappingURL=result.d.ts.map