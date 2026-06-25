import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const createE2eExecutionPlan = vi.hoisted(() => vi.fn());
const plannedGroupsToCommandConfigs = vi.hoisted(() => vi.fn());
const runCommandConfigs = vi.hoisted(() => vi.fn());

vi.mock("#e2e", () => ({
  __esModule: true,
}));

vi.mock("../../e2e/execution.js", () => ({
  createE2eExecutionPlan,
  plannedGroupsToCommandConfigs,
  runCommandConfigs,
}));

import akE2eTool from "./e2e.js";

function parsePayload(result: {
  structuredContent?: unknown;
  content: ReadonlyArray<{ type: string; text?: string }>;
}) {
  return result.structuredContent as Record<string, unknown>;
}

const tempDirs: string[] = [];
const originalClaudeProjectDir = process.env.CLAUDE_PROJECT_DIR;

afterEach(() => {
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
  const root = mkdtempSync(join(tmpdir(), "wp-e2e-mcp-root-"));
  tempDirs.push(root);
  writeFileSync(join(root, "pnpm-workspace.yaml"), "packages: []\n");
  mkdirSync(join(root, ".webpresso"), { recursive: true });
  writeFileSync(
    join(root, ".webpresso", "secrets.config.json"),
    JSON.stringify({ manager: "doppler", projectId: "node-pubsub" }),
  );
  return root;
}

beforeEach(() => {
  createE2eExecutionPlan.mockReset();
  plannedGroupsToCommandConfigs.mockReset();
  runCommandConfigs.mockReset();
});

describe("wp_e2e tool", () => {
  it("exposes the expected descriptor surface", () => {
    expect(akE2eTool.name).toBe("wp_e2e");
    expect(typeof akE2eTool.description).toBe("string");
    expect(akE2eTool.handler).toBeTypeOf("function");
  });

  it("returns structured execution payload for a generic planned run", async () => {
    const groups = [
      {
        batchKey: "smoke",
        runs: [
          {
            suiteId: "smoke",
            batchKey: "smoke",
            runner: "playwright",
            logName: "smoke",
            command: "vp",
            args: ["exec", "playwright", "test"],
          },
        ],
      },
    ];
    const commands = [
      {
        command: "vp",
        args: ["exec", "playwright", "test"],
        env: { E2E_SUITE: "smoke" },
      },
    ];
    createE2eExecutionPlan.mockResolvedValue(groups);
    plannedGroupsToCommandConfigs.mockReturnValue(commands);
    runCommandConfigs.mockResolvedValue({ passed: true, exitCode: 0, output: "ok\n" });

    const result = await akE2eTool.handler({
      suite: "smoke",
      files: ["tests/smoke.spec.ts"],
      headed: true,
    });

    expect(createE2eExecutionPlan).toHaveBeenCalledWith(
      expect.objectContaining({
        suite: "smoke",
        files: ["tests/smoke.spec.ts"],
        headed: true,
      }),
      process.cwd(),
    );
    expect(plannedGroupsToCommandConfigs).toHaveBeenCalledWith(groups);
    expect(runCommandConfigs).toHaveBeenCalledWith(commands, {
      cwd: process.cwd(),
      signal: undefined,
      timeoutMs: undefined,
    });

    const payload = parsePayload(result);
    expect(payload).toMatchObject({
      passed: true,
      summary: "e2e passed: 1 suite, 1 command",
      exitCode: 0,
      counts: { suiteCount: 1, commandCount: 1 },
      details: {
        suiteIds: ["smoke"],
        runnerSummary: { playwright: 1 },
      },
      rawOutput: "ok\n",
    });
    expect((result.content[0] as { text: string }).text).toBe("e2e passed: 1 suite, 1 command");
    expect((payload.details as { commands: unknown[] }).commands).toEqual(commands);
  });

  it("resolves the MCP project root for planning and command execution", async () => {
    const root = tempProjectRoot();
    process.env.CLAUDE_PROJECT_DIR = root;
    const groups = [
      {
        batchKey: "smoke",
        runs: [
          {
            suiteId: "smoke",
            batchKey: "smoke",
            runner: "command",
            logName: "smoke",
            command: "vp",
            args: ["run", "e2e"],
          },
        ],
      },
    ];
    const commands = [{ command: "vp", args: ["run", "e2e"] }];
    createE2eExecutionPlan.mockResolvedValue(groups);
    plannedGroupsToCommandConfigs.mockReturnValue(commands);
    runCommandConfigs.mockResolvedValue({ passed: true, exitCode: 0, output: "ok\n" });

    await akE2eTool.handler({ suite: "smoke" });

    expect(createE2eExecutionPlan).toHaveBeenCalledWith(expect.any(Object), root);
    expect(runCommandConfigs).toHaveBeenCalledWith(commands, {
      cwd: root,
      signal: undefined,
      timeoutMs: undefined,
    });
  });

  it("forwards timeoutMs to the shared e2e execution runner", async () => {
    const groups = [
      {
        batchKey: "smoke",
        runs: [
          {
            suiteId: "smoke",
            batchKey: "smoke",
            runner: "command",
            logName: "smoke",
            command: "vp",
            args: ["run", "e2e"],
          },
        ],
      },
    ];
    const commands = [{ command: "vp", args: ["run", "e2e"] }];
    createE2eExecutionPlan.mockResolvedValue(groups);
    plannedGroupsToCommandConfigs.mockReturnValue(commands);
    runCommandConfigs.mockResolvedValue({ passed: true, exitCode: 0, output: "ok\n" });

    await akE2eTool.handler({ suite: "smoke", timeoutMs: 45_000 });

    expect(runCommandConfigs).toHaveBeenCalledWith(commands, {
      cwd: process.cwd(),
      signal: undefined,
      timeoutMs: 45_000,
    });
  });

  it("propagates non-zero execution as passed=false with command metadata intact", async () => {
    const groups = [
      {
        batchKey: "platform",
        runs: [
          {
            suiteId: "platform-api",
            batchKey: "platform",
            runner: "command",
            logName: "platform-api",
            command: "vp",
            args: ["run", "e2e:run"],
          },
        ],
      },
    ];
    const commands = [{ command: "vp", args: ["run", "e2e:run"] }];
    createE2eExecutionPlan.mockResolvedValue(groups);
    plannedGroupsToCommandConfigs.mockReturnValue(commands);
    runCommandConfigs.mockResolvedValue({ passed: false, exitCode: 1, output: "boom\n" });

    const result = await akE2eTool.handler({ suite: "platform-api" });
    const payload = parsePayload(result);

    expect(payload).toMatchObject({
      passed: false,
      summary: "e2e failed: 1 suite, 1 command (exit 1)",
      exitCode: 1,
      counts: { suiteCount: 1, commandCount: 1 },
      details: {
        suiteIds: ["platform-api"],
        runnerSummary: { command: 1 },
      },
      rawOutput: "boom\n",
    });
    expect((payload.details as { commands: unknown[] }).commands).toEqual(commands);
  });

  it("clips long E2E output and marks it truncated", async () => {
    const groups = [
      {
        batchKey: "smoke",
        runs: [
          {
            suiteId: "smoke",
            batchKey: "smoke",
            runner: "playwright",
            logName: "smoke",
            command: "vp",
            args: ["exec", "playwright", "test"],
          },
        ],
      },
    ];
    const commands = [{ command: "vp", args: ["exec", "playwright", "test"] }];
    createE2eExecutionPlan.mockResolvedValue(groups);
    plannedGroupsToCommandConfigs.mockReturnValue(commands);
    runCommandConfigs.mockResolvedValue({ passed: false, exitCode: 1, output: "x".repeat(5_000) });

    const result = await akE2eTool.handler({ suite: "smoke" });
    const payload = parsePayload(result);
    expect(payload.rawOutput).toHaveLength(4_000);
    expect(payload.truncated).toBe(true);
    expect(payload.logPath).toMatch(/^logs\//);
  });

  it("returns full E2E output when full is true", async () => {
    const groups = [
      {
        batchKey: "smoke",
        runs: [
          {
            suiteId: "smoke",
            batchKey: "smoke",
            runner: "playwright",
            logName: "smoke",
            command: "vp",
            args: ["exec", "playwright", "test"],
          },
        ],
      },
    ];
    const commands = [{ command: "vp", args: ["exec", "playwright", "test"] }];
    const output = "x".repeat(5_000);
    createE2eExecutionPlan.mockResolvedValue(groups);
    plannedGroupsToCommandConfigs.mockReturnValue(commands);
    runCommandConfigs.mockResolvedValue({ passed: false, exitCode: 1, output });

    const result = await akE2eTool.handler({ suite: "smoke", full: true });
    const payload = parsePayload(result);
    expect(payload.rawOutput).toBe(output);
    expect(payload.truncated).toBeUndefined();
    expect(payload.logPath).toBeUndefined();
  });
});
