import { z } from "zod";

import type { DeployLane, DeployPlan } from "./types.js";

export const DEPLOY_PLAN_SCHEMA_VERSION = 1;

const deployLaneSchema = z.union([
  z.literal("dev"),
  z.literal("preview_main"),
  z.literal("prd"),
  z.string().regex(/^preview_pr_\d+$/u, "preview PR lanes must be preview_pr_<n>"),
]);

const deployModeSchema = z.enum(["deploy", "destroy"]);
const deployStageSchema = z.enum([
  "preview_health",
  "health",
  "homepage",
  "production_smoke",
  "production_journey",
]);

const envSchema = z.record(z.string(), z.string().optional());

const stepBaseSchema = z
  .object({
    id: z.string().min(1),
    label: z.string().min(1).optional(),
    stage: deployStageSchema.optional(),
    runtimeProfile: z.string().min(1).optional(),
    cwd: z.string().min(1).optional(),
    env: envSchema.optional(),
  })
  .strict();

const commandStepSchema = stepBaseSchema
  .extend({
    kind: z.literal("command"),
    command: z.string().min(1),
    args: z.array(z.string()).optional(),
  })
  .strict();

const managedToolStepSchema = stepBaseSchema
  .extend({
    kind: z.literal("managed-tool"),
    tool: z.string().min(1),
    args: z.array(z.string()).optional(),
  })
  .strict();

const httpCheckStepSchema = stepBaseSchema
  .extend({
    kind: z.literal("http-check"),
    url: z.string().url(),
    headers: z.record(z.string(), z.string()).optional(),
    expectedStatus: z.number().int().min(100).max(599).optional(),
    retries: z.number().int().min(1).optional(),
    intervalMs: z.number().int().min(0).optional(),
    timeoutMs: z.number().int().min(1).optional(),
  })
  .strict();

const deployPlanSchema = z
  .object({
    schemaVersion: z.literal(DEPLOY_PLAN_SCHEMA_VERSION),
    lane: deployLaneSchema,
    mode: deployModeSchema.optional(),
    provider: z.string().min(1),
    requiredCredentials: z.array(z.string().min(1)),
    releaseVersion: z.string().min(1).optional(),
    steps: z.array(z.union([commandStepSchema, managedToolStepSchema, httpCheckStepSchema])),
  })
  .strict();

export function isDeployLane(value: string): value is DeployLane {
  return deployLaneSchema.safeParse(value).success;
}

export function parseDeployLane(value: string): DeployLane {
  const result = deployLaneSchema.safeParse(value);
  if (!result.success) {
    throw new Error(
      `Invalid deploy lane "${value}". Use dev, preview_main, preview_pr_<n>, or prd.`,
    );
  }
  return result.data as DeployLane;
}

export function validateDeployPlan(plan: unknown): DeployPlan {
  const result = deployPlanSchema.safeParse(plan);
  if (!result.success) {
    const issues = result.error.issues
      .map((issue) => `  - ${issue.path.join(".") || "<root>"}: ${issue.message}`)
      .join("\n");
    throw new Error(`Invalid deploy plan:\n${issues}`);
  }
  return result.data as DeployPlan;
}
