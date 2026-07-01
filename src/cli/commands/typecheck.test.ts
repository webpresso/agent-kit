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
      id: "typecheck-log",
      command: "typecheck",
      timestamp: "2026-06-14T00:00:00.000Z",
      exitCode: 0,
      logPath: "/tmp/typecheck-log",
      summary: "typecheck passed",
    },
  })),
  emitCliCommandOutput: vi.fn(),
}));

vi.mock("./quality-runner.js", () => qualityRunnerMocks);

import { installManagedRunnerHermeticHooks } from "#test-helpers/managed-runner";

import {
  TYPECHECK_COMMAND_HELP,
  buildTypecheckCommand,
  registerTypecheckCommand,
  runTypecheckCommand,
} from "./typecheck";

function buildFakeCli() {
  let registeredAction:
    | ((targetsOrFlags: unknown, maybeFlags?: Record<string, unknown>) => Promise<number>)
    | undefined;
  const options: string[] = [];
  const chain = {
    option: (name: string) => {
      options.push(name);
      return chain;
    },
    action: (fn: typeof registeredAction) => {
      registeredAction = fn;
      return chain;
    },
  };
  return {
    command: () => chain,
    getOptions: () => options,
    getAction: () => registeredAction,
  };
}

describe("wp typecheck command", () => {
  const tempDirs: string[] = [];

  installManagedRunnerHermeticHooks();

  function bundledVpArgs(...tail: string[]) {
    return [process.execPath, expect.stringMatching(/vite-plus.*bin.*vp/), ...tail];
  }

  afterEach(() => {
    for (const dir of tempDirs.splice(0)) rmSync(dir, { recursive: true, force: true });
    qualityRunnerMocks.runCliCommandSequence.mockClear();
    qualityRunnerMocks.emitCliCommandOutput.mockClear();
  });

  it("builds the default no-emit command with stable non-pretty output", () => {
    expect(buildTypecheckCommand()).toEqual({
      command: "rtk",
      args: [expect.stringContaining("typescript"), "--noEmit", "--pretty", "false"],
    });
  });

  it("can preserve pretty output when requested", () => {
    expect(buildTypecheckCommand({ pretty: true })).toEqual({
      command: "rtk",
      args: [expect.stringContaining("typescript"), "--noEmit"],
    });
  });

  it("uses the repo check-types script when package.json defines one", () => {
    const cwd = mkdtempSync(join(tmpdir(), "wp-typecheck-"));
    tempDirs.push(cwd);
    writeFileSync(
      join(cwd, "package.json"),
      JSON.stringify({ scripts: { "check-types": "tsgo --noEmit" } }),
      "utf8",
    );

    expect(buildTypecheckCommand({ cwd })).toEqual({
      command: "rtk",
      args: bundledVpArgs("run", "check-types"),
    });
  });

  it("bypasses a recursive check-types script and falls back to managed tsc", () => {
    const cwd = mkdtempSync(join(tmpdir(), "wp-typecheck-recursive-"));
    tempDirs.push(cwd);
    writeFileSync(
      join(cwd, "package.json"),
      JSON.stringify({ scripts: { "check-types": "wp typecheck" } }),
      "utf8",
    );

    expect(buildTypecheckCommand({ cwd })).toEqual({
      command: "rtk",
      args: [expect.stringContaining("typescript"), "--noEmit", "--pretty", "false"],
    });
  });

  it("exposes the summary-first --full escape hatch", () => {
    const cli = buildFakeCli();
    registerTypecheckCommand(cli as never);
    expect(cli.getOptions()).toContain("--full");
  });

  it("registers --file and --package targeting flags", () => {
    const cli = buildFakeCli();
    registerTypecheckCommand(cli as never);
    expect(cli.getOptions()).toContain("--file <path>");
    expect(cli.getOptions()).toContain("--package <name>");
    expect(cli.getOptions()).toContain("--affected");
    expect(cli.getOptions()).toContain("--branch");
  });

  it("documents that --file resolves owning scopes instead of isolated-file tsc", () => {
    expect(TYPECHECK_COMMAND_HELP).toContain("not isolated-file `tsc`");
    expect(TYPECHECK_COMMAND_HELP).toContain("wp typecheck --file src/index.ts");
    expect(TYPECHECK_COMMAND_HELP).toContain("wp typecheck --file src/a.ts src/b.ts");
    expect(TYPECHECK_COMMAND_HELP).toContain("wp typecheck --package @webpresso/agent-kit");
    expect(TYPECHECK_COMMAND_HELP).toContain("wp typecheck --affected");
  });

  it("keeps bare positional typecheck targets rejected so callers use --file", async () => {
    const cli = buildFakeCli();
    const error = vi.spyOn(console, "error").mockImplementation(() => {});
    registerTypecheckCommand(cli as never);

    await expect(cli.getAction()?.(["src/cli/commands/typecheck.ts"], {})).resolves.toBe(1);

    expect(error).toHaveBeenCalledWith("File targets must be passed with --file.");
  });

  it("accepts multiple file targets after one --file flag", async () => {
    const cli = buildFakeCli();
    registerTypecheckCommand(cli as never);

    await expect(
      cli.getAction()?.(["src/cli/commands/format.ts", "src/cli/commands/lint.ts"], {
        file: "src/cli/commands/typecheck.ts",
      }),
    ).resolves.toBe(0);

    expect(qualityRunnerMocks.runCliCommandSequence).toHaveBeenCalledWith(
      expect.objectContaining({
        commandName: "typecheck",
        metadataOptions: expect.objectContaining({
          files: [
            "src/cli/commands/typecheck.ts",
            "src/cli/commands/format.ts",
            "src/cli/commands/lint.ts",
          ],
          resolvedScopes: ["@webpresso/agent-kit"],
        }),
      }),
    );
  });

  it("rejects --file plus --package together", async () => {
    await expect(
      runTypecheckCommand({
        cwd: process.cwd(),
        files: ["src/index.ts"],
        packages: ["@webpresso/agent-kit"],
      }),
    ).rejects.toThrow(/Cannot use both --file and --package/i);
  });
});
