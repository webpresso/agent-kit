/**
 * Zod schema for implementation plan frontmatter validation.
 *
 * Blueprint owns its own schema contract so the package can export
 * blueprint-specific parsing and validation without reaching into schema-defs.
 */

import { z } from 'zod'

/**
 * Valid plan status values.
 * Maps to plan lifecycle: draft/planned/parked → in-progress → completed/archived.
 */
export const planStatusSchema = z.enum([
  'draft',
  'planned',
  'parked',
  'in-progress',
  'completed',
  'archived',
])

/**
 * Canonical blueprint lifecycle statuses for executable blueprints.
 */
export const lifecycleBlueprintStatusSchema = z.enum([
  'draft',
  'planned',
  'parked',
  'in-progress',
  'completed',
  'archived',
])

/**
 * Canonical task statuses for blueprint lifecycle management.
 */
export const taskStatusSchema = z.enum(['todo', 'in_progress', 'blocked', 'done'])

/**
 * Valid complexity values using t-shirt sizing.
 */
export const complexitySchema = z.enum(['XS', 'S', 'M', 'L', 'XL'])

/**
 * Execution backend values for Blueprint-backed execution.
 */
export const executionBackendSchema = z.enum(['omx-team', 'omx-pll-interactive'])

/**
 * Execution status values persisted in Blueprint frontmatter.
 */
export const executionStatusSchema = z.enum([
  'pending',
  'running',
  'blocked',
  'completed',
  'failed',
  'stopped',
])

/**
 * Plan frontmatter schema.
 *
 * Required fields:
 * - type: `blueprint` or `parent-roadmap`
 * - status: Current plan status
 * - complexity: Estimated effort using t-shirt sizing
 *
 * Optional fields:
 * - last_updated: Date plan was last modified (YYYY-MM-DD)
 * - created: Date plan was created (YYYY-MM-DD)
 * - progress: Human-readable progress string
 * - max_parallel_agents: Maximum parallel agents for execution
 */
export const planFrontmatterSchema = z.object({
  type: z.enum(['blueprint', 'parent-roadmap']),
  title: z.string().optional(),
  description: z.string().optional(),
  status: planStatusSchema,
  complexity: complexitySchema,
  last_updated: z.union([z.string(), z.date()]).optional(),
  created: z.union([z.string(), z.date()]).optional(),
  progress: z.string().optional(),
  completed_at: z.union([z.string(), z.date()]).optional(),
  execution_backend: executionBackendSchema.optional(),
  execution_id: z.string().optional(),
  execution_status: executionStatusSchema.optional(),
  execution_updated_at: z.union([z.string(), z.date()]).optional(),
  execution_verifications: z.array(z.string()).optional(),
  execution_artifacts: z.array(z.string()).optional(),
  execution_log_path: z.string().optional(),
  max_parallel_agents: z.number().optional(),
  depends_on: z.array(z.string()).optional(),
  tags: z.array(z.string()).optional(),
})

export type PlanFrontmatter = z.infer<typeof planFrontmatterSchema>
export type BlueprintStatus = z.infer<typeof planStatusSchema>
export type LifecycleBlueprintStatus = z.infer<typeof lifecycleBlueprintStatusSchema>
export type PlanComplexity = z.infer<typeof complexitySchema>
export type BlueprintTaskStatus = z.infer<typeof taskStatusSchema>
export type BlueprintExecutionBackendValue = z.infer<typeof executionBackendSchema>
export type BlueprintExecutionStatusValue = z.infer<typeof executionStatusSchema>
