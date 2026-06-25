import { mkdtempSync, realpathSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const loadConfiguredHostAdapter = vi.hoisted(() => vi.fn());
const planGenericE2eRun = vi.hoisted(() => vi.fn());
const planE2eRun = vi.hoisted(() => vi.fn());

vi.mock("./load-host-adapter.js", () => ({
  loadConfiguredHostAdapter,
}));

vi.mock("./run-planner.js", () => ({
  planGenericE2eRun,
  planE2eRun,
}));

import {
  createE2eExecutionPlan,
  plannedGroupsToCommandConfigs,
  runCommandConfigs,
} from "./execution.js";

const tempDirs: string[] = [];

afterEach(() => {
  for (const dir of tempDirs.splice(0)) {
    rmSync(dir, { recursive: true, force: true });
  }
});

function tempDir(): string {
  const root = mkdtempSync(join(tmpdir(), "wp-e2e-run-cwd-"));
  tempDirs.push(root);
  return root;
}

beforeEach(() => {
  loadConfiguredHostAdapter.mockReset();
  planGenericE2eRun.mockReset();
  planE2eRun.mockReset();
});

describe("e2e execution helpers", () => {
  it("uses the generic planner when no host adapter is configured", async () => {
    const groups = [{ batchKey: "default", runs: [] }];
    loadConfiguredHostAdapter.mockResolvedValue(null);
    planGenericE2eRun.mockReturnValue(groups);

    const result = await createE2eExecutionPlan({
      suite: "smoke",
      runner: "playwright",
      files: ["tests/smoke.spec.ts"],
      headed: true,
    });

    expect(planGenericE2eRun).toHaveBeenCalledWith(
      expect.objectContaining({
        suite: "smoke",
        runner: "playwright",
        files: ["tests/smoke.spec.ts"],
        headed: true,
      }),
    );
    expect(result).toBe(groups);
  });

  it("prefers hostAdapter.buildExecutionPlan when available", async () => {
    const groups = [{ batchKey: "host", runs: [] }];
    const buildExecutionPlan = vi.fn(() => groups);
    loadConfiguredHostAdapter.mockResolvedValue({
      adapter: {
        buildExecutionPlan,
      },
    });

    const result = await createE2eExecutionPlan({
      suite: "api",
      files: ["apps/e2e/tests/api.spec.ts"],
      reuseReset: true,
    });

    expect(buildExecutionPlan).toHaveBeenCalledWith(
      expect.objectContaining({
        suite: "api",
        file: ["apps/e2e/tests/api.spec.ts"],
        files: ["apps/e2e/tests/api.spec.ts"],
        reuseReset: true,
      }),
    );
    expect(planE2eRun).not.toHaveBeenCalled();
    expect(result).toBe(groups);
  });

  it("uses generic planner when runner is explicitly requested, even if host adapter exists", async () => {
    const groups = [{ batchKey: "generic", runs: [] }];
    const buildExecutionPlan = vi.fn(() => [{ batchKey: "host", runs: [] }]);
    loadConfiguredHostAdapter.mockResolvedValue({
      adapter: {
        buildExecutionPlan,
      },
    });
    planGenericE2eRun.mockReturnValue(groups);

    const result = await createE2eExecutionPlan({
      runner: "vitest",
      files: ["src/cli/commands/init/init.e2e.test.ts"],
    });

    expect(planGenericE2eRun).toHaveBeenCalledWith(
      expect.objectContaining({
        runner: "vitest",
        files: ["src/cli/commands/init/init.e2e.test.ts"],
      }),
    );
    expect(buildExecutionPlan).not.toHaveBeenCalled();
    expect(planE2eRun).not.toHaveBeenCalled();
    expect(result).toBe(groups);
  });

  it("falls through to planE2eRun when host adapter has no custom builder", async () => {
    const adapter = {
      listSuites: vi.fn(),
      resolveSuiteId: vi.fn(),
      normalizeFilePath: vi.fn(),
      resolveSuiteForFile: vi.fn(),
    };
    const groups = [{ batchKey: "planned", runs: [] }];
    loadConfiguredHostAdapter.mockResolvedValue({ adapter });
    planE2eRun.mockReturnValue(groups);

    const result = await createE2eExecutionPlan({
      suite: "platform-api",
      files: ["apps/workers/platform-api/e2e/test.spec.ts"],
      workers: "2",
    });

    expect(planE2eRun).toHaveBeenCalledWith(
      expect.objectContaining({
        hostAdapter: adapter,
        suite: "platform-api",
        file: ["apps/workers/platform-api/e2e/test.spec.ts"],
        workers: "2",
      }),
    );
    expect(result).toBe(groups);
  });

  it("uses the caller cwd as the execution cwd when a planned command has no cwd", async () => {
    const cwd = tempDir();

    const result = await runCommandConfigs(
      [
        {
          command: process.execPath,
          args: ["-e", "process.stdout.write(process.cwd())"],
        },
      ],
      { cwd },
    );

    expect(result).toEqual({ passed: true, exitCode: 0, output: realpathSync(cwd) });
  });

  it("aborts a long-running child command when the AbortSignal fires", async () => {
    const cwd = tempDir();
    const controller = new AbortController();
    const promise = runCommandConfigs(
      [
        {
          command: process.execPath,
          args: ["-e", "setInterval(() => {}, 1000)"],
        },
      ],
      { cwd, signal: controller.signal },
    );

    controller.abort();
    const result = await promise;

    expect(result.passed).toBe(false);
    expect(result.exitCode).toBeGreaterThan(0);
  });

  it("times out a long-running child command when timeoutMs elapses", async () => {
    const cwd = tempDir();
    const result = await runCommandConfigs(
      [
        {
          command: process.execPath,
          args: ["-e", "setInterval(() => {}, 1000)"],
        },
      ],
      { cwd, timeoutMs: 10 },
    );

    expect(result.passed).toBe(false);
    expect(result.exitCode).toBeGreaterThan(0);
  });

  it("merges group and run env when flattening planned commands", () => {
    const commands = plannedGroupsToCommandConfigs([
      {
        batchKey: "platform",
        envProfile: "platform",
        runtimeProfile: "platform",
        env: {
          DATABASE_URL: "postgres://suite",
          SHARED: "group",
        },
        runs: [
          {
            suiteId: "platform-api",
            batchKey: "platform",
            envProfile: "platform",
            runtimeProfile: "platform",
            runner: "command",
            logName: "platform-api",
            command: "pnpm",
            args: ["exec", "vitest", "run"],
            env: {
              SHARED: "run",
              E2E_SUITE: "platform-api",
            },
          },
        ],
      },
    ]);

    expect(commands).toEqual([
      {
        command: "pnpm",
        args: ["exec", "vitest", "run"],
        env: {
          DATABASE_URL: "postgres://suite",
          SHARED: "run",
          E2E_SUITE: "platform-api",
        },
        runtimeProfile: "platform",
      },
    ]);
  });
});
