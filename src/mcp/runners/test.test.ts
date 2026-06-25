import { mkdtempSync, mkdirSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { runTests } from "./test.js";

const spawnMock = vi.hoisted(() => vi.fn());

vi.mock("node:child_process", () => ({
  spawn: spawnMock,
}));

function fakeChild(
  opts: {
    stdout?: string;
    stderr?: string;
    exitCode?: number;
    hang?: boolean;
    killCapture?: { signal: NodeJS.Signals | null };
  } = {},
): unknown {
  let closeFn: ((code: number | null, signal?: NodeJS.Signals | null) => void) | null = null;
  return {
    stdout: {
      on: (event: string, fn: (data: Buffer) => void) => {
        if (event === "data" && opts.stdout) fn(Buffer.from(opts.stdout));
      },
    },
    stderr: {
      on: (event: string, fn: (data: Buffer) => void) => {
        if (event === "data" && opts.stderr) fn(Buffer.from(opts.stderr));
      },
    },
    on: (event: string, fn: (code: number | null, signal?: NodeJS.Signals | null) => void) => {
      if (event === "close") {
        closeFn = fn;
        if (!opts.hang) queueMicrotask(() => fn(opts.exitCode ?? 0));
      }
    },
    kill: (signal: NodeJS.Signals) => {
      if (opts.killCapture) opts.killCapture.signal = signal;
      if (closeFn) queueMicrotask(() => closeFn?.(null, signal));
    },
  };
}

function writeVitestWorkspace(root: string): void {
  writeFileSync(
    join(root, "package.json"),
    JSON.stringify({
      scripts: { test: "vitest run" },
      devDependencies: { vitest: "^4.0.0" },
    }),
  );
}

function writeTestFiles(root: string, count: number): string[] {
  const files: string[] = [];
  mkdirSync(join(root, "src"), { recursive: true });
  for (let index = 1; index <= count; index += 1) {
    const relative = `src/spec-${index}.test.ts`;
    writeFileSync(
      join(root, relative),
      `import { it, expect } from 'vitest'\nit('spec-${index}', () => expect(1).toBe(1))\n`,
    );
    files.push(relative);
  }
  return files;
}

function testFileArgs(args: readonly string[]): string[] {
  return args.filter((arg) => /\.test\.[jt]sx?$/.test(arg));
}

let defaultRoot: string | undefined;

beforeEach(() => {
  defaultRoot = mkdtempSync(join(tmpdir(), "wp-vp-default-"));
  vi.stubEnv("CLAUDE_PROJECT_DIR", defaultRoot);
});

afterEach(() => {
  spawnMock.mockReset();
  if (defaultRoot) rmSync(defaultRoot, { recursive: true, force: true });
  vi.unstubAllEnvs();
});

describe("test runner", () => {
  it("runs `vp run --filter <p> test` once per package", async () => {
    spawnMock
      .mockReturnValueOnce(fakeChild({ stdout: "a ok\n", exitCode: 0 }))
      .mockReturnValueOnce(fakeChild({ stdout: "b ok\n", exitCode: 0 }));
    const result = await runTests({ packages: ["a", "b"] });
    expect(spawnMock).toHaveBeenCalledTimes(2);
    expect(spawnMock.mock.calls[0]![0]).toBe("vp");
    expect(spawnMock.mock.calls[0]![1]).toEqual(["run", "--filter", "a", "test"]);
    expect(spawnMock.mock.calls[1]![1]).toEqual(["run", "--filter", "b", "test"]);
    expect(result.passed).toBe(true);
    expect(result.exitCode).toBe(0);
  });

  it("runs vitest directly for package targets that declare vitest", async () => {
    const root = mkdtempSync(join(tmpdir(), "wp-vp-vitest-"));
    try {
      vi.stubEnv("CLAUDE_PROJECT_DIR", root);
      mkdirSync(join(root, "packages", "a"), { recursive: true });
      writeFileSync(
        join(root, "packages", "a", "package.json"),
        JSON.stringify({ devDependencies: { vitest: "^4.0.0" } }),
      );
      spawnMock.mockReturnValueOnce(fakeChild({ stdout: "{}\n", exitCode: 0 }));

      await runTests({ packages: ["a"] });

      expect(spawnMock.mock.calls[0]![1]).toEqual([
        "exec",
        "--filter",
        "a",
        "--",
        "vitest",
        "run",
        "--reporter=json",
        "--no-color",
      ]);
    } finally {
      rmSync(root, { recursive: true, force: true });
    }
  });

  it("runs the unit suite directly for concrete vitest-backed package targets", async () => {
    const root = mkdtempSync(join(tmpdir(), "wp-vp-vitest-suite-"));
    try {
      vi.stubEnv("CLAUDE_PROJECT_DIR", root);
      writeFileSync(join(root, "package.json"), JSON.stringify({ name: "workspace-root" }));
      mkdirSync(join(root, "packages", "a"), { recursive: true });
      writeFileSync(
        join(root, "packages", "a", "package.json"),
        JSON.stringify({ devDependencies: { vitest: "^4.0.0" } }),
      );
      spawnMock.mockReturnValueOnce(fakeChild({ stdout: "{}\n", exitCode: 0 }));

      await runTests({ packages: ["a"], suite: "unit" });

      expect(spawnMock.mock.calls[0]![1]).toEqual([
        "exec",
        "--filter",
        "a",
        "--",
        "vitest",
        "run",
        "--exclude",
        "**/*.integration.test.ts",
        "--exclude",
        "**/*.e2e.test.ts",
        "--reporter=json",
        "--no-color",
      ]);
    } finally {
      rmSync(root, { recursive: true, force: true });
    }
  });

  it("runs suite=all as unit then integration in order for package targets", async () => {
    const root = mkdtempSync(join(tmpdir(), "wp-vp-vitest-suite-all-"));
    try {
      vi.stubEnv("CLAUDE_PROJECT_DIR", root);
      writeFileSync(join(root, "package.json"), JSON.stringify({ name: "workspace-root" }));
      mkdirSync(join(root, "packages", "a"), { recursive: true });
      writeFileSync(
        join(root, "packages", "a", "package.json"),
        JSON.stringify({ devDependencies: { vitest: "^4.0.0" } }),
      );
      spawnMock
        .mockReturnValueOnce(fakeChild({ stdout: "{}\n", exitCode: 0 }))
        .mockReturnValueOnce(fakeChild({ stdout: "{}\n", exitCode: 0 }));

      await runTests({ packages: ["a"], suite: "all" });

      expect(spawnMock).toHaveBeenCalledTimes(2);
      expect(spawnMock.mock.calls[0]![1]).toEqual([
        "exec",
        "--filter",
        "a",
        "--",
        "vitest",
        "run",
        "--exclude",
        "**/*.integration.test.ts",
        "--exclude",
        "**/*.e2e.test.ts",
        "--reporter=json",
        "--no-color",
      ]);
      expect(spawnMock.mock.calls[1]![1]).toEqual([
        "exec",
        "--filter",
        "a",
        "--",
        "vitest",
        "run",
        "--no-file-parallelism",
        ".integration.test.ts",
        ".e2e.test.ts",
        "--testTimeout",
        "30000",
        "--reporter=json",
        "--no-color",
      ]);
    } finally {
      rmSync(root, { recursive: true, force: true });
    }
  });

  it("fails loudly when suite package targets do not resolve concretely", async () => {
    writeFileSync(join(defaultRoot!, "package.json"), JSON.stringify({ name: "workspace-root" }));

    await expect(runTests({ packages: ["missing"], suite: "unit" })).rejects.toThrow(
      /could not resolve package "missing"/i,
    );
    expect(spawnMock).not.toHaveBeenCalled();
  });

  it("fails loudly when suite package targets are not vitest-backed", async () => {
    writeFileSync(join(defaultRoot!, "package.json"), JSON.stringify({ name: "workspace-root" }));
    mkdirSync(join(defaultRoot!, "packages", "a"), { recursive: true });
    writeFileSync(
      join(defaultRoot!, "packages", "a", "package.json"),
      JSON.stringify({ scripts: { test: "node test.js" } }),
    );

    await expect(runTests({ packages: ["a"], suite: "unit" })).rejects.toThrow(
      /vitest-backed package target/i,
    );
    expect(spawnMock).not.toHaveBeenCalled();
  });

  it("preserves file filters when package targets declare vitest", async () => {
    const root = mkdtempSync(join(tmpdir(), "wp-vp-vitest-files-"));
    try {
      vi.stubEnv("CLAUDE_PROJECT_DIR", root);
      mkdirSync(join(root, "packages", "a"), { recursive: true });
      writeFileSync(
        join(root, "packages", "a", "package.json"),
        JSON.stringify({ devDependencies: { vitest: "^4.0.0" } }),
      );
      spawnMock.mockReturnValueOnce(fakeChild({ stdout: "{}\n", exitCode: 0 }));

      await runTests({ packages: ["a"], files: ["src/a.test.ts"] });

      expect(spawnMock.mock.calls[0]![1]).toEqual([
        "exec",
        "--filter",
        "a",
        "--",
        "vitest",
        "run",
        "--reporter=json",
        "--no-color",
        "src/a.test.ts",
      ]);
    } finally {
      rmSync(root, { recursive: true, force: true });
    }
  });

  it("treats suite selection as a filter over explicit package file targets", async () => {
    const root = mkdtempSync(join(tmpdir(), "wp-vp-vitest-suite-files-"));
    try {
      vi.stubEnv("CLAUDE_PROJECT_DIR", root);
      writeFileSync(join(root, "package.json"), JSON.stringify({ name: "workspace-root" }));
      mkdirSync(join(root, "packages", "a"), { recursive: true });
      writeFileSync(
        join(root, "packages", "a", "package.json"),
        JSON.stringify({ devDependencies: { vitest: "^4.0.0" } }),
      );
      spawnMock.mockReturnValueOnce(fakeChild({ stdout: "{}\n", exitCode: 0 }));

      await runTests({
        packages: ["a"],
        suite: "integration",
        files: ["src/a.test.ts", "src/a.integration.test.ts"],
      });

      expect(spawnMock.mock.calls[0]![1]).toEqual([
        "exec",
        "--filter",
        "a",
        "--",
        "vitest",
        "run",
        "--no-file-parallelism",
        "--testTimeout",
        "30000",
        "--reporter=json",
        "--no-color",
        "src/a.integration.test.ts",
      ]);
    } finally {
      rmSync(root, { recursive: true, force: true });
    }
  });

  it("preserves file filters for non-vitest package test scripts", async () => {
    const root = mkdtempSync(join(tmpdir(), "wp-vp-script-files-"));
    try {
      vi.stubEnv("CLAUDE_PROJECT_DIR", root);
      mkdirSync(join(root, "packages", "a"), { recursive: true });
      writeFileSync(
        join(root, "packages", "a", "package.json"),
        JSON.stringify({ scripts: { test: "node test-runner.js" } }),
      );
      spawnMock.mockReturnValueOnce(fakeChild({ stdout: "ok\n", exitCode: 0 }));

      await runTests({ packages: ["a"], files: ["src/a.test.ts"] });

      expect(spawnMock.mock.calls[0]![1]).toEqual([
        "run",
        "--filter",
        "a",
        "test",
        "--",
        "src/a.test.ts",
      ]);
    } finally {
      rmSync(root, { recursive: true, force: true });
    }
  });

  it("aggregates failure when one package fails", async () => {
    spawnMock
      .mockReturnValueOnce(fakeChild({ exitCode: 0 }))
      .mockReturnValueOnce(fakeChild({ stderr: "oops", exitCode: 1 }));
    const result = await runTests({ packages: ["a", "b"] });
    expect(result.passed).toBe(false);
    expect(result.exitCode).toBe(1);
    expect(result.output).toContain("oops");
  });

  it("stops package iteration after a timed out package", async () => {
    const killCapture: { signal: NodeJS.Signals | null } = { signal: null };
    spawnMock
      .mockReturnValueOnce(fakeChild({ hang: true, killCapture }))
      .mockReturnValueOnce(fakeChild({ stdout: "should-not-run\n", exitCode: 0 }));

    const result = await runTests({
      packages: ["a", "b"],
      timeoutMs: 1,
      workspaceSharding: { totalBudgetMs: 1_000 },
    });

    expect(spawnMock).toHaveBeenCalledTimes(1);
    expect(killCapture.signal).toBe("SIGTERM");
    expect(result.passed).toBe(false);
    expect(result.timedOut).toBe(true);
    expect(result.failureScope).toBe("package a");
  });

  it("runs bare `vp run test` when no packages or files given", async () => {
    spawnMock.mockReturnValue(fakeChild({ exitCode: 0 }));
    await runTests({});
    const [cmd, args] = spawnMock.mock.calls[0]!;
    expect(cmd).toBe("vp");
    expect(args).toEqual(["run", "test"]);
  });

  it("records workspace command scope when bare workspace run times out", async () => {
    const killCapture: { signal: NodeJS.Signals | null } = { signal: null };
    spawnMock.mockReturnValue(fakeChild({ hang: true, killCapture }));

    const result = await runTests({ timeoutMs: 1 });

    expect(killCapture.signal).toBe("SIGTERM");
    expect(result.timedOut).toBe(true);
    expect(result.failureScope).toBe("workspace command");
  });

  it("uses the repo test script for workspace runs even when the root declares vitest", async () => {
    writeVitestWorkspace(defaultRoot!);
    spawnMock.mockReturnValue(fakeChild({ exitCode: 0 }));

    await runTests({});

    const [cmd, args] = spawnMock.mock.calls[0]!;
    expect(cmd).toBe("vp");
    expect(args).toEqual(["run", "test"]);
  });

  it("bypasses a recursive workspace wp test script and runs vitest directly", async () => {
    writeFileSync(
      join(defaultRoot!, "package.json"),
      JSON.stringify({
        scripts: { test: "wp test" },
        devDependencies: { vitest: "^4.0.0" },
      }),
    );
    spawnMock.mockReturnValue(fakeChild({ exitCode: 0 }));

    await runTests({});

    const [cmd, args] = spawnMock.mock.calls[0]!;
    expect(cmd).toBe("vp");
    expect(args).toEqual(["exec", "--", "vitest", "run", "--reporter=json", "--no-color"]);
  });

  it("runs the selected workspace suite directly through vitest", async () => {
    spawnMock.mockReturnValue(fakeChild({ exitCode: 0 }));

    await runTests({ suite: "integration" });

    const [cmd, args] = spawnMock.mock.calls[0]!;
    expect(cmd).toBe("vp");
    expect(args).toEqual([
      "exec",
      "--",
      "vitest",
      "run",
      "--no-file-parallelism",
      ".integration.test.ts",
      ".e2e.test.ts",
      "--testTimeout",
      "30000",
      "--reporter=json",
      "--no-color",
    ]);
  });

  it("shards selected workspace suites by discovered matching test files", async () => {
    writeVitestWorkspace(defaultRoot!);
    const unitFiles = writeTestFiles(defaultRoot!, 6);
    writeFileSync(join(defaultRoot!, "src/slow.integration.test.ts"), "tiny integration");
    spawnMock.mockReturnValue(fakeChild({ stdout: "{}\n", exitCode: 0 }));

    await runTests({
      suite: "unit",
      workspaceSharding: {
        minFilesToShard: 2,
        targetFilesPerShard: 2,
        maxShards: 3,
        concurrency: 1,
      },
    });

    expect(spawnMock).toHaveBeenCalledTimes(3);
    const shardCalls = spawnMock.mock.calls.map((call) => call[1] as string[]);
    const executedFiles = shardCalls.flatMap((args) => testFileArgs(args)).sort();
    expect(executedFiles).toEqual(unitFiles.sort());
    expect(executedFiles).not.toContain("src/slow.integration.test.ts");
  });

  it("keeps unsharded sibling suite runs when suite=all partially shards", async () => {
    writeVitestWorkspace(defaultRoot!);
    writeTestFiles(defaultRoot!, 6);
    writeFileSync(join(defaultRoot!, "src/one.integration.test.ts"), "tiny integration");
    spawnMock.mockReturnValue(fakeChild({ stdout: "{}\n", exitCode: 0 }));

    await runTests({
      suite: "all",
      workspaceSharding: {
        minFilesToShard: 2,
        targetFilesPerShard: 2,
        maxShards: 3,
        concurrency: 1,
      },
    });

    expect(spawnMock).toHaveBeenCalledTimes(4);
    const shardCalls = spawnMock.mock.calls.map((call) => call[1] as string[]);
    expect(shardCalls.at(-1)).toEqual([
      "exec",
      "--",
      "vitest",
      "run",
      "--no-file-parallelism",
      ".integration.test.ts",
      ".e2e.test.ts",
      "--testTimeout",
      "30000",
      "--reporter=json",
      "--no-color",
    ]);
  });

  it("treats suite selection as a filter over explicit workspace file targets", async () => {
    writeVitestWorkspace(defaultRoot!);
    spawnMock.mockReturnValue(fakeChild({ stdout: "{}\n", exitCode: 0 }));

    await runTests({
      suite: "unit",
      files: ["src/a.test.ts", "src/slow.integration.test.ts"],
    });

    expect(spawnMock).toHaveBeenCalledOnce();
    expect(spawnMock.mock.calls[0]![1]).toEqual([
      "exec",
      "--",
      "vitest",
      "run",
      "--exclude",
      "**/*.integration.test.ts",
      "--exclude",
      "**/*.e2e.test.ts",
      "--reporter=json",
      "--no-color",
      "src/a.test.ts",
    ]);
  });

  it("does not broaden explicit file targets when no file matches the selected suite", async () => {
    writeVitestWorkspace(defaultRoot!);

    const result = await runTests({
      suite: "integration",
      files: ["src/a.test.ts"],
    });

    expect(spawnMock).not.toHaveBeenCalled();
    expect(result.passed).toBe(false);
    expect(result.failureScope).toBe("file-suite filter");
    expect(result.output).toContain("Refusing to expand 1 file target into a broader suite run");
  });

  it("shards root vitest workspace runs across discovered test files", async () => {
    writeVitestWorkspace(defaultRoot!);
    const files = writeTestFiles(defaultRoot!, 6);
    spawnMock.mockReturnValue(fakeChild({ stdout: "{}\n", exitCode: 0 }));

    await runTests({});

    expect(spawnMock).toHaveBeenCalledTimes(2);
    const shardCalls = spawnMock.mock.calls.map((call) => call[1] as string[]);
    for (const args of shardCalls) {
      expect(args.slice(0, 6)).toEqual([
        "exec",
        "--",
        "vitest",
        "run",
        "--reporter=json",
        "--no-color",
      ]);
    }

    const executedFiles = shardCalls.flatMap((args) => testFileArgs(args)).sort();
    expect(executedFiles).toEqual(files.sort());
  });

  it("shards explicit vitest file filters across multiple runs when the list is large", async () => {
    writeVitestWorkspace(defaultRoot!);
    const files = writeTestFiles(defaultRoot!, 6);
    spawnMock.mockReturnValue(fakeChild({ stdout: "{}\n", exitCode: 0 }));

    await runTests({ files });

    expect(spawnMock).toHaveBeenCalledTimes(2);
    const shardCalls = spawnMock.mock.calls.map((call) => call[1] as string[]);
    for (const args of shardCalls) {
      expect(args.slice(0, 6)).toEqual([
        "exec",
        "--",
        "vitest",
        "run",
        "--reporter=json",
        "--no-color",
      ]);
    }

    const executedFiles = shardCalls.flatMap((args) => testFileArgs(args)).sort();
    expect(executedFiles).toEqual(files.sort());
  });

  it("can disable workspace sharding explicitly for root vitest workspaces", async () => {
    writeVitestWorkspace(defaultRoot!);
    writeTestFiles(defaultRoot!, 6);
    spawnMock.mockReturnValue(fakeChild({ exitCode: 0 }));

    await runTests({ workspaceSharding: { enabled: false } });

    expect(spawnMock).toHaveBeenCalledTimes(1);
    const [cmd, args] = spawnMock.mock.calls[0]!;
    expect(cmd).toBe("vp");
    expect(args).toEqual(["run", "test"]);
  });

  it("respects custom shard sizing controls for larger workspaces", async () => {
    writeVitestWorkspace(defaultRoot!);
    const files = writeTestFiles(defaultRoot!, 10);
    spawnMock.mockReturnValue(fakeChild({ stdout: "{}\n", exitCode: 0 }));

    await runTests({
      workspaceSharding: {
        minFilesToShard: 2,
        targetFilesPerShard: 2,
        maxShards: 3,
        concurrency: 2,
      },
    });

    expect(spawnMock).toHaveBeenCalledTimes(3);
    const shardCalls = spawnMock.mock.calls.map((call) => call[1] as string[]);
    expect(shardCalls.every((args) => args.includes("--maxWorkers"))).toBe(true);
    const executedFiles = shardCalls.flatMap((args) => testFileArgs(args)).sort();
    expect(executedFiles).toEqual(files.sort());
  });

  it("runs workspace vitest shards concurrently and reports a timed out shard scope", async () => {
    writeVitestWorkspace(defaultRoot!);
    writeTestFiles(defaultRoot!, 6);
    const killCapture: { signal: NodeJS.Signals | null } = { signal: null };
    spawnMock
      .mockReturnValueOnce(fakeChild({ hang: true, killCapture }))
      .mockReturnValueOnce(fakeChild({ stdout: "{}\n", exitCode: 0 }));

    const result = await runTests({
      timeoutMs: 1,
      workspaceSharding: { totalBudgetMs: 1_000, concurrency: 2 },
    });

    expect(spawnMock).toHaveBeenCalledTimes(2);
    expect(killCapture.signal).toBe("SIGTERM");
    expect(result.passed).toBe(false);
    expect(result.timedOut).toBe(true);
    expect(result.output).toContain("scope: shard 1/2");
  });

  it("fails meaningfully when the global test budget is exhausted before a shard starts", async () => {
    writeVitestWorkspace(defaultRoot!);
    writeTestFiles(defaultRoot!, 6);
    const nowSpy = vi.spyOn(Date, "now");
    nowSpy.mockReturnValueOnce(1_000_000);
    nowSpy.mockReturnValueOnce(1_090_001);
    try {
      const result = await runTests({});

      expect(spawnMock).not.toHaveBeenCalled();
      expect(result.passed).toBe(false);
      expect(result.timedOut).toBe(true);
      expect(result.failureScope).toBe("overall test budget");
      expect(result.output).toContain("Global test budget exhausted before shard 1/2");
    } finally {
      nowSpy.mockRestore();
    }
  });

  it("uses explicit timeoutMs as the default total budget for sequential shard sequences", async () => {
    writeVitestWorkspace(defaultRoot!);
    writeTestFiles(defaultRoot!, 6);
    spawnMock.mockReturnValue(fakeChild({ stdout: "{}\n", exitCode: 0 }));
    const nowSpy = vi.spyOn(Date, "now");
    nowSpy.mockReturnValueOnce(1_000_000);
    nowSpy.mockReturnValueOnce(1_000_000);
    nowSpy.mockReturnValueOnce(1_090_001);
    try {
      const result = await runTests({ timeoutMs: 120_000, workspaceSharding: { concurrency: 1 } });

      expect(spawnMock).toHaveBeenCalledTimes(2);
      expect(result.passed).toBe(true);
      expect(result.timedOut).toBe(false);
    } finally {
      nowSpy.mockRestore();
    }
  });

  it("respects custom total budget for package sequences", async () => {
    spawnMock.mockReturnValue(fakeChild({ exitCode: 0 }));
    const nowSpy = vi.spyOn(Date, "now");
    nowSpy.mockReturnValueOnce(1_000_000);
    nowSpy.mockReturnValueOnce(1_000_000);
    nowSpy.mockReturnValueOnce(1_000_011);
    try {
      const result = await runTests({
        packages: ["a", "b"],
        workspaceSharding: { totalBudgetMs: 10 },
      });

      expect(spawnMock).toHaveBeenCalledTimes(1);
      expect(result.passed).toBe(false);
      expect(result.timedOut).toBe(true);
      expect(result.failureScope).toBe("overall test budget");
      expect(result.output).toContain("Global test budget exhausted before package b");
    } finally {
      nowSpy.mockRestore();
    }
  });

  it("fails closed instead of ignoring suite for non-vitest workspace file targets", async () => {
    const result = await runTests({ suite: "unit", files: ["src/a.test.ts"] });

    expect(spawnMock).not.toHaveBeenCalled();
    expect(result.passed).toBe(false);
    expect(result.failureScope).toBe("file-suite filter");
    expect(result.output).toContain("Refusing to ignore the suite filter");
  });

  it("runs `vp run test -- <files>` when files are given without packages", async () => {
    spawnMock.mockReturnValue(fakeChild({ exitCode: 0 }));
    await runTests({ files: ["a.test.ts", "b.test.ts"] });
    const [cmd, args] = spawnMock.mock.calls[0]!;
    expect(cmd).toBe("vp");
    expect(args).toEqual(["run", "test", "--", "a.test.ts", "b.test.ts"]);
  });

  it("runs vitest directly for file filters when the root declares vitest", async () => {
    writeFileSync(
      join(defaultRoot!, "package.json"),
      JSON.stringify({ scripts: { test: "vitest run" }, devDependencies: { vitest: "^4.0.0" } }),
    );
    spawnMock.mockReturnValue(fakeChild({ exitCode: 0 }));

    await runTests({ files: ["a.test.ts", "b.test.ts"] });

    const [cmd, args] = spawnMock.mock.calls[0]!;
    expect(cmd).toBe("vp");
    expect(args).toEqual([
      "exec",
      "--",
      "vitest",
      "run",
      "--reporter=json",
      "--no-color",
      "a.test.ts",
      "b.test.ts",
    ]);
  });

  it("distributes integration tests evenly across shards rather than clustering them", async () => {
    writeVitestWorkspace(defaultRoot!);
    mkdirSync(join(defaultRoot!, "src"), { recursive: true });

    // 24 unit files at normal byte size fill most shards
    for (let i = 1; i <= 24; i++) {
      writeFileSync(
        join(defaultRoot!, `src/unit-${i}.test.ts`),
        `import { it, expect } from 'vitest'\nit('unit-${i}', () => expect(1).toBe(1))\n`,
      );
    }

    // 8 integration files with tiny byte content (10 bytes each) — reproduces
    // the clustering bug: without the fix, byte-based weight sorts these last
    // and the greedy balancer piles all 8 into the lightest bucket
    for (let i = 1; i <= 8; i++) {
      writeFileSync(join(defaultRoot!, `src/int-${i}.integration.test.ts`), "tiny test");
    }

    spawnMock.mockReturnValue(fakeChild({ stdout: "{}\n", exitCode: 0 }));
    await runTests({});

    const shardArgs = spawnMock.mock.calls.map((call) => call[1] as string[]);
    const integrationCountPerShard = shardArgs.map(
      (args) => args.filter((arg) => arg.endsWith(".integration.test.ts")).length,
    );

    const totalIntegration = integrationCountPerShard.reduce((sum, n) => sum + n, 0);
    expect(totalIntegration).toStrictEqual(8);

    const maxPerShard = Math.max(...integrationCountPerShard);
    expect(maxPerShard).toBeLessThanOrEqual(2);
  });
});
