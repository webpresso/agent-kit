import { z } from "zod";

// ---------------------------------------------------------------------------
// RunnerEvent — Zod discriminated union (discriminant: 'type')
// ---------------------------------------------------------------------------

const startedEventSchema = z.object({
  type: z.literal("started"),
  ts: z.string(),
  handle: z.string(),
});

const progressEventSchema = z.object({
  type: z.literal("progress"),
  ts: z.string(),
  handle: z.string(),
  message: z.string(),
});

const stdoutEventSchema = z.object({
  type: z.literal("stdout"),
  ts: z.string(),
  handle: z.string(),
  line: z.string(),
});

const stderrEventSchema = z.object({
  type: z.literal("stderr"),
  ts: z.string(),
  handle: z.string(),
  line: z.string(),
});

const artifactEventSchema = z.object({
  type: z.literal("artifact"),
  ts: z.string(),
  handle: z.string(),
  path: z.string(),
  mime: z.string().optional(),
});

const completedEventSchema = z.object({
  type: z.literal("completed"),
  ts: z.string(),
  handle: z.string(),
  exitCode: z.number(),
});

const failedEventSchema = z.object({
  type: z.literal("failed"),
  ts: z.string(),
  handle: z.string(),
  error: z.string(),
});

const cancelledEventSchema = z.object({
  type: z.literal("cancelled"),
  ts: z.string(),
  handle: z.string(),
});

export const runnerEventSchema = z.discriminatedUnion("type", [
  startedEventSchema,
  progressEventSchema,
  stdoutEventSchema,
  stderrEventSchema,
  artifactEventSchema,
  completedEventSchema,
  failedEventSchema,
  cancelledEventSchema,
]);

export type RunnerEvent = z.infer<typeof runnerEventSchema>;

// ---------------------------------------------------------------------------
// RunnerSnapshot
// ---------------------------------------------------------------------------

export interface RunnerSnapshot {
  readonly handle: string;
  readonly status: "running" | "completed" | "failed" | "cancelled";
  readonly events: readonly RunnerEvent[];
}

// ---------------------------------------------------------------------------
// RunnerContext
// ---------------------------------------------------------------------------

export interface RunnerContext {
  readonly cwd: string;
  readonly env?: Readonly<Record<string, string>>;
}

// ---------------------------------------------------------------------------
// RunnerTask
// ---------------------------------------------------------------------------

export interface RunnerTask {
  readonly id: string;
  readonly description: string;
  readonly permissions: "read" | "workspace-write";
  readonly runners?: readonly string[];
}

// ---------------------------------------------------------------------------
// RunnerExecution — live execution handle
// ---------------------------------------------------------------------------

export interface RunnerExecution {
  readonly handle: string;
  run(signal?: AbortSignal): AsyncIterable<RunnerEvent>;
  snapshot(): RunnerSnapshot;
  teardown(): Promise<void>;
}

// ---------------------------------------------------------------------------
// Runner — factory
// ---------------------------------------------------------------------------

export interface Runner {
  readonly id: string;
  readonly version: string;
  readonly capabilities: readonly string[];
  prepare(task: RunnerTask, ctx: RunnerContext): RunnerExecution;
}
