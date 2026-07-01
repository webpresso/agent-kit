import { z } from "zod";
export declare const runnerEventSchema: z.ZodDiscriminatedUnion<[z.ZodObject<{
    type: z.ZodLiteral<"started">;
    ts: z.ZodString;
    handle: z.ZodString;
}, z.core.$strip>, z.ZodObject<{
    type: z.ZodLiteral<"progress">;
    ts: z.ZodString;
    handle: z.ZodString;
    message: z.ZodString;
}, z.core.$strip>, z.ZodObject<{
    type: z.ZodLiteral<"stdout">;
    ts: z.ZodString;
    handle: z.ZodString;
    line: z.ZodString;
}, z.core.$strip>, z.ZodObject<{
    type: z.ZodLiteral<"stderr">;
    ts: z.ZodString;
    handle: z.ZodString;
    line: z.ZodString;
}, z.core.$strip>, z.ZodObject<{
    type: z.ZodLiteral<"artifact">;
    ts: z.ZodString;
    handle: z.ZodString;
    path: z.ZodString;
    mime: z.ZodOptional<z.ZodString>;
}, z.core.$strip>, z.ZodObject<{
    type: z.ZodLiteral<"completed">;
    ts: z.ZodString;
    handle: z.ZodString;
    exitCode: z.ZodNumber;
}, z.core.$strip>, z.ZodObject<{
    type: z.ZodLiteral<"failed">;
    ts: z.ZodString;
    handle: z.ZodString;
    error: z.ZodString;
}, z.core.$strip>, z.ZodObject<{
    type: z.ZodLiteral<"cancelled">;
    ts: z.ZodString;
    handle: z.ZodString;
}, z.core.$strip>], "type">;
export type RunnerEvent = z.infer<typeof runnerEventSchema>;
export interface RunnerSnapshot {
    readonly handle: string;
    readonly status: "running" | "completed" | "failed" | "cancelled";
    readonly events: readonly RunnerEvent[];
}
export interface RunnerContext {
    readonly cwd: string;
    readonly env?: Readonly<Record<string, string>>;
}
export interface RunnerTask {
    readonly id: string;
    readonly description: string;
    readonly permissions: "read" | "workspace-write";
    readonly runners?: readonly string[];
}
export interface RunnerExecution {
    readonly handle: string;
    run(signal?: AbortSignal): AsyncIterable<RunnerEvent>;
    snapshot(): RunnerSnapshot;
    teardown(): Promise<void>;
}
export interface Runner {
    readonly id: string;
    readonly version: string;
    readonly capabilities: readonly string[];
    prepare(task: RunnerTask, ctx: RunnerContext): RunnerExecution;
}
//# sourceMappingURL=types.d.ts.map