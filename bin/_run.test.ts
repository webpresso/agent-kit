import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

import { afterEach, describe, expect, it } from "vitest";

import { areRuntimeHooksEnabled, buildLaunchPlan } from "./_run.js";

function createSourceRepo(): string {
  const repoRoot = mkdtempSync(join(tmpdir(), "wp-run-source-"));
  mkdirSync(join(repoRoot, "src", "cli"), { recursive: true });
  writeFileSync(join(repoRoot, "src", "cli", "cli.ts"), "");
  writeFileSync(join(repoRoot, "package.json"), JSON.stringify({ name: "@webpresso/agent-kit" }));
  return repoRoot;
}

describe("buildLaunchPlan", () => {
  it("prefers wp source when any CLI runtime source file is newer than dist", () => {
    const plan = buildLaunchPlan({
      binName: "wp",
      repoRoot: "/repo",
      forwardedArgs: ["hooks", "status", "--vendor", "codex"],
      builtExists: true,
      sourceExists: true,
      sourceNeedsSourceLaunch: true,
      pinnedNodeVersion: null,
      runtimeManager: null,
    });

    expect(plan).toMatchObject({
      mode: "source",
      entrypoint: "/repo/src/cli/cli.ts",
      args: ["/repo/src/cli/cli.ts", "hooks", "status", "--vendor", "codex"],
    });
  });

  it("preserves source-checkout fallback for migrated runtime commands when runtime is unstaged", () => {
    const plan = buildLaunchPlan({
      binName: "wp",
      repoRoot: "/repo",
      forwardedArgs: ["hooks", "doctor", "--skip-mcp"],
      platform: "linux",
      arch: "x64",
      runtimeManifest: {
        binaryName: "wp",
        targets: [
          {
            id: "linux-x64",
            os: "linux",
            cpu: "x64",
            packageName: "@webpresso/agent-kit-runtime-linux-x64",
          },
        ],
      },
      runtimeBinaryExists: () => false,
      builtExists: true,
      sourceExists: true,
      sourceNeedsSourceLaunch: true,
      pinnedNodeVersion: null,
      runtimeManager: null,
    });

    expect(plan).toMatchObject({
      mode: "source",
      entrypoint: "/repo/src/cli/cli.ts",
      args: ["/repo/src/cli/cli.ts", "hooks", "doctor", "--skip-mcp"],
    });
  });

  it("prefers wp source when a CLI source file has no built counterpart", () => {
    const plan = buildLaunchPlan({
      binName: "wp",
      repoRoot: "/repo",
      forwardedArgs: ["qa", "--print-command"],
      builtExists: true,
      sourceExists: true,
      sourceNeedsSourceLaunch: true,
      pinnedNodeVersion: null,
      runtimeManager: null,
    });

    expect(plan).toMatchObject({
      mode: "source",
      entrypoint: "/repo/src/cli/cli.ts",
      args: ["/repo/src/cli/cli.ts", "qa", "--print-command"],
    });
  });

  it("keeps source-checkout phase-2 audit commands on the source lane by default", () => {
    const repoRoot = createSourceRepo();
    const plan = buildLaunchPlan({
      binName: "wp",
      repoRoot,
      forwardedArgs: ["audit", "guardrails"],
      platform: "linux",
      arch: "x64",
      runtimeManifest: {
        binaryName: "wp",
        targets: [
          {
            id: "linux-x64",
            os: "linux",
            cpu: "x64",
            packageName: "@webpresso/agent-kit-runtime-linux-x64",
          },
        ],
      },
      runtimeBinaryPath: "/runtime/wp",
      runtimeBinaryExists: () => true,
      builtExists: true,
      sourceExists: true,
      sourceNeedsSourceLaunch: false,
      pinnedNodeVersion: null,
      runtimeManager: null,
    });
    rmSync(repoRoot, { recursive: true, force: true });

    expect(plan).toMatchObject({
      mode: "source",
      entrypoint: join(repoRoot, "src", "cli", "cli.ts"),
      args: [join(repoRoot, "src", "cli", "cli.ts"), "audit", "guardrails"],
    });
  });

  it("uses source for source-repo hook dispatch when generated commands force source and runtime hooks are disabled", () => {
    const repoRoot = createSourceRepo();
    const plan = buildLaunchPlan({
      binName: "wp",
      repoRoot,
      forwardedArgs: ["hook", "pretool-guard"],
      platform: "linux",
      arch: "x64",
      runtimeManifest: {
        binaryName: "wp",
        targets: [
          {
            id: "linux-x64",
            os: "linux",
            cpu: "x64",
            packageName: "@webpresso/agent-kit-runtime-linux-x64",
          },
        ],
      },
      runtimeBinaryPath: "/runtime/wp",
      runtimeBinaryExists: () => true,
      builtExists: true,
      sourceExists: true,
      sourceNeedsSourceLaunch: false,
      sourceOverride: true,
      pinnedNodeVersion: null,
      runtimeManager: null,
    });
    rmSync(repoRoot, { recursive: true, force: true });

    expect(plan).toMatchObject({
      mode: "source",
      entrypoint: join(repoRoot, "src", "cli", "cli.ts"),
      args: [join(repoRoot, "src", "cli", "cli.ts"), "hook", "pretool-guard"],
    });
  });

  it("lets runtime-hooks enable override forced source hook dispatch in the source repo", () => {
    const repoRoot = createSourceRepo();
    mkdirSync(join(repoRoot, ".webpresso"), { recursive: true });
    writeFileSync(
      join(repoRoot, ".webpresso", "runtime-hooks.json"),
      JSON.stringify({ runtimeHooksEnabled: true }),
    );

    const plan = buildLaunchPlan({
      binName: "wp",
      repoRoot,
      forwardedArgs: ["hook", "pretool-guard"],
      platform: "linux",
      arch: "x64",
      runtimeManifest: {
        binaryName: "wp",
        targets: [
          {
            id: "linux-x64",
            os: "linux",
            cpu: "x64",
            packageName: "@webpresso/agent-kit-runtime-linux-x64",
          },
        ],
      },
      runtimeBinaryPath: "/runtime/wp",
      runtimeBinaryExists: () => true,
      builtExists: true,
      sourceExists: true,
      sourceNeedsSourceLaunch: false,
      sourceOverride: true,
      pinnedNodeVersion: null,
      runtimeManager: null,
    });
    rmSync(repoRoot, { recursive: true, force: true });

    expect(plan).toMatchObject({
      mode: "runtime",
      runtime: "/runtime/wp",
      args: ["hook", "pretool-guard"],
    });
  });

  it("still honors forced compiled runtime for source-checkout phase-2 commands", () => {
    const repoRoot = createSourceRepo();
    const plan = buildLaunchPlan({
      binName: "wp",
      repoRoot,
      forwardedArgs: ["audit", "guardrails"],
      platform: "linux",
      arch: "x64",
      runtimeManifest: {
        binaryName: "wp",
        targets: [
          {
            id: "linux-x64",
            os: "linux",
            cpu: "x64",
            packageName: "@webpresso/agent-kit-runtime-linux-x64",
          },
        ],
      },
      runtimeBinaryPath: "/runtime/wp",
      runtimeBinaryExists: () => true,
      builtExists: true,
      sourceExists: true,
      sourceNeedsSourceLaunch: false,
      forceCompiledRuntime: true,
      pinnedNodeVersion: null,
      runtimeManager: null,
    });
    rmSync(repoRoot, { recursive: true, force: true });

    expect(plan).toMatchObject({
      mode: "runtime",
      runtime: "/runtime/wp",
      args: ["audit", "guardrails"],
    });
  });
});

describe("areRuntimeHooksEnabled", () => {
  const tmpRoots: string[] = [];

  afterEach(() => {
    for (const root of tmpRoots.splice(0)) rmSync(root, { recursive: true, force: true });
  });

  it("disables runtime hooks in the source repo when the state file is missing", () => {
    const repoRoot = createSourceRepo();
    tmpRoots.push(repoRoot);

    expect(areRuntimeHooksEnabled({ repoRoot })).toBe(false);
  });

  it("disables runtime hooks in the source repo when the state file is malformed", () => {
    const repoRoot = createSourceRepo();
    tmpRoots.push(repoRoot);
    const statePath = join(repoRoot, ".webpresso", "runtime-hooks.json");
    mkdirSync(join(repoRoot, ".webpresso"), { recursive: true });
    writeFileSync(statePath, "{not json");

    expect(areRuntimeHooksEnabled({ repoRoot })).toBe(false);
  });

  it("lets the environment override win over malformed source-repo state", () => {
    const repoRoot = createSourceRepo();
    tmpRoots.push(repoRoot);
    const statePath = join(repoRoot, ".webpresso", "runtime-hooks.json");
    mkdirSync(join(repoRoot, ".webpresso"), { recursive: true });
    writeFileSync(statePath, "{not json");

    expect(areRuntimeHooksEnabled({ repoRoot, env: { WP_RUNTIME_HOOKS_ENABLED: "1" } })).toBe(true);
  });

  it("keeps runtime hooks enabled outside the source repo", () => {
    const repoRoot = mkdtempSync(join(tmpdir(), "wp-run-consumer-"));
    tmpRoots.push(repoRoot);
    writeFileSync(join(repoRoot, "package.json"), JSON.stringify({ name: "consumer" }));

    expect(areRuntimeHooksEnabled({ repoRoot })).toBe(true);
  });
});
