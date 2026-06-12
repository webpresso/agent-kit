import { z } from 'zod';
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
}): {
    rawOutput?: string;
    truncated?: true;
    logPath?: string;
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