import { chmodSync, mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

import { afterEach, describe, expect, it } from "vitest";

import { commandExists } from "#runtime/command-exists.js";

describe("commandExists", () => {
  const dirs = new Set<string>();

  afterEach(() => {
    for (const dir of dirs) rmSync(dir, { recursive: true, force: true });
    dirs.clear();
  });

  function tempPathDir(): string {
    const dir = mkdtempSync(join(tmpdir(), "wp-cmd-exists-"));
    dirs.add(dir);
    return dir;
  }

  describe("posix", () => {
    it("returns true for a regular executable file on PATH", () => {
      const dir = tempPathDir();
      const bin = join(dir, "mytool");
      writeFileSync(bin, "#!/bin/sh\n");
      chmodSync(bin, 0o755);
      expect(commandExists("mytool", { platform: "linux", pathEnv: dir })).toBe(true);
    });

    it("returns false when the command is absent from PATH", () => {
      const dir = tempPathDir();
      expect(commandExists("nope", { platform: "linux", pathEnv: dir })).toBe(false);
    });

    it("returns false for a present-but-non-executable file (the which-equivalence fix)", () => {
      const dir = tempPathDir();
      const file = join(dir, "notexec");
      writeFileSync(file, "data\n");
      chmodSync(file, 0o644);
      expect(commandExists("notexec", { platform: "linux", pathEnv: dir })).toBe(false);
    });

    it("returns false for a directory named like the command", () => {
      const dir = tempPathDir();
      mkdirSync(join(dir, "adir"));
      expect(commandExists("adir", { platform: "linux", pathEnv: dir })).toBe(false);
    });

    it("searches every PATH entry", () => {
      const a = tempPathDir();
      const b = tempPathDir();
      const bin = join(b, "second");
      writeFileSync(bin, "#!/bin/sh\n");
      chmodSync(bin, 0o755);
      expect(commandExists("second", { platform: "linux", pathEnv: `${a}:${b}` })).toBe(true);
    });
  });

  describe("win32 (the regression the old spawnSync(which) could never satisfy on posix CI)", () => {
    it("resolves a PATHEXT match (foo + .EXE) to true", () => {
      const dir = tempPathDir();
      // lowercase fixture name: PATHEXT entries are lowercased before matching, and a
      // posix host FS is case-sensitive, so the file must be lowercase to be found.
      writeFileSync(join(dir, "foo.exe"), "binary\n");
      expect(
        commandExists("foo", { platform: "win32", pathEnv: dir, pathExtEnv: ".EXE;.CMD" }),
      ).toBe(true);
    });

    it("does not require the executable bit on win32", () => {
      const dir = tempPathDir();
      const file = join(dir, "bar.cmd");
      writeFileSync(file, "echo hi\n");
      chmodSync(file, 0o644);
      expect(
        commandExists("bar", { platform: "win32", pathEnv: dir, pathExtEnv: ".EXE;.CMD" }),
      ).toBe(true);
    });

    it("returns false when only a non-PATHEXT extension exists", () => {
      const dir = tempPathDir();
      // baz.txt is not a PATHEXT variant of `baz` (.EXE/.CMD), nor the bare name.
      writeFileSync(join(dir, "baz.txt"), "not executable on win32\n");
      expect(
        commandExists("baz", { platform: "win32", pathEnv: dir, pathExtEnv: ".EXE;.CMD" }),
      ).toBe(false);
    });
  });

  describe("edge cases", () => {
    it("returns false for an empty command", () => {
      expect(commandExists("", { platform: "linux", pathEnv: tempPathDir() })).toBe(false);
    });

    it("returns false when PATH is empty", () => {
      expect(commandExists("mytool", { platform: "linux", pathEnv: "" })).toBe(false);
    });
  });
});
