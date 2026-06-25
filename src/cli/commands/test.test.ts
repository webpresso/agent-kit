import { mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

import { afterEach, describe, expect, it, vi } from "vitest";

const qualityRunnerMocks = vi.hoisted(() => ({
  runCliCommandSequence: vi.fn(async () => ({
    exitCode: 0,
    timedOut: false,
    aborted: false,
    entry: {
      id: "test-log",
      command: "test",
      timestamp: "2026-06-14T00:00:00.000Z",
      exitCode: 0,
      logPath: "/tmp/test-log",
      summary: "test passed",
    },
  })),
  emitCliCommandOutput: vi.fn(),
}));

vi.mock("./quality-runner.js", () => qualityRunnerMocks);

import { installManagedRunnerHermeticHooks } from "#test-helpers/managed-runner";
import { isCommandSequenceConfig } from "#test";
import { createAkTestCommandConfig, registerTestCommand, TEST_COMMAND_HELP } from "./test.js";
import type { ChangedFilesResult } from "#git/changed-files";

function buildFakeCli() {
  const options: string[] = [];
  const optionDescriptions = new Map<string, string>();
  let capturedAction: ((flags: Record<string, unknown>) => unknown) | undefined;
  const chain = {
    option: (name: string, description: string) => {
      options.push(name);
      optionDescriptions.set(name, description);
      return chain;
    },
    action: (fn: typeof capturedAction) => {
      capturedAction = fn;
      return chain;
    },
  };
  return {
    command: () => chain,
    getOptions: () => options,
    getOptionDescriptions: () => optionDescriptions,
    getAction: () => capturedAction,
  };
}

const tempDirs: string[] = [];

installManagedRunnerHermeticHooks();

function bundledVpArgs(...tail: string[]) {
  return [process.execPath, expect.stringMatching(/vite-plus.*bin.*vp/), ...tail];
}

function ok(files: string[]): ChangedFilesResult {
  return { files, degraded: false, reason: files.length === 0 ? "empty" : "ok" };
}

afterEach(() => {
  while (tempDirs.length > 0) rmSync(tempDirs.pop()!, { recursive: true, force: true });
  qualityRunnerMocks.runCliCommandSequence.mockClear();
  qualityRunnerMocks.emitCliCommandOutput.mockClear();
});

describe("wp test command helpers", () => {
  it("documents package and file target flags", () => {
    expect(TEST_COMMAND_HELP).toContain("wp test --suite unit");
    expect(TEST_COMMAND_HELP).toContain("wp test --suite integration");
    expect(TEST_COMMAND_HELP).toContain("wp test --package cli2");
    expect(TEST_COMMAND_HELP).toContain("wp test --file apps/cli2/src/commands/target.test.ts");
  });

  it("builds package-target commands through the managed runtime core with passthrough args", () => {
    expect(
      createAkTestCommandConfig({
        package: ["cli2"],
        passthrough: ["--reporter=dot"],
      }),
    ).toEqual({
      command: "rtk",
      args: bundledVpArgs("run", "cli2", "test", "--", "--reporter=dot"),
    });
  });

  it("builds file-target commands through the managed runtime core", () => {
    expect(
      createAkTestCommandConfig({
        file: ["apps/cli2/src/commands/target.test.ts"],
      }),
    ).toEqual({
      command: "rtk",
      args: [expect.stringContaining("vitest"), "run", "apps/cli2/src/commands/target.test.ts"],
    });
  });

  it("treats suite selection as a filter over explicit file targets", () => {
    expect(
      createAkTestCommandConfig({
        suite: "unit",
        file: ["apps/cli2/src/commands/target.test.ts"],
      }),
    ).toEqual({
      command: "rtk",
      args: [
        expect.stringContaining("vitest"),
        "run",
        "--exclude",
        "**/*.integration.test.ts",
        "--exclude",
        "**/*.e2e.test.ts",
        "apps/cli2/src/commands/target.test.ts",
      ],
    });
  });

  it("builds a two-phase command sequence for suite=all", () => {
    const command = createAkTestCommandConfig({ suite: "all" });
    expect(isCommandSequenceConfig(command)).toBe(true);
    if (!isCommandSequenceConfig(command)) return;

    expect(command.sequence).toHaveLength(2);
    expect(command.sequence[0]?.args).toEqual([
      expect.stringContaining("vitest"),
      "run",
      "--exclude",
      "**/*.integration.test.ts",
      "--exclude",
      "**/*.e2e.test.ts",
    ]);
    expect(command.sequence[1]?.args).toEqual([
      expect.stringContaining("vitest"),
      "run",
      "--no-file-parallelism",
      ".integration.test.ts",
      ".e2e.test.ts",
      "--testTimeout",
      "30000",
    ]);
  });

  it("avoids recursion when the local package script is wp test", () => {
    const cwd = mkdtempSync(join(tmpdir(), "wp-cli-test-recursive-"));
    tempDirs.push(cwd);
    writeFileSync(
      join(cwd, "package.json"),
      JSON.stringify({
        scripts: { test: "wp test" },
        devDependencies: { vitest: "^4.0.0" },
      }),
      "utf8",
    );

    expect(createAkTestCommandConfig({ cwd })).toEqual({
      command: "rtk",
      args: [expect.stringContaining("vitest"), "run"],
    });
  });

  it("exposes affected-target options", () => {
    const cli = buildFakeCli();
    registerTestCommand(cli as never);
    expect(cli.getOptions()).toContain("--affected");
    expect(cli.getOptions()).toContain("--branch");
  });

  it("documents the --affected inner-loop contract", () => {
    expect(TEST_COMMAND_HELP).toContain("wp test --affected");
    expect(TEST_COMMAND_HELP).toContain("full `wp test` / `wp qa` remains the bookend gate");
  });

  it("errors when --branch is provided without --affected", async () => {
    const cli = buildFakeCli();
    const error = vi.spyOn(console, "error").mockImplementation(() => {});
    registerTestCommand(cli as never);

    await expect(cli.getAction()?.({ branch: true })).resolves.toBe(1);
    expect(error).toHaveBeenCalledWith("--branch requires --affected");
    expect(qualityRunnerMocks.runCliCommandSequence).not.toHaveBeenCalled();
  });

  it("errors when --affected is combined with package targets", async () => {
    const cli = buildFakeCli();
    const error = vi.spyOn(console, "error").mockImplementation(() => {});
    registerTestCommand(cli as never);

    await expect(cli.getAction()?.({ affected: true, package: "cli2" })).resolves.toBe(1);
    expect(error).toHaveBeenCalledWith("Cannot use --affected with --file or --package.");
    expect(qualityRunnerMocks.runCliCommandSequence).not.toHaveBeenCalled();
  });

  it("errors when --affected is combined with explicit targets", async () => {
    const cli = buildFakeCli();
    const error = vi.spyOn(console, "error").mockImplementation(() => {});
    registerTestCommand(cli as never);

    await expect(cli.getAction()?.({ affected: true, file: "src/foo.test.ts" })).resolves.toBe(1);
    expect(error).toHaveBeenCalledWith("Cannot use --affected with --file or --package.");
    expect(qualityRunnerMocks.runCliCommandSequence).not.toHaveBeenCalled();
  });

  it("uses discovered staged test files for --affected", async () => {
    const cli = buildFakeCli();
    registerTestCommand(cli as never, {
      getStagedFiles: () => ok(["src/index.ts"]),
      discoverTestFiles: () => ["src/cli/commands/test.test.ts"],
    });

    await expect(cli.getAction()?.({ affected: true })).resolves.toBe(0);

    expect(qualityRunnerMocks.runCliCommandSequence).toHaveBeenCalledWith(
      expect.objectContaining({
        metadataOptions: expect.objectContaining({
          affected: true,
          branch: false,
          file: ["src/cli/commands/test.test.ts"],
        }),
        commands: [
          expect.objectContaining({
            args: expect.arrayContaining(["run", "src/cli/commands/test.test.ts"]),
          }),
        ],
      }),
    );
  });

  it("uses branch-discovered test files for --affected --branch", async () => {
    const cli = buildFakeCli();
    registerTestCommand(cli as never, {
      getBranchChangedFiles: () => ok(["src/index.ts"]),
      discoverTestFiles: () => ["src/cli/commands/test.test.ts"],
    });

    await expect(cli.getAction()?.({ affected: true, branch: true })).resolves.toBe(0);

    expect(qualityRunnerMocks.runCliCommandSequence).toHaveBeenCalledWith(
      expect.objectContaining({
        metadataOptions: expect.objectContaining({
          affected: true,
          branch: true,
          file: ["src/cli/commands/test.test.ts"],
        }),
      }),
    );
  });

  it("keeps repo-root-relative discovered tests when invoked from a subdirectory", async () => {
    const cli = buildFakeCli();
    const repoCwd = process.cwd();
    const cwdSpy = vi.spyOn(process, "cwd").mockReturnValue(join(repoCwd, "src"));
    registerTestCommand(cli as never, {
      getStagedFiles: () => ok(["src/index.ts"]),
      discoverTestFiles: () => ["src/cli/commands/test.test.ts"],
    });

    await expect(cli.getAction()?.({ affected: true })).resolves.toBe(0);
    expect(qualityRunnerMocks.runCliCommandSequence).toHaveBeenCalledWith(
      expect.objectContaining({
        cwd: repoCwd,
        metadataOptions: expect.objectContaining({ file: ["src/cli/commands/test.test.ts"] }),
      }),
    );
    cwdSpy.mockRestore();
  });

  it("skips quickly when no affected tests are discovered", async () => {
    const cli = buildFakeCli();
    const log = vi.spyOn(console, "log").mockImplementation(() => {});
    registerTestCommand(cli as never, {
      getStagedFiles: () => ok(["src/index.ts"]),
      discoverTestFiles: () => [],
    });

    await expect(cli.getAction()?.({ affected: true })).resolves.toBe(0);
    expect(log).toHaveBeenCalledWith("No staged affected test files found — skipping test.");
    expect(qualityRunnerMocks.runCliCommandSequence).not.toHaveBeenCalled();
  });

  it("falls back to the full suite when affected resolution is degraded", async () => {
    const cli = buildFakeCli();
    const error = vi.spyOn(console, "error").mockImplementation(() => {});
    registerTestCommand(cli as never, {
      getStagedFiles: () => ({ files: [], degraded: true, reason: "missing-base-ref" }),
    });

    await expect(cli.getAction()?.({ affected: true })).resolves.toBe(0);
    expect(error).toHaveBeenCalledWith(
      "Unable to determine affected files for test (missing-base-ref); falling back to the full test surface.",
    );
    expect(qualityRunnerMocks.runCliCommandSequence).toHaveBeenCalledWith(
      expect.objectContaining({
        metadataOptions: expect.objectContaining({
          affected: true,
          branch: false,
          file: [],
          package: [],
        }),
      }),
    );
  });

  it("exposes the summary-first --full escape hatch", () => {
    const cli = buildFakeCli();
    registerTestCommand(cli as never);
    expect(cli.getOptions()).toContain("--full");
    expect(cli.getOptionDescriptions().get("--full")).toMatch(/full raw output/i);
    expect(cli.getOptionDescriptions().get("--full")).toMatch(/summary-first/i);
  });

  it("threads --full through to the shared summary-first renderer as a boolean opt-out", async () => {
    const cli = buildFakeCli();
    registerTestCommand(cli as never);
    const action = cli.getAction();
    expect(action).toBeTypeOf("function");

    await action?.({ full: true });

    expect(qualityRunnerMocks.emitCliCommandOutput).toHaveBeenCalledWith(
      expect.objectContaining({
        full: true,
        toolName: "wp_test",
      }),
    );

    qualityRunnerMocks.emitCliCommandOutput.mockClear();
    await action?.({});

    expect(qualityRunnerMocks.emitCliCommandOutput).toHaveBeenCalledWith(
      expect.objectContaining({
        full: false,
        toolName: "wp_test",
      }),
    );
  });
});
