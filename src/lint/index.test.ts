import { mkdtempSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, describe, expect, it, vi } from "vitest";

const getManagedRunner = vi.hoisted(() => vi.fn());
const spawnMock = vi.hoisted(() => vi.fn());

vi.mock("#tool-runtime", () => ({
  getManagedRunner,
}));

getManagedRunner.mockReturnValue({
  command: "vp",
  args: [],
});

vi.mock("node:child_process", () => ({
  spawn: spawnMock,
}));

import { runLint } from "./index.js";

function fakeChild(
  opts: {
    stdout?: string;
    stderr?: string;
    exitCode?: number;
    error?: NodeJS.ErrnoException;
  } = {},
): unknown {
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
    on: (event: string, fn: (arg: unknown) => void) => {
      if (event === "error" && opts.error) {
        queueMicrotask(() => fn(opts.error));
        return;
      }
      if (event === "close" && !opts.error) {
        queueMicrotask(() => fn(opts.exitCode ?? 0));
      }
    },
  };
}

function makeFixtureDir(): string {
  return mkdtempSync(join(tmpdir(), "wp-lint-fixture-"));
}

afterEach(() => {
  getManagedRunner.mockReset();
  getManagedRunner.mockReturnValue({
    command: "vp",
    args: [],
  });
  spawnMock.mockReset();
});

describe("runLint", () => {
  it("routes lint through the managed runtime boundary", async () => {
    getManagedRunner.mockReturnValue({ command: "vp", args: [] });
    spawnMock.mockReturnValue(
      fakeChild({
        stdout: JSON.stringify([]),
        exitCode: 0,
      }),
    );
    const dir = makeFixtureDir();
    writeFileSync(join(dir, "a.ts"), "const x = 'hi'\n");

    const result = await runLint({ cwd: dir, files: ["a.ts"] });

    expect(result.passed).toBe(true);
    expect(getManagedRunner).toHaveBeenCalledWith("vp", { outputPolicy: "structured" });
    const [cmd, args] = spawnMock.mock.calls[0]!;
    expect(cmd).toBe("vp");
    expect(args).toEqual(["lint", "--format=json", "a.ts"]);
  });
});
