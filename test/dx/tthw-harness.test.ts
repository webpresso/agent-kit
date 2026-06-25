import { mkdtempSync, mkdirSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

import { afterEach, describe, expect, it } from "vitest";

import { runPreviewCommand } from "../../src/cli/commands/preview.js";
import { runSecretsCommand } from "../../src/cli/commands/secrets.js";

const tempRoots: string[] = [];

function makeFixtureRepo(): string {
  const root = mkdtempSync(join(tmpdir(), "wp-dx-fixture-"));
  tempRoots.push(root);
  mkdirSync(join(root, ".webpresso"), { recursive: true });
  writeFileSync(
    join(root, ".webpresso", "secrets.config.json"),
    JSON.stringify({
      schemaVersion: 1,
      providers: {
        default: {
          type: "doppler",
          workspace: "ozby",
          workspaceId: "7abb07fb8507f57c2011",
          project: "fake-provider-app",
        },
      },
      profiles: {
        preview: { provider: "default", environment: "stg" },
        production: { provider: "default", environment: "prd" },
      },
      sinks: {
        "dev-server": { defaultProfile: "preview", allowedOps: ["run"] },
        test: { defaultProfile: "preview", allowedOps: ["run"] },
        e2e: { defaultProfile: "preview", allowedOps: ["run"] },
        "deploy-wrangler": { defaultProfile: "production", allowedOps: ["preview", "deploy"] },
        pulumi: { defaultProfile: "preview", allowedOps: ["preview", "up"] },
        act: { defaultProfile: "preview", allowedOps: ["replay", "run"] },
        "github-actions-bootstrap": {
          defaultProfile: "production",
          allowedOps: ["verify", "apply", "rotate", "revoke"],
        },
        "db-branch": { defaultProfile: "preview", allowedOps: ["create", "connect", "cleanup"] },
      },
    }),
  );
  return root;
}

afterEach(() => {
  for (const root of tempRoots.splice(0)) {
    rmSync(root, { recursive: true, force: true });
  }
});

describe("TTHW harness", () => {
  it("returns a helpful doctor payload for a fake provider app", async () => {
    const root = makeFixtureRepo();
    const chunks: string[] = [];
    const exitCode = await runSecretsCommand(
      "doctor",
      undefined,
      { cwd: root, profile: "preview", sink: "dev-server", json: true },
      { stdout: { write: (value: string) => (chunks.push(value), true) }, readConfig: undefined },
    );

    expect(exitCode).toBe(0);
    expect(JSON.parse(chunks.join(""))).toMatchObject({
      ok: true,
      code: "WP_SECRETS_DOCTOR_OK",
      doctor: {
        code: "WP_SECRETS_PROVIDER_READY",
      },
    });
  });

  it("returns a preview plan without mutating external state", async () => {
    const root = makeFixtureRepo();
    const chunks: string[] = [];
    const exitCode = await runPreviewCommand(
      { cwd: root, lane: "preview_main" },
      {
        stdout: { write: (value: string) => (chunks.push(value), true) },
        createPlan: async () => ({ steps: [], lane: "preview_main", mode: "deploy" }) as any,
      },
    );

    expect(exitCode).toBe(0);
    expect(JSON.parse(chunks.join(""))).toMatchObject({
      code: "WP_PREVIEW_PLAN_READY",
      sinkPlan: { provider: "doppler", environment: "stg" },
    });
  });
});
