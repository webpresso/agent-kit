import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, describe, expect, test } from "vitest";

import { auditConsumerAgentKitDependency } from "./consumer-agent-kit-dependency.js";

const tempDirs: string[] = [];

function tempRepo(packageJson?: Record<string, unknown>): string {
  const root = mkdtempSync(join(tmpdir(), "wp-consumer-agent-kit-dep-"));
  tempDirs.push(root);
  if (packageJson) {
    writeFileSync(join(root, "package.json"), `${JSON.stringify(packageJson, null, 2)}\n`);
  }
  return root;
}

describe("auditConsumerAgentKitDependency", () => {
  afterEach(() => {
    for (const dir of tempDirs.splice(0)) rmSync(dir, { recursive: true, force: true });
  });

  test("skips when package.json is absent", () => {
    const root = tempRepo();

    expect(auditConsumerAgentKitDependency(root)).toEqual({
      ok: true,
      title: "consumer-agent-kit-dependency",
      checked: 0,
      violations: [],
    });
  });

  test("passes for the agent-kit source repo itself", () => {
    const root = tempRepo({
      name: "@webpresso/agent-kit",
      devDependencies: { "@webpresso/agent-kit": "^1.2.3" },
    });

    expect(auditConsumerAgentKitDependency(root)).toEqual({
      ok: true,
      title: "consumer-agent-kit-dependency",
      checked: 4,
      violations: [],
    });
  });

  test("fails when a consumer keeps @webpresso/agent-kit in devDependencies", () => {
    const root = tempRepo({
      name: "@acme/demo",
      devDependencies: { "@webpresso/agent-kit": "^1.2.3" },
    });

    const result = auditConsumerAgentKitDependency(root);

    expect(result.ok).toBe(false);
    expect(result.violations).toEqual([
      expect.objectContaining({
        file: "package.json",
        message: expect.stringContaining(
          "must not depend on @webpresso/agent-kit in devDependencies",
        ),
      }),
    ]);
  });

  test("fails when a consumer keeps @webpresso/agent-kit in dependencies", () => {
    const root = tempRepo({
      name: "@acme/demo",
      dependencies: { "@webpresso/agent-kit": "^1.2.3" },
    });

    const result = auditConsumerAgentKitDependency(root);

    expect(result.ok).toBe(false);
    expect(result.violations).toEqual([
      expect.objectContaining({
        file: "package.json",
        message: expect.stringContaining("must not depend on @webpresso/agent-kit in dependencies"),
      }),
    ]);
  });

  test("passes when a consumer keeps only agent-config locally", () => {
    const root = tempRepo({
      name: "@acme/demo",
      devDependencies: { "@webpresso/agent-config": "^0.1.0" },
    });

    expect(auditConsumerAgentKitDependency(root)).toEqual({
      ok: true,
      title: "consumer-agent-kit-dependency",
      checked: 4,
      violations: [],
    });
  });

  test("fails when a consumer keeps @webpresso/agent-kit in pnpm-workspace catalog", () => {
    const root = tempRepo({ name: "@acme/demo" });
    writeFileSync(
      join(root, "pnpm-workspace.yaml"),
      `catalog:\n  "@webpresso/agent-kit": ^2.0.2\n`,
    );

    const result = auditConsumerAgentKitDependency(root);

    expect(result.ok).toBe(false);
    expect(result.violations).toEqual([
      expect.objectContaining({
        file: "pnpm-workspace.yaml",
        message: expect.stringContaining(
          "must not pin @webpresso/agent-kit in pnpm-workspace catalog",
        ),
      }),
    ]);
  });

  test("fails when a consumer keeps @webpresso/agent-kit in pnpm-workspace allowBuilds", () => {
    const root = tempRepo({ name: "@acme/demo" });
    writeFileSync(
      join(root, "pnpm-workspace.yaml"),
      `allowBuilds:\n  "@webpresso/agent-kit": true\n`,
    );

    const result = auditConsumerAgentKitDependency(root);

    expect(result.ok).toBe(false);
    expect(result.violations).toEqual([
      expect.objectContaining({
        file: "pnpm-workspace.yaml",
        message: expect.stringContaining("must not keep @webpresso/agent-kit in allowBuilds"),
      }),
    ]);
  });

  test("fails when a consumer keeps the retired local setup-webpresso action", () => {
    const root = tempRepo({ name: "@acme/demo" });
    mkdirSync(join(root, ".github", "actions", "setup-webpresso"), { recursive: true });
    writeFileSync(join(root, ".github", "actions", "setup-webpresso", "action.yml"), "name: setup");

    const result = auditConsumerAgentKitDependency(root);

    expect(result.ok).toBe(false);
    expect(result.violations).toEqual([
      expect.objectContaining({
        file: ".github/actions/setup-webpresso/action.yml",
        message: expect.stringContaining("must not keep the local setup-webpresso GitHub action"),
      }),
    ]);
  });

  test("fails when a consumer keeps the retired resolve-webpresso-cli-versions helper", () => {
    const root = tempRepo({ name: "@acme/demo" });
    mkdirSync(join(root, "scripts"), { recursive: true });
    writeFileSync(
      join(root, "scripts", "resolve-webpresso-cli-versions.js"),
      'throw new Error("no")',
    );

    const result = auditConsumerAgentKitDependency(root);

    expect(result.ok).toBe(false);
    expect(result.violations).toEqual([
      expect.objectContaining({
        file: "scripts/resolve-webpresso-cli-versions.js",
        message: expect.stringContaining("local setup-webpresso ownership is retired"),
      }),
    ]);
  });

  test("fails when a consumer keeps the retired local setup-monorepo action", () => {
    const root = tempRepo({ name: "@acme/demo" });
    mkdirSync(join(root, ".github", "actions", "setup-monorepo"), { recursive: true });
    writeFileSync(join(root, ".github", "actions", "setup-monorepo", "action.yml"), "name: setup");

    const result = auditConsumerAgentKitDependency(root);

    expect(result.ok).toBe(false);
    expect(result.violations).toEqual([
      expect.objectContaining({
        file: ".github/actions/setup-monorepo/action.yml",
        message: expect.stringContaining("must not keep the local setup-monorepo GitHub action"),
      }),
    ]);
  });

  test("fails when a consumer reusable-workflow caller still passes skip_when_ci_secret_missing", () => {
    const root = tempRepo({ name: "@acme/demo" });
    mkdirSync(join(root, ".github", "workflows"), { recursive: true });
    writeFileSync(
      join(root, ".github", "workflows", "deploy.yml"),
      [
        "jobs:",
        "  deploy:",
        "    uses: webpresso/github-actions/.github/workflows/cloudflare-preview.yml@deadbeef",
        "    with:",
        "      skip_when_ci_secret_missing: true",
      ].join("\n"),
    );

    const result = auditConsumerAgentKitDependency(root);

    expect(result.ok).toBe(false);
    expect(result.violations).toEqual([
      expect.objectContaining({
        file: ".github/workflows/deploy.yml",
        message: expect.stringContaining("must not pass skip_when_ci_secret_missing"),
      }),
    ]);
  });

  test("fails when a consumer workflow still depends on long-lived Doppler token secrets", () => {
    const root = tempRepo({ name: "@acme/demo" });
    mkdirSync(join(root, ".github", "workflows"), { recursive: true });
    writeFileSync(
      join(root, ".github", "workflows", "preview.yml"),
      [
        "jobs:",
        "  deploy:",
        "    steps:",
        "      - run: echo preview",
        "        env:",
        "          DOPPLER_PREVIEW_TOKEN: ${{ secrets.DOPPLER_PREVIEW_TOKEN }}",
      ].join("\n"),
    );

    const result = auditConsumerAgentKitDependency(root);

    expect(result.ok).toBe(false);
    expect(result.violations).toEqual([
      expect.objectContaining({
        file: ".github/workflows/preview.yml",
        message: expect.stringContaining("must not depend on long-lived Doppler token secrets"),
      }),
    ]);
  });
});
