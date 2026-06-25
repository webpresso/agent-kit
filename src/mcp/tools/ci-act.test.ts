import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

import { afterEach, describe, expect, it, vi } from "vitest";

import { buildCiActCommand } from "#cli/commands/ci";
import { DEFAULT_CI_ACT_TIMEOUT_MS, MAX_CI_ACT_TIMEOUT_MS } from "#cli/commands/ci";

import tool from "./ci-act.js";

const TEST_REDACTABLE_SECRET = "TESTTOKENABCDEFGHIJKLMNOPQRSTUVWXYZ1234567890ABCDE";

const runSecretGateCommandMock = vi.hoisted(() => vi.fn());
const tempDirs: string[] = [];
const originalClaudeProjectDir = process.env.CLAUDE_PROJECT_DIR;

vi.mock("#secret-gate/runner.js", async (importOriginal) => ({
  ...(await importOriginal<typeof import("#secret-gate/runner.js")>()),
  runSecretGateCommand: runSecretGateCommandMock,
}));

afterEach(() => {
  runSecretGateCommandMock.mockReset();
  vi.unstubAllEnvs();
  if (originalClaudeProjectDir === undefined) {
    delete process.env.CLAUDE_PROJECT_DIR;
  } else {
    process.env.CLAUDE_PROJECT_DIR = originalClaudeProjectDir;
  }
  for (const dir of tempDirs.splice(0)) {
    rmSync(dir, { recursive: true, force: true });
  }
});

function tempProjectRoot(): string {
  const root = mkdtempSync(join(tmpdir(), "wp-ci-act-root-"));
  tempDirs.push(root);
  writeFileSync(join(root, "pnpm-workspace.yaml"), "packages: []\n");
  mkdirSync(join(root, ".github", "workflows"), { recursive: true });
  mkdirSync(join(root, ".webpresso"), { recursive: true });
  writeFileSync(join(root, ".github", "workflows", "ci.yml"), "name: ci\n");
  writeFileSync(
    join(root, ".webpresso", "secrets.config.json"),
    JSON.stringify({
      manager: "doppler",
      projectId: "demo",
      profiles: {
        "e2e-runtime": { environment: "dev" },
      },
    }),
  );
  return root;
}

describe("wp_ci_act tool", () => {
  it("returns the same canonical wp secrets run dry-run command as the CLI", async () => {
    vi.stubEnv("GITHUB_PAT", TEST_REDACTABLE_SECRET);
    const root = tempProjectRoot();
    const result = await tool.handler({
      workflowPath: ".github/workflows/ci.yml",
      cwd: root,
    });

    expect(runSecretGateCommandMock).not.toHaveBeenCalled();
    const payload = result.structuredContent as Record<string, unknown>;
    expect(payload.passed).toBe(true);
    expect(payload.summary).toContain("dry-run");
    const details = payload.details as { command: { command: string; args: string[] } };
    expect(details.command).toEqual(
      buildCiActCommand({ workflowPath: ".github/workflows/ci.yml" }, root),
    );
    expect(details.command.command).toBe("wp");
    expect(details.command.args.slice(0, 8)).toEqual([
      "secrets",
      "run",
      "--sink",
      "act",
      "--profile",
      "preview",
      "--",
      "act",
    ]);
    expect(details.command.args.join(" ")).not.toContain("--secret-file");
    expect(details.nonSecurityEquivalent.command).toBe("act");
    expect(details.nonSecurityEquivalent.args.join(" ")).not.toContain("with-secrets");
    expect(details.nonSecurityEquivalent.args.join(" ")).not.toContain("--secret-file");
    expect(JSON.stringify(payload)).not.toContain(TEST_REDACTABLE_SECRET);
    expect(JSON.stringify(payload)).not.toMatch(/wp-ci-act-[^" ]+secrets\.env/u);
  });

  it("describes replay dry-runs as non-security-equivalent generated workflows", async () => {
    const root = tempProjectRoot();
    const result = await tool.handler({
      workflowPath: ".github/workflows/ci.yml",
      cwd: root,
      mode: "replay",
    });

    const payload = result.structuredContent as Record<string, unknown>;
    const details = payload.details as {
      command: { command: string; args: string[] };
      mode: string;
      nonSecurityEquivalent: boolean;
    };
    expect(details.mode).toBe("replay");
    expect(details.nonSecurityEquivalent).toBe(true);
    expect(details.command.args.join(" ")).toContain("[GENERATED_REPLAY_WORKFLOW]");
  });

  it("rejects arbitrary unsafe public inputs at the schema boundary", async () => {
    await expect(
      tool.handler({
        workflowPath: ".github/workflows/ci.yml",
        strictSecrets: true,
      }),
    ).rejects.toThrow();

    await expect(
      tool.handler({
        workflowPath: ".github/workflows/ci.yml",
        mapGithubPatToToken: true,
      }),
    ).rejects.toThrow();

    await expect(
      tool.handler({
        workflowPath: ".github/workflows/ci.yml",
        passthrough: ["--secret", "TOKEN=value"],
      }),
    ).rejects.toThrow();

    await expect(
      tool.handler({
        workflowPath: ".github/workflows/ci.yml",
        allowHostMutation: true,
      }),
    ).rejects.toThrow();
  });
  it("rejects provider selectors in envProfile and directs callers to secretProfile", async () => {
    await expect(
      tool.handler({
        workflowPath: ".github/workflows/ci.yml",
        envProfile: "e2e-runtime",
      }),
    ).rejects.toThrow("Use secretProfile");
  });

  it("resolves the MCP project root and forwards a repo-owned secretProfile", async () => {
    const root = tempProjectRoot();
    process.env.CLAUDE_PROJECT_DIR = root;
    runSecretGateCommandMock.mockResolvedValue({
      exitCode: 0,
      stdout: "ok",
      stderr: "",
      timedOut: false,
      aborted: false,
      signal: null,
    });

    await tool.handler({
      workflowPath: ".github/workflows/ci.yml",
      execute: true,
      secretProfile: "e2e-runtime",
    });

    expect(runSecretGateCommandMock).toHaveBeenCalledWith(
      expect.objectContaining({
        cwd: root,
        sink: "act",
        profile: "dev",
        envProfile: "secrets-only",
      }),
    );
  });

  it("executes through the canonical secret gate without internal secret-file fallbacks", async () => {
    runSecretGateCommandMock.mockResolvedValue({
      exitCode: 0,
      stdout: "ok",
      stderr: "",
      timedOut: false,
      aborted: false,
      signal: null,
    });

    const result = await tool.handler({
      workflowPath: ".github/workflows/ci.yml",
      execute: true,
    });

    expect(runSecretGateCommandMock).toHaveBeenCalledOnce();
    const call = runSecretGateCommandMock.mock.calls[0]![0];
    expect(call.command).toBe("act");
    expect(call.envProfile).toBe("secrets-only");
    expect(call.timeoutMs).toBe(DEFAULT_CI_ACT_TIMEOUT_MS);
    expect(call.args).not.toContain("--secret-file");
    expect(call.args.join(" ")).not.toContain("--chef-token");
    expect(call.args.join(" ")).not.toContain("--bind");
    const payload = result.structuredContent as Record<string, unknown>;
    expect(payload.passed).toBe(true);
    const details = payload.details as { command: { command: string; args: string[] } };
    expect(details.command.command).toBe("wp");
    expect(details.command.args.join(" ")).not.toContain("--secret-file");
    expect(details.nonSecurityEquivalent.command).toBe("act");
  });

  it("executes replay mode through a generated workflow file and reports it as non-security-equivalent", async () => {
    const root = tempProjectRoot();
    process.env.CLAUDE_PROJECT_DIR = root;
    runSecretGateCommandMock.mockResolvedValue({
      exitCode: 0,
      stdout: "ok",
      stderr: "",
      timedOut: false,
      aborted: false,
      signal: null,
    });

    const result = await tool.handler({
      workflowPath: ".github/workflows/ci.yml",
      execute: true,
      mode: "replay",
    });

    const call = runSecretGateCommandMock.mock.calls[0]![0];
    expect(call.args.join(" ")).not.toContain(".github/workflows/ci.yml");
    expect(call.args.join(" ")).toContain("workflow.yml");
    const payload = result.structuredContent as Record<string, unknown>;
    const details = payload.details as { nonSecurityEquivalent: boolean; mode: string };
    expect(details.mode).toBe("replay");
    expect(details.nonSecurityEquivalent).toBe(true);
  });

  it("forces the public secret-gate path even for direct env profiles in execute mode", async () => {
    runSecretGateCommandMock.mockResolvedValue({
      exitCode: 0,
      stdout: "ok",
      stderr: "",
      timedOut: false,
      aborted: false,
      signal: null,
    });

    await tool.handler({
      workflowPath: ".github/workflows/ci.yml",
      execute: true,
      envProfile: "public",
    });

    expect(runSecretGateCommandMock).toHaveBeenCalledWith(
      expect.objectContaining({
        envProfile: "public",
        forceSecretGate: true,
      }),
    );
  });

  it("honors an explicit timeout override", async () => {
    runSecretGateCommandMock.mockResolvedValue({
      exitCode: 0,
      stdout: "",
      stderr: "",
      timedOut: false,
      aborted: false,
      signal: null,
    });

    await tool.handler({
      workflowPath: ".github/workflows/ci.yml",
      execute: true,
      timeoutMs: 45_000,
    });

    expect(runSecretGateCommandMock).toHaveBeenCalledWith(
      expect.objectContaining({
        timeoutMs: 45_000,
      }),
    );
  });

  it("rejects timeout overrides above the documented execution cap", async () => {
    await expect(
      tool.handler({
        workflowPath: ".github/workflows/ci.yml",
        execute: true,
        timeoutMs: MAX_CI_ACT_TIMEOUT_MS + 1,
      }),
    ).rejects.toThrow();

    expect(runSecretGateCommandMock).not.toHaveBeenCalled();
  });

  it("redacts seeded fake secrets from execute output and metadata", async () => {
    const fakeSecret = TEST_REDACTABLE_SECRET;
    runSecretGateCommandMock.mockResolvedValue({
      exitCode: 1,
      stdout: `GITHUB_TOKEN=${fakeSecret}`,
      stderr: `failed ${fakeSecret}`,
      timedOut: false,
      aborted: false,
      signal: null,
    });

    const result = await tool.handler({
      workflowPath: ".github/workflows/ci.yml",
      execute: true,
    });

    const payload = result.structuredContent as Record<string, unknown>;
    expect(payload.passed).toBe(false);
    expect(JSON.stringify(payload)).not.toContain(fakeSecret);
    expect(JSON.stringify(result.content)).not.toContain(fakeSecret);
  });

  it("marks timed out execution as isError: true", async () => {
    runSecretGateCommandMock.mockResolvedValue({
      exitCode: 1,
      stdout: "",
      stderr: "",
      timedOut: true,
      aborted: false,
      signal: null,
    });

    const result = await tool.handler({
      workflowPath: ".github/workflows/ci.yml",
      execute: true,
    });

    expect(result.isError).toBe(true);
    const payload = result.structuredContent as Record<string, unknown>;
    expect(payload.passed).toBe(false);
    expect(JSON.stringify(payload)).toContain("timed out while running act");
  });

  it("marks aborted execution as isError: true", async () => {
    runSecretGateCommandMock.mockResolvedValue({
      exitCode: 1,
      stdout: "",
      stderr: "",
      timedOut: false,
      aborted: true,
      signal: "SIGTERM",
    });

    const result = await tool.handler({
      workflowPath: ".github/workflows/ci.yml",
      execute: true,
    });

    expect(result.isError).toBe(true);
    const payload = result.structuredContent as Record<string, unknown>;
    expect(payload.passed).toBe(false);
    expect(JSON.stringify(payload)).toContain("aborted by client signal");
  });
});
