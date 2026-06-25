import {
  chmodSync,
  mkdirSync,
  mkdtempSync,
  realpathSync,
  rmSync,
  symlinkSync,
  writeFileSync,
} from "node:fs";
import { tmpdir } from "node:os";
import { delimiter, join } from "node:path";

import { describe, expect, it } from "vitest";

import { resolveGlobalCapableVp, resolveGlobalCapableVpCommand } from "./global-vp.js";

function mkroot(): string {
  return mkdtempSync(join(tmpdir(), "wp-global-vp-"));
}

function writeExecutable(path: string): void {
  writeFileSync(path, "#!/bin/sh\nexit 0\n");
  chmodSync(path, 0o755);
}

describe("resolveGlobalCapableVp", () => {
  it("skips runtime-local and project-local vp candidates before returning the global executable realpath", () => {
    const root = mkroot();
    try {
      const runtimeBin = join(root, ".vite-plus", "js_runtime", "node", "24.17.0", "bin");
      const projectBin = join(root, "repo", "node_modules", ".bin");
      const globalBin = join(root, ".vite-plus", "bin");
      mkdirSync(runtimeBin, { recursive: true });
      mkdirSync(projectBin, { recursive: true });
      mkdirSync(globalBin, { recursive: true });
      writeExecutable(join(runtimeBin, "vp"));
      writeExecutable(join(projectBin, "vp"));
      const globalVp = join(globalBin, "vp");
      writeExecutable(globalVp);

      expect(resolveGlobalCapableVp([runtimeBin, projectBin, globalBin].join(delimiter))).toBe(
        realpathSync(globalVp),
      );
    } finally {
      rmSync(root, { recursive: true, force: true });
    }
  });

  it("resolves symlinks and rejects realpaths inside the Vite+ runtime node tree", () => {
    const root = mkroot();
    try {
      const shimBin = join(root, "shim-bin");
      const runtimeBin = join(root, ".vite-plus", "js_runtime", "node", "24.17.0", "bin");
      const globalBin = join(root, ".vite-plus", "bin");
      mkdirSync(shimBin, { recursive: true });
      mkdirSync(runtimeBin, { recursive: true });
      mkdirSync(globalBin, { recursive: true });
      const runtimeVp = join(runtimeBin, "vp");
      writeExecutable(runtimeVp);
      symlinkSync(runtimeVp, join(shimBin, "vp"));
      const globalVp = join(globalBin, "vp");
      writeExecutable(globalVp);

      expect(resolveGlobalCapableVp([shimBin, globalBin].join(delimiter))).toBe(
        realpathSync(globalVp),
      );
    } finally {
      rmSync(root, { recursive: true, force: true });
    }
  });

  it("supports Windows executable suffixes when resolving PATH candidates", () => {
    const root = mkroot();
    try {
      const globalBin = join(root, ".vite-plus", "bin");
      mkdirSync(globalBin, { recursive: true });
      const globalVp = join(globalBin, "vp.cmd");
      writeFileSync(globalVp, "@echo off\r\n");

      expect(resolveGlobalCapableVp(globalBin, "win32")).toBe(realpathSync(globalVp));
    } finally {
      rmSync(root, { recursive: true, force: true });
    }
  });

  it("wraps Windows command scripts with cmd.exe when building a launch plan", () => {
    const root = mkroot();
    try {
      const globalBin = join(root, ".vite-plus", "bin");
      mkdirSync(globalBin, { recursive: true });
      const globalVp = join(globalBin, "vp.cmd");
      writeFileSync(globalVp, "@echo off\r\n");

      expect(
        resolveGlobalCapableVpCommand(globalBin, "win32", { ComSpec: "C:\\Windows\\cmd.exe" }),
      ).toStrictEqual({
        command: "C:\\Windows\\cmd.exe",
        argsPrefix: ["/d", "/s", "/c", realpathSync(globalVp)],
        executable: realpathSync(globalVp),
      });
    } finally {
      rmSync(root, { recursive: true, force: true });
    }
  });
});
