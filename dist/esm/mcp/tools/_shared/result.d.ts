import { z } from 'zod';
export declare const summaryFirstResultSchema: z.ZodObject<{
    passed: z.ZodBoolean;
    summary: z.ZodString;
    exitCode: z.ZodOptional<z.ZodNumber>;
    backend: z.ZodOptional<z.ZodString>;
    counts: z.ZodOptional<z.ZodRecord<z.ZodString, z.ZodNumber>>;
    details: z.ZodOptional<z.ZodRecord<z.ZodString, z.ZodUnknown>>;
    rawOutput: z.ZodOptional<z.ZodString>;
    truncated: z.ZodOptional<z.ZodBoolean>;
    timedOut: z.ZodOptional<z.ZodBoolean>;
    aborted: z.ZodOptional<z.ZodBoolean>;
    logPath: z.ZodOptional<z.ZodString>;
}, z.core.$strip>;
type SummaryShapeOptions = {
    backend?: z.ZodTypeAny;
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