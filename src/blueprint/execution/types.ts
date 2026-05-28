import { z } from 'zod'

import { evidenceListSchema, type Evidence } from '#evidence.js'
import { executionBackendSchema, type BlueprintExecutionBackend } from '#types/execution-backend.js'

const LEGACY_BLUEPRINT_ROOT_SEGMENT = 'webpresso/blueprints/'
const GENERIC_BLUEPRINT_ROOT_SEGMENT = 'blueprints/'
const DEFAULT_RUNTIME_STATE_ROOT = '.omx/state'

function isBlueprintPath(path: string): boolean {
  return (
    path.includes(LEGACY_BLUEPRINT_ROOT_SEGMENT) ||
    path.startsWith(LEGACY_BLUEPRINT_ROOT_SEGMENT) ||
    path.includes(`/${GENERIC_BLUEPRINT_ROOT_SEGMENT}`) ||
    path.startsWith(GENERIC_BLUEPRINT_ROOT_SEGMENT)
  )
}

function isOmxStatePath(path: string): boolean {
  return path === DEFAULT_RUNTIME_STATE_ROOT || path.startsWith(`${DEFAULT_RUNTIME_STATE_ROOT}/`)
}

export { executionBackendSchema, type BlueprintExecutionBackend } from '#types/execution-backend.js'

export const blueprintExecutionModeSchema = z.enum(['durable', 'interactive'])
export type BlueprintExecutionMode = z.infer<typeof blueprintExecutionModeSchema>

export const blueprintTaskBackendHintsSchema = z.object({
  buildHeavy: z.boolean().optional(),
  longRunning: z.boolean().optional(),
  testHeavy: z.boolean().optional(),
})
export type BlueprintTaskBackendHints = z.infer<typeof blueprintTaskBackendHintsSchema>

export const blueprintTaskLaunchSpecSchema = z.object({
  id: z.string().min(1),
  title: z.string().min(1),
  dependsOn: z.array(z.string()).default([]),
  files: z.array(z.string()).default([]),
  verificationCommands: z.array(z.string()).default([]),
  concurrencyGroup: z.string().optional(),
  backendHints: blueprintTaskBackendHintsSchema.default({}),
})
export type BlueprintTaskLaunchSpec = z.infer<typeof blueprintTaskLaunchSpecSchema>

export const blueprintExecutionPolicySchema = z.object({
  maxParallelism: z.number().int().positive().optional(),
  preferWorktree: z.boolean().default(false),
  requireVerificationForCompletion: z.boolean().default(true),
  runtimeStateRoot: z
    .string()
    .default(DEFAULT_RUNTIME_STATE_ROOT)
    .refine(isOmxStatePath, 'runtimeStateRoot must stay under .omx/state'),
})
export type BlueprintExecutionPolicy = z.infer<typeof blueprintExecutionPolicySchema>

export const blueprintLaunchSpecSchema = z.object({
  backend: executionBackendSchema,
  blueprintPath: z
    .string()
    .min(1)
    .refine(isBlueprintPath, 'blueprintPath must point at blueprints/ or webpresso/blueprints'),
  blueprintSlug: z.string().min(1),
  mode: blueprintExecutionModeSchema,
  policy: blueprintExecutionPolicySchema,
  tasks: z.array(blueprintTaskLaunchSpecSchema),
})
export type BlueprintLaunchSpec = z.infer<typeof blueprintLaunchSpecSchema>
export const blueprintExecutionSpecSchema = blueprintLaunchSpecSchema
export type BlueprintExecutionSpec = BlueprintLaunchSpec

export const blueprintDerivedHandoffCodexGoalSchema = z.object({
  objective_hash: z.string().min(1).optional(),
  status_at_handoff: z.string().min(1).optional(),
  thread_id: z.string().min(1).optional(),
})
export type BlueprintDerivedHandoffCodexGoal = z.infer<
  typeof blueprintDerivedHandoffCodexGoalSchema
>

export const blueprintDerivedHandoffOmxContextSchema = z.object({
  execution_id: z.string().min(1).optional(),
  goal_id: z.string().min(1).optional(),
  ledger_path: z.string().min(1).optional(),
  mode: z.string().min(1).optional(),
  plan_path: z.string().min(1).optional(),
  session_id: z.string().min(1).optional(),
  state_paths: z.array(z.string().min(1)).optional(),
})
export type BlueprintDerivedHandoffOmxContext = z.infer<
  typeof blueprintDerivedHandoffOmxContextSchema
>

export const blueprintDerivedHandoffSchema = z.object({
  blueprint_path: z
    .string()
    .min(1)
    .refine(isBlueprintPath, 'blueprint_path must point at blueprints/ or webpresso/blueprints'),
  blueprint_slug: z.string().min(1),
  codex_goal: blueprintDerivedHandoffCodexGoalSchema.optional(),
  content_hash: z.string().min(1),
  derived: z.literal(true),
  generated_at: z.string().min(1).optional(),
  generated_by: z.string().min(1).optional(),
  head_at_ingest: z.string().min(1).nullable(),
  ['non-authoritative']: z.literal(true),
  omx_context: blueprintDerivedHandoffOmxContextSchema.optional(),
})
export type BlueprintDerivedHandoff = z.infer<typeof blueprintDerivedHandoffSchema>

export const runtimeStateStatusSchema = z.enum([
  'pending',
  'running',
  'blocked',
  'completed',
  'failed',
  'stopped',
])
export type RuntimeStateStatus = z.infer<typeof runtimeStateStatusSchema>

export const runtimeStateSnapshotSchema = z.object({
  backend: executionBackendSchema,
  evidence: evidenceListSchema.optional(),
  executionId: z.string().min(1),
  status: runtimeStateStatusSchema,
  taskId: z.string().optional(),
  updatedAt: z.string().min(1),
})
export type RuntimeStateSnapshot = z.infer<typeof runtimeStateSnapshotSchema>
export type RuntimeStateSnapshotEvidence = Evidence

export interface BlueprintExecutionAdapter {
  readonly backend: BlueprintExecutionBackend
  buildLaunchCommand(spec: BlueprintLaunchSpec): {
    args: string[]
    command: string
  }
}

export const DEFAULT_BLUEPRINT_RUNTIME_STATE_ROOT = DEFAULT_RUNTIME_STATE_ROOT
