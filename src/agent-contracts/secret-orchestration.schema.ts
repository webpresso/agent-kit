import { z } from "zod";

export const secretDoctorOutputSchema = z.object({
  ok: z.literal(true),
  code: z.literal("WP_SECRETS_DOCTOR_OK"),
  profile: z.string(),
  sink: z.string(),
  plan: z.object({
    sink: z.string(),
    op: z.string(),
    profile: z.string(),
    provider: z.string(),
    environment: z.string(),
    runtimeProfile: z.string(),
    docsPath: z.string(),
    requiresBootstrap: z.boolean(),
  }),
  doctor: z.object({
    ok: z.boolean(),
    code: z.string(),
    problem: z.string(),
    fix: z.string().optional(),
    evidence: z.string().optional(),
  }),
});

export const secretPreviewOutputSchema = z.object({
  ok: z.literal(true),
  code: z.literal("WP_PREVIEW_PLAN_READY"),
  sinkPlan: z.object({
    provider: z.string(),
    environment: z.string(),
  }),
  deployPlan: z.unknown(),
});

export const secretBootstrapOutputSchema = z.object({
  ok: z.literal(true),
  code: z.enum(["WP_GITHUB_BOOTSTRAP_PLANNED", "WP_GITHUB_BOOTSTRAP_APPLIED"]),
  plan: z.object({
    mode: z.string(),
    lanes: z.array(z.string()),
    requiredSecrets: z.array(z.string()),
  }),
  applied: z.boolean(),
});

export const secretCleanupOutputSchema = z.object({
  lane: z.string().optional(),
});

export const secretMigrationOutputSchema = z.object({
  ok: z.literal(true),
  code: z.literal("WP_MIGRATE_SECRETS_PATCH_PLAN"),
  patches: z.array(
    z.object({
      file: z.string(),
      action: z.enum(["delete", "replace", "remove-dependency"]),
      reason: z.string(),
    }),
  ),
});
