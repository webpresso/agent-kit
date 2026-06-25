import type { Blueprint } from "#core/parser";
import type { Evidence } from "#evidence.js";
import type { BlueprintExecutionMetadata } from "#execution/metadata";
import type { BlueprintLifecycleIntent } from "#lifecycle/engine";

import { z } from "zod";

import { parseBlueprint } from "#core/parser";
import { evidenceListSchema } from "#evidence.js";
import { applyBlueprintLifecycle } from "#lifecycle/engine";
import { assertAllTasksHaveCanonicalPassingEvidence } from "#verification.js";

import { writeBlueprintExecutionMetadata } from "./metadata.js";
import {
  executionBackendSchema,
  type BlueprintExecutionBackend,
  type BlueprintLaunchSpec,
  DEFAULT_BLUEPRINT_RUNTIME_STATE_ROOT,
  runtimeStateSnapshotSchema,
  type RuntimeStateSnapshot,
  runtimeStateStatusSchema,
  type RuntimeStateStatus,
} from "./types.js";

export const omxTeamTaskStatusSchema = z.enum([
  "pending",
  "blocked",
  "in_progress",
  "completed",
  "failed",
]);
export type OmxTeamTaskStatus = z.infer<typeof omxTeamTaskStatusSchema>;

export const omxTeamTaskSnapshotSchema = z.object({
  description: z.string().optional(),
  error: z.string().optional(),
  evidence: evidenceListSchema.optional(),
  result: z.string().optional(),
  runtimeTaskId: z.string().min(1),
  status: omxTeamTaskStatusSchema,
  subject: z.string().min(1),
});
export type OmxTeamTaskSnapshot = z.infer<typeof omxTeamTaskSnapshotSchema>;

export const blueprintProgressBridgeTaskBindingSchema = z.object({
  blueprintTaskId: z.string().min(1),
  runtimeTaskId: z.string().min(1),
  title: z.string().min(1),
});
export type BlueprintProgressBridgeTaskBinding = z.infer<
  typeof blueprintProgressBridgeTaskBindingSchema
>;

export const blueprintProgressBridgeStateSchema = z.object({
  backend: executionBackendSchema,
  blueprintPath: z.string().min(1),
  blueprintSlug: z.string().min(1),
  executionId: z.string().min(1),
  tasks: z.array(blueprintProgressBridgeTaskBindingSchema),
  updatedAt: z.string().min(1),
});
export type BlueprintProgressBridgeState = z.infer<typeof blueprintProgressBridgeStateSchema>;

export interface BlueprintProgressBridgeProjection {
  intents: BlueprintLifecycleIntent[];
  status: RuntimeStateStatus;
}

export interface RuntimeProgressBridgeResult {
  appliedTransitions: string[];
  blueprint: Blueprint;
  execution: BlueprintExecutionMetadata;
  markdown: string;
}

function extractBlueprintTaskId(snapshot: OmxTeamTaskSnapshot): string | null {
  const candidate = [snapshot.subject, snapshot.description].filter(Boolean).join("\n");
  const match = candidate.match(/\bTask\s+(\d+(?:\.\d+)+)\s*:/i);
  return match?.[1] ?? null;
}

function buildFailureReason(snapshot: OmxTeamTaskSnapshot): string {
  return (
    snapshot.error?.trim() ||
    snapshot.result?.trim() ||
    snapshot.description?.trim() ||
    `OMX runtime task ${snapshot.runtimeTaskId} reported ${snapshot.status}.`
  );
}

function summarizeRuntimeStatus(tasks: OmxTeamTaskSnapshot[]): RuntimeStateStatus {
  if (!tasks.length) {
    return runtimeStateStatusSchema.parse("pending");
  }

  const statuses = tasks.map((task) => task.status);
  if (statuses.includes("failed")) {
    return "failed";
  }
  if (statuses.includes("blocked")) {
    return "blocked";
  }
  if (statuses.every((status) => status === "completed")) {
    return "completed";
  }
  if (statuses.some((status) => status === "in_progress" || status === "completed")) {
    return "running";
  }
  return "pending";
}

function applyProjectedIntent(
  taskStatuses: Map<string, Blueprint["tasks"][number]["status"]>,
  intent: BlueprintLifecycleIntent,
): void {
  if (intent.type === "finalize") {
    return;
  }

  if (!("taskId" in intent)) {
    return;
  }

  const nextStatus =
    intent.type === "task_start"
      ? "in-progress"
      : intent.type === "task_verify"
        ? "done"
        : intent.type === "task_block"
          ? "blocked"
          : "todo";

  taskStatuses.set(intent.taskId, nextStatus);
}

export function buildBlueprintProgressBridgeState(
  spec: BlueprintLaunchSpec,
  executionId: string,
  runtimeTasks: OmxTeamTaskSnapshot[],
  updatedAt: string,
): BlueprintProgressBridgeState {
  const bindings = spec.tasks.map((task) => {
    const runtimeTask = runtimeTasks.find(
      (candidate) => extractBlueprintTaskId(candidate) === task.id,
    );
    if (!runtimeTask) {
      throw new Error(
        `Could not map runtime task for blueprint task ${task.id}. Ensure OMX team launch uses Task <id>: prefixes.`,
      );
    }

    return {
      blueprintTaskId: task.id,
      runtimeTaskId: runtimeTask.runtimeTaskId,
      title: task.title,
    };
  });

  const duplicates = bindings
    .map((binding) => binding.runtimeTaskId)
    .filter((runtimeTaskId, index, values) => values.indexOf(runtimeTaskId) !== index);
  if (duplicates.length > 0) {
    throw new Error(`Duplicate runtime task bindings detected: ${duplicates.join(", ")}`);
  }

  return blueprintProgressBridgeStateSchema.parse({
    backend: spec.backend,
    blueprintPath: spec.blueprintPath,
    blueprintSlug: spec.blueprintSlug,
    executionId,
    tasks: bindings,
    updatedAt,
  });
}

export function projectBlueprintLifecycleFromRuntime(
  blueprint: Blueprint,
  bridge: BlueprintProgressBridgeState,
  runtimeTasks: OmxTeamTaskSnapshot[],
): BlueprintProgressBridgeProjection {
  const runtimeTasksById = new Map(runtimeTasks.map((task) => [task.runtimeTaskId, task]));
  const projectedStatuses = new Map(blueprint.tasks.map((task) => [task.id, task.status]));
  const intents: BlueprintLifecycleIntent[] = [];

  for (const binding of bridge.tasks) {
    const runtimeTask = runtimeTasksById.get(binding.runtimeTaskId);
    const blueprintTask = blueprint.tasks.find((task) => task.id === binding.blueprintTaskId);
    if (!runtimeTask || !blueprintTask) {
      continue;
    }

    const currentStatus = projectedStatuses.get(binding.blueprintTaskId) ?? blueprintTask.status;

    const intent =
      runtimeTask.status === "in_progress"
        ? currentStatus === "todo" || currentStatus === "blocked"
          ? ({
              type: "task_start",
              taskId: binding.blueprintTaskId,
            } satisfies BlueprintLifecycleIntent)
          : null
        : runtimeTask.status === "completed"
          ? currentStatus !== "done"
            ? (taskVerifyIntent(binding.blueprintTaskId, runtimeTask.evidence) ??
              ({
                type: "task_block",
                taskId: binding.blueprintTaskId,
                reason: buildMissingEvidenceReason(binding.blueprintTaskId),
              } satisfies BlueprintLifecycleIntent))
            : null
          : runtimeTask.status === "blocked" || runtimeTask.status === "failed"
            ? currentStatus !== "done"
              ? ({
                  type: "task_block",
                  taskId: binding.blueprintTaskId,
                  reason: buildFailureReason(runtimeTask),
                } satisfies BlueprintLifecycleIntent)
              : null
            : null;

    if (!intent) {
      continue;
    }

    intents.push(intent);
    applyProjectedIntent(projectedStatuses, intent);
  }

  const status = summarizeRuntimeStatus(runtimeTasks);
  const allProjectedDone =
    bridge.tasks.length > 0 &&
    bridge.tasks.every((binding) => projectedStatuses.get(binding.blueprintTaskId) === "done");
  const allProjectedDoneHavePassingEvidence =
    allProjectedDone &&
    bridge.tasks.every((binding) => {
      if (projectedStatuses.get(binding.blueprintTaskId) !== "done") {
        return true;
      }
      const runtimeTask = runtimeTasksById.get(binding.runtimeTaskId);
      return runtimeTask?.status === "completed" && hasPassingEvidence(runtimeTask.evidence);
    });

  if (
    status === "completed" &&
    allProjectedDone &&
    allProjectedDoneHavePassingEvidence &&
    blueprint.status !== "completed"
  ) {
    intents.push({ type: "finalize" });
  }

  return { intents, status };
}

export function normalizeOmxTeamTaskSnapshot(input: Record<string, unknown>): OmxTeamTaskSnapshot {
  return omxTeamTaskSnapshotSchema.parse({
    description: typeof input.description === "string" ? input.description : undefined,
    error: typeof input.error === "string" ? input.error : undefined,
    evidence: Array.isArray(input.evidence) ? input.evidence : undefined,
    result: typeof input.result === "string" ? input.result : undefined,
    runtimeTaskId: typeof input.id === "string" ? input.id : String(input.id ?? ""),
    status: input.status,
    subject: typeof input.subject === "string" ? input.subject : "",
  });
}

export function sanitizeBlueprintExecutionId(executionId: string): string {
  return executionId.trim().replace(/[^a-zA-Z0-9_-]+/g, "-");
}

export function resolveBlueprintProgressBridgePath(
  runtimeStateRoot: string,
  backend: BlueprintExecutionBackend,
  executionId: string,
): string {
  return [
    runtimeStateRoot.replace(/\/+$/u, ""),
    "blueprint-execution",
    backend,
    `${sanitizeBlueprintExecutionId(executionId)}.json`,
  ]
    .filter(Boolean)
    .join("/");
}

function shouldStartBlueprint(blueprint: Blueprint, snapshot: RuntimeStateSnapshot): boolean {
  return (
    (snapshot.status === "running" ||
      snapshot.status === "blocked" ||
      snapshot.status === "failed" ||
      snapshot.status === "completed") &&
    (blueprint.status === "draft" ||
      blueprint.status === "planned" ||
      blueprint.status === "parked")
  );
}

function buildBlockedReason(snapshot: RuntimeStateSnapshot): string {
  const statusPrefix = snapshot.status === "failed" ? "Runtime failed" : "Runtime blocked";
  const taskSuffix = snapshot.taskId ? ` for task ${snapshot.taskId}` : "";
  return `${statusPrefix} in ${snapshot.backend} execution ${snapshot.executionId}${taskSuffix}.`;
}

function buildMissingEvidenceReason(taskId: string): string {
  return `Runtime reported task ${taskId} completed without task-local verification evidence.`;
}

function hasPassingEvidence(evidence: readonly Evidence[] | undefined): evidence is Evidence[] {
  return Array.isArray(evidence) && evidence.some((item) => item.result === "pass");
}

function taskVerifyIntent(
  taskId: string,
  evidence: readonly Evidence[] | undefined,
): Extract<BlueprintLifecycleIntent, { type: "task_verify" }> | null {
  if (!hasPassingEvidence(evidence)) return null;
  return { type: "task_verify", taskId, evidence };
}

function shouldFinalizeBlueprint(
  markdown: string,
  blueprint: Blueprint,
  snapshot: RuntimeStateSnapshot,
): boolean {
  if (
    snapshot.status !== "completed" ||
    blueprint.status === "completed" ||
    blueprint.status === "archived" ||
    blueprint.tasks.length === 0 ||
    !blueprint.tasks.every((task) => task.status === "done" || task.status === "dropped")
  ) {
    return false;
  }

  try {
    assertAllTasksHaveCanonicalPassingEvidence(
      markdown,
      blueprint.tasks.filter((task) => task.status === "done").map((task) => task.id),
    );
    return true;
  } catch {
    return false;
  }
}

function applyIntent(
  markdown: string,
  slug: string,
  appliedTransitions: string[],
  intent:
    | { type: "start" }
    | { type: "finalize" }
    | { type: "task_start"; taskId: string }
    | { type: "task_block"; taskId: string; reason: string }
    | { type: "task_verify"; taskId: string; evidence: readonly Evidence[] },
): string {
  const result = applyBlueprintLifecycle(markdown, slug, intent);
  appliedTransitions.push(intent.type);
  return result.markdown;
}

export function runtimeSnapshotPathForExecution(
  executionId: string,
  runtimeStateRoot = DEFAULT_BLUEPRINT_RUNTIME_STATE_ROOT,
): string {
  return `${runtimeStateRoot}/blueprint-executions/${encodeURIComponent(executionId)}.json`;
}

export function applyRuntimeProgressSnapshot(
  markdown: string,
  slug: string,
  input: RuntimeStateSnapshot,
): RuntimeProgressBridgeResult {
  const snapshot = runtimeStateSnapshotSchema.parse(input);
  const execution = {
    backend: snapshot.backend,
    executionId: snapshot.executionId,
    status: snapshot.status,
    updatedAt: snapshot.updatedAt,
  } satisfies BlueprintExecutionMetadata;

  const appliedTransitions: string[] = [];
  let nextMarkdown = writeBlueprintExecutionMetadata(markdown, execution);
  let nextBlueprint = parseBlueprint(nextMarkdown, slug);

  if (shouldStartBlueprint(nextBlueprint, snapshot)) {
    nextMarkdown = applyIntent(nextMarkdown, slug, appliedTransitions, { type: "start" });
    nextBlueprint = parseBlueprint(nextMarkdown, slug);
  }

  if (snapshot.taskId) {
    const task = nextBlueprint.tasks.find((entry) => entry.id === snapshot.taskId);
    if (!task) {
      throw new Error(`Task ${snapshot.taskId} not found in blueprint ${slug}`);
    }

    if (snapshot.status === "running" && task.status === "todo") {
      nextMarkdown = applyIntent(nextMarkdown, slug, appliedTransitions, {
        type: "task_start",
        taskId: snapshot.taskId,
      });
      nextBlueprint = parseBlueprint(nextMarkdown, slug);
    }

    if (
      (snapshot.status === "blocked" || snapshot.status === "failed") &&
      task.status !== "done" &&
      task.status !== "dropped" &&
      task.status !== "blocked"
    ) {
      nextMarkdown = applyIntent(nextMarkdown, slug, appliedTransitions, {
        type: "task_block",
        taskId: snapshot.taskId,
        reason: buildBlockedReason(snapshot),
      });
      nextBlueprint = parseBlueprint(nextMarkdown, slug);
    }

    if (snapshot.status === "completed" && task.status !== "done" && task.status !== "dropped") {
      const verifyIntent = taskVerifyIntent(snapshot.taskId, snapshot.evidence);
      nextMarkdown = applyIntent(
        nextMarkdown,
        slug,
        appliedTransitions,
        verifyIntent ?? {
          type: "task_block",
          taskId: snapshot.taskId,
          reason: buildMissingEvidenceReason(snapshot.taskId),
        },
      );
      nextBlueprint = parseBlueprint(nextMarkdown, slug);
    }
  }

  if (shouldFinalizeBlueprint(nextMarkdown, nextBlueprint, snapshot)) {
    nextMarkdown = applyIntent(nextMarkdown, slug, appliedTransitions, { type: "finalize" });
    nextBlueprint = parseBlueprint(nextMarkdown, slug);
  }

  return {
    appliedTransitions,
    blueprint: nextBlueprint,
    execution,
    markdown: nextMarkdown,
  };
}
