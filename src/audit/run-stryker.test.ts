import type { ChildProcess } from "node:child_process";
import type { spawn as SpawnType } from "node:child_process";
import { EventEmitter } from "node:events";

import { describe, expect, test, vi } from "vitest";

import { runStryker } from "./run-stryker.js";

function makeChild(exitCode: number | null, errorToThrow?: Error): ChildProcess {
  const emitter = new EventEmitter() as ChildProcess;
  emitter.stdin = null;
  emitter.stdout = null;
  emitter.stderr = null;
  setTimeout(() => {
    if (errorToThrow) {
      emitter.emit("error", errorToThrow);
    } else {
      emitter.emit("exit", exitCode);
    }
  }, 0);
  return emitter;
}

describe("runStryker", () => {
  test("spawn exits 0 → resolves 0", async () => {
    const child = makeChild(0);
    const spawnFn = vi.fn().mockReturnValue(child) as unknown as typeof SpawnType;
    const result = await runStryker("/some/cwd", { spawn: spawnFn });
    expect(result).toBe(0);
    expect(spawnFn).toHaveBeenCalledWith("vp", ["dlx", "stryker", "run"], {
      cwd: "/some/cwd",
      stdio: "inherit",
      shell: false,
    });
  });

  test("spawn exits 1 → resolves 1", async () => {
    const child = makeChild(1);
    const spawnFn = vi.fn().mockReturnValue(child) as unknown as typeof SpawnType;
    const result = await runStryker("/some/cwd", { spawn: spawnFn });
    expect(result).toBe(1);
  });

  test("spawn exits null → resolves 1 (null code fallback)", async () => {
    const child = makeChild(null);
    const spawnFn = vi.fn().mockReturnValue(child) as unknown as typeof SpawnType;
    const result = await runStryker("/some/cwd", { spawn: spawnFn });
    expect(result).toBe(1);
  });

  test("spawn errors → resolves 1 (error callback)", async () => {
    const child = makeChild(null, new Error("ENOENT"));
    const spawnFn = vi.fn().mockReturnValue(child) as unknown as typeof SpawnType;
    const result = await runStryker("/some/cwd", { spawn: spawnFn });
    expect(result).toBe(1);
    expect(spawnFn).toHaveBeenCalledWith("vp", ["dlx", "stryker", "run"], {
      cwd: "/some/cwd",
      stdio: "inherit",
      shell: false,
    });
  });

  test("passes cwd to spawn", async () => {
    const child = makeChild(0);
    const spawnFn = vi.fn().mockReturnValue(child) as unknown as typeof SpawnType;
    await runStryker("/custom/path", { spawn: spawnFn });
    expect(spawnFn).toHaveBeenCalledWith("vp", ["dlx", "stryker", "run"], {
      cwd: "/custom/path",
      stdio: "inherit",
      shell: false,
    });
  });
});
