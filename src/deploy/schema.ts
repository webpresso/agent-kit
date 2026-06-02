import { z } from 'zod'

import type { DeployLane, DeployPlan } from './types.js'

export const DEPLOY_PLAN_SCHEMA_VERSION = 1

const deployLaneSchema = z.union([
  z.literal('dev'),
  z.literal('preview_main'),
  z.literal('prd'),
  z.string().regex(/^preview_pr_\d+$/u, 'preview PR lanes must be preview_pr_<n>'),
])

const envSchema = z.record(z.string(), z.string().optional())

const commandStepSchema = z
  .object({
    kind: z.literal('command'),
    id: z.string().min(1),
    label: z.string().min(1).optional(),
    command: z.string().min(1),
    args: z.array(z.string()).optional(),
    cwd: z.string().min(1).optional(),
    env: envSchema.optional(),
  })
  .strict()

const managedToolStepSchema = z
  .object({
    kind: z.literal('managed-tool'),
    id: z.string().min(1),
    label: z.string().min(1).optional(),
    tool: z.string().min(1),
    args: z.array(z.string()).optional(),
    cwd: z.string().min(1).optional(),
    env: envSchema.optional(),
  })
  .strict()

const deployPlanSchema = z
  .object({
    schemaVersion: z.literal(DEPLOY_PLAN_SCHEMA_VERSION),
    lane: deployLaneSchema,
    provider: z.string().min(1),
    requiredCredentials: z.array(z.string().min(1)),
    steps: z.array(z.union([commandStepSchema, managedToolStepSchema])),
  })
  .strict()

export function isDeployLane(value: string): value is DeployLane {
  return deployLaneSchema.safeParse(value).success
}

export function parseDeployLane(value: string): DeployLane {
  const result = deployLaneSchema.safeParse(value)
  if (!result.success) {
    throw new Error(
      `Invalid deploy lane "${value}". Use dev, preview_main, preview_pr_<n>, or prd.`,
    )
  }
  return result.data as DeployLane
}

export function validateDeployPlan(plan: unknown): DeployPlan {
  const result = deployPlanSchema.safeParse(plan)
  if (!result.success) {
    const issues = result.error.issues
      .map((issue) => `  - ${issue.path.join('.') || '<root>'}: ${issue.message}`)
      .join('\n')
    throw new Error(`Invalid deploy plan:\n${issues}`)
  }
  return result.data as DeployPlan
}
