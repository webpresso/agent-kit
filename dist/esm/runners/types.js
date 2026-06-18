import { z } from 'zod';
// ---------------------------------------------------------------------------
// RunnerEvent — Zod discriminated union (discriminant: 'type')
// ---------------------------------------------------------------------------
const startedEventSchema = z.object({
    type: z.literal('started'),
    ts: z.string(),
    handle: z.string(),
});
const progressEventSchema = z.object({
    type: z.literal('progress'),
    ts: z.string(),
    handle: z.string(),
    message: z.string(),
});
const stdoutEventSchema = z.object({
    type: z.literal('stdout'),
    ts: z.string(),
    handle: z.string(),
    line: z.string(),
});
const stderrEventSchema = z.object({
    type: z.literal('stderr'),
    ts: z.string(),
    handle: z.string(),
    line: z.string(),
});
const artifactEventSchema = z.object({
    type: z.literal('artifact'),
    ts: z.string(),
    handle: z.string(),
    path: z.string(),
    mime: z.string().optional(),
});
const completedEventSchema = z.object({
    type: z.literal('completed'),
    ts: z.string(),
    handle: z.string(),
    exitCode: z.number(),
});
const failedEventSchema = z.object({
    type: z.literal('failed'),
    ts: z.string(),
    handle: z.string(),
    error: z.string(),
});
const cancelledEventSchema = z.object({
    type: z.literal('cancelled'),
    ts: z.string(),
    handle: z.string(),
});
export const runnerEventSchema = z.discriminatedUnion('type', [
    startedEventSchema,
    progressEventSchema,
    stdoutEventSchema,
    stderrEventSchema,
    artifactEventSchema,
    completedEventSchema,
    failedEventSchema,
    cancelledEventSchema,
]);
//# sourceMappingURL=types.js.map