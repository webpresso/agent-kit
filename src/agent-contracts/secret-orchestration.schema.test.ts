import { describe, expect, it } from "vitest";

import {
  secretBootstrapOutputSchema,
  secretDoctorOutputSchema,
  secretMigrationOutputSchema,
  secretPreviewOutputSchema,
} from "./secret-orchestration.schema.js";

describe("secret orchestration schemas", () => {
  it("accepts doctor output", () => {
    expect(
      secretDoctorOutputSchema.parse({
        ok: true,
        code: "WP_SECRETS_DOCTOR_OK",
        profile: "preview",
        sink: "dev-server",
        plan: {
          sink: "dev-server",
          op: "run",
          profile: "preview",
          provider: "doppler",
          environment: "stg",
          runtimeProfile: "service-runtime",
          docsPath: "docs/secrets/providers.md",
          requiresBootstrap: false,
        },
        doctor: {
          ok: true,
          code: "WP_SECRETS_PROVIDER_READY",
          problem: 'doppler profile "preview" is configured.',
        },
      }),
    ).toBeTruthy();
  });

  it("accepts preview output", () => {
    expect(
      secretPreviewOutputSchema.parse({
        ok: true,
        code: "WP_PREVIEW_PLAN_READY",
        sinkPlan: { provider: "doppler", environment: "stg" },
        deployPlan: { steps: [] },
      }),
    ).toBeTruthy();
  });

  it("accepts bootstrap output", () => {
    expect(
      secretBootstrapOutputSchema.parse({
        ok: true,
        code: "WP_GITHUB_BOOTSTRAP_PLANNED",
        plan: {
          mode: "service-token",
          lanes: ["preview_main"],
          requiredSecrets: ["CI_SECRET_PROVIDER_TOKEN_PREVIEW"],
        },
        applied: false,
      }),
    ).toBeTruthy();
  });

  it("accepts migration output", () => {
    expect(
      secretMigrationOutputSchema.parse({
        ok: true,
        code: "WP_MIGRATE_SECRETS_PATCH_PLAN",
        patches: [{ file: "package.json", action: "replace", reason: "Use wp ci act" }],
      }),
    ).toBeTruthy();
  });
});
