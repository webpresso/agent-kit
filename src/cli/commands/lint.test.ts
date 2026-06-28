import path from "node:path";

import { afterEach, describe, expect, it, vi } from "vitest";

import type { ChangedFilesResult } from "#git/changed-files";

const qualityRunnerMocks = vi.hoisted(() => ({
  runCliCommandSequence: vi.fn(async () => ({
    exitCode: 0,
    timedOut: false,
    aborted: false,
    entry: {
      id: "lint-log",
      command: "lint",
      timestamp: "2026-06-22T00:00:00.000Z",
      exitCode: 0,
      logPath: "/tmp/lint-log",
      summary: "lint passed via vp lint",
    },
  })),
  emitCliCommandOutput: vi.fn(),
}));

vi.mock("./quality-runner.js", () => qualityRunnerMocks);

import { buildLintCommand, LINT_COMMAND_HELP, registerLintCommand } from "./lint.js";

function buildFakeCli() {
  const options: string[] = [];
  let capturedAction:
    | ((targetsOrFlags: unknown, maybeFlags?: Record<string, unknown>) => unknown)
    | undefined;
  const chain = {
    option: (name: string) => {
      options.push(name);
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
    getAction: () => capturedAction,
  };
}

function ok(files: string[]): ChangedFilesResult {
  return { files, degraded: false, reason: files.length === 0 ? "empty" : "ok" };
}

afterEach(() => {
  qualityRunnerMocks.runCliCommandSequence.mockClear();
  qualityRunnerMocks.emitCliCommandOutput.mockClear();
  vi.restoreAllMocks();
});

describe("wp lint command", () => {
  it("builds the lint command through vp with JSON output", () => {
    const command = buildLintCommand({ files: ["src/index.ts"], fix: true });
    expect(command.command).toBe(process.execPath);
    expect(command.args[0]).toEqual(expect.stringMatching(/vite-plus.*bin.*vp/));
    expect(command.args).toContain("lint");
    expect(command.args).toContain("--format=json");
    expect(command.args).toContain("--fix");
    expect(command.args).toContain("src/index.ts");
  });

  it("exposes affected-target options alongside the summary-first --full escape hatch", () => {
    const cli = buildFakeCli();
    registerLintCommand(cli as never);
    expect(cli.getOptions()).toContain("--file <path>");
    expect(cli.getOptions()).toContain("--affected");
    expect(cli.getOptions()).toContain("--branch");
    expect(cli.getOptions()).toContain("--full");
  });

  it("documents the standardized --affected syntax", () => {
    expect(LINT_COMMAND_HELP).toContain("wp lint --file src/a.ts src/b.ts");
    expect(LINT_COMMAND_HELP).toContain("wp lint --affected");
    expect(LINT_COMMAND_HELP).toContain("git add first");
  });

  it("accepts multiple file targets after one --file flag", async () => {
    const cli = buildFakeCli();
    registerLintCommand(cli as never);

    await expect(
      cli.getAction()?.(["src/cli/commands/lint.test.ts"], {
        file: "src/cli/commands/lint.ts",
      }),
    ).resolves.toBe(0);

    expect(qualityRunnerMocks.runCliCommandSequence).toHaveBeenCalledWith(
      expect.objectContaining({
        metadataOptions: expect.objectContaining({
          files: ["src/cli/commands/lint.ts", "src/cli/commands/lint.test.ts"],
        }),
        commands: [
          expect.objectContaining({
            args: expect.arrayContaining([
              "src/cli/commands/lint.ts",
              "src/cli/commands/lint.test.ts",
            ]),
          }),
        ],
      }),
    );
  });

  it("keeps bare positional lint targets rejected so callers use --file", async () => {
    const cli = buildFakeCli();
    const error = vi.spyOn(console, "error").mockImplementation(() => {});
    registerLintCommand(cli as never);

    await expect(cli.getAction()?.(["src/cli/commands/lint.ts"], {})).resolves.toBe(1);

    expect(error).toHaveBeenCalledWith("File targets must be passed with --file.");
    expect(qualityRunnerMocks.runCliCommandSequence).not.toHaveBeenCalled();
  });

  it("errors when --branch is provided without --affected", async () => {
    const cli = buildFakeCli();
    const error = vi.spyOn(console, "error").mockImplementation(() => {});
    registerLintCommand(cli as never);

    await expect(cli.getAction()?.({ branch: true })).resolves.toBe(1);
    expect(error).toHaveBeenCalledWith("--branch requires --affected");
    expect(qualityRunnerMocks.runCliCommandSequence).not.toHaveBeenCalled();
  });

  it("errors when --affected and --file are combined", async () => {
    const cli = buildFakeCli();
    const error = vi.spyOn(console, "error").mockImplementation(() => {});
    registerLintCommand(cli as never);

    await expect(cli.getAction()?.({ affected: true, file: "src/index.ts" })).resolves.toBe(1);
    expect(error).toHaveBeenCalledWith("Cannot use --affected and --file together.");
    expect(qualityRunnerMocks.runCliCommandSequence).not.toHaveBeenCalled();
  });

  it("uses staged lintable files for --affected", async () => {
    const cli = buildFakeCli();
    registerLintCommand(cli as never, {
      getStagedFiles: () => ok(["src/index.ts", "README.md"]),
    });

    await expect(cli.getAction()?.({ affected: true })).resolves.toBe(0);
    expect(qualityRunnerMocks.runCliCommandSequence).toHaveBeenCalledWith(
      expect.objectContaining({
        metadataOptions: expect.objectContaining({
          affected: true,
          branch: false,
          files: ["src/index.ts"],
        }),
        commands: [expect.objectContaining({ args: expect.arrayContaining(["src/index.ts"]) })],
      }),
    );
  });

  it("keeps repo-root-relative affected files when invoked from a subdirectory", async () => {
    const cli = buildFakeCli();
    const repoCwd = process.cwd();
    const cwdSpy = vi.spyOn(process, "cwd").mockReturnValue(path.join(repoCwd, "src"));
    registerLintCommand(cli as never, {
      getStagedFiles: () => ok(["src/cli/commands/lint.test.ts"]),
    });

    await expect(cli.getAction()?.({ affected: true })).resolves.toBe(0);
    expect(qualityRunnerMocks.runCliCommandSequence).toHaveBeenCalledWith(
      expect.objectContaining({
        cwd: repoCwd,
        metadataOptions: expect.objectContaining({ files: ["src/cli/commands/lint.test.ts"] }),
      }),
    );
    cwdSpy.mockRestore();
  });

  it("uses branch-changed lintable files for --affected --branch", async () => {
    const cli = buildFakeCli();
    registerLintCommand(cli as never, {
      getBranchChangedFiles: () => ok(["src/index.ts"]),
    });

    await expect(cli.getAction()?.({ affected: true, branch: true })).resolves.toBe(0);
    expect(qualityRunnerMocks.runCliCommandSequence).toHaveBeenCalledWith(
      expect.objectContaining({
        metadataOptions: expect.objectContaining({ affected: true, branch: true }),
        commands: [expect.objectContaining({ args: expect.arrayContaining(["src/index.ts"]) })],
      }),
    );
  });

  it("skips quickly when no staged lintable files remain after filtering", async () => {
    const cli = buildFakeCli();
    const log = vi.spyOn(console, "log").mockImplementation(() => {});
    registerLintCommand(cli as never, {
      getStagedFiles: () => ok(["README.md"]),
    });

    await expect(cli.getAction()?.({ affected: true })).resolves.toBe(0);
    expect(log).toHaveBeenCalledWith("No staged affected lintable files — skipping lint.");
    expect(qualityRunnerMocks.runCliCommandSequence).not.toHaveBeenCalled();
  });

  it("falls back to whole-repo lint on degraded read-only affected resolution", async () => {
    const cli = buildFakeCli();
    const error = vi.spyOn(console, "error").mockImplementation(() => {});
    registerLintCommand(cli as never, {
      getStagedFiles: () => ({ files: [], degraded: true, reason: "missing-base-ref" }),
    });

    await expect(cli.getAction()?.({ affected: true })).resolves.toBe(0);
    expect(error).toHaveBeenCalledWith(
      "Unable to determine affected files for lint (missing-base-ref); falling back to whole-repo lint.",
    );
    expect(qualityRunnerMocks.runCliCommandSequence).toHaveBeenCalledWith(
      expect.objectContaining({
        commands: [expect.objectContaining({ args: expect.arrayContaining(["."]) })],
      }),
    );
  });

  it("fails closed for degraded --affected --fix runs", async () => {
    const cli = buildFakeCli();
    const error = vi.spyOn(console, "error").mockImplementation(() => {});
    registerLintCommand(cli as never, {
      getStagedFiles: () => ({ files: [], degraded: true, reason: "git-error" }),
    });

    await expect(cli.getAction()?.({ affected: true, fix: true })).resolves.toBe(1);
    expect(error).toHaveBeenCalledWith(
      "Unable to determine affected files for lint --fix (git-error); refusing a degraded whole-repo write. Rerun without --affected or pass --file explicitly.",
    );
    expect(qualityRunnerMocks.runCliCommandSequence).not.toHaveBeenCalled();
  });
});
