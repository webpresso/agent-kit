import { EventEmitter } from "node:events";
import { describe, expect, it } from "vitest";

import { runShell } from "./shell.js";
import type { SpawnFn } from "./shell.js";

function makeFakeProcess(opts: {
  exitCode?: number;
  stdout?: string;
  stderr?: string;
  errorToEmit?: Error;
}) {
  const proc = new EventEmitter() as EventEmitter & {
    stdout: EventEmitter;
    stderr: EventEmitter;
  };
  proc.stdout = new EventEmitter();
  proc.stderr = new EventEmitter();

  setImmediate(() => {
    if (opts.errorToEmit) {
      proc.emit("error", opts.errorToEmit);
      return;
    }
    if (opts.stdout) {
      proc.stdout.emit("data", Buffer.from(opts.stdout));
    }
    if (opts.stderr) {
      proc.stderr.emit("data", Buffer.from(opts.stderr));
    }
    proc.emit("close", opts.exitCode ?? 0);
  });

  return proc;
}

describe("runShell", () => {
  it("returns exitCode 0 when fake spawn closes with 0", async () => {
    const fakeSpawn: SpawnFn = () => makeFakeProcess({ exitCode: 0 }) as ReturnType<SpawnFn>;

    const result = await runShell({ command: "echo", args: ["hi"] }, fakeSpawn);

    expect(result.exitCode).toEqual(0);
  });

  it("returns exitCode 1 when fake spawn closes with 1", async () => {
    const fakeSpawn: SpawnFn = () => makeFakeProcess({ exitCode: 1 }) as ReturnType<SpawnFn>;

    const result = await runShell({ command: "false", args: [] }, fakeSpawn);

    expect(result.exitCode).toEqual(1);
  });

  it("captures stdout and stderr from fake spawn", async () => {
    const fakeSpawn: SpawnFn = () =>
      makeFakeProcess({
        exitCode: 0,
        stdout: "out data",
        stderr: "err data",
      }) as ReturnType<SpawnFn>;

    const result = await runShell({ command: "cmd", args: [] }, fakeSpawn);

    expect(result.stdout).toEqual("out data");
    expect(result.stderr).toEqual("err data");
  });

  it("rejects when fake spawn emits an error event", async () => {
    const fakeSpawn: SpawnFn = () =>
      makeFakeProcess({ errorToEmit: new Error("spawn ENOENT") }) as ReturnType<SpawnFn>;

    await expect(runShell({ command: "nonexistent", args: [] }, fakeSpawn)).rejects.toThrow(
      "spawn ENOENT",
    );
  });
});
