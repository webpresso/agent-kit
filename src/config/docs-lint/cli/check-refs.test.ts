import { mkdtempSync, rmSync, symlinkSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { validateFile } from "./check-refs.js";

describe("check-refs validateFile", () => {
  let dir: string;

  beforeEach(() => {
    dir = mkdtempSync(join(tmpdir(), "check-refs-"));
  });

  afterEach(() => {
    rmSync(dir, { recursive: true, force: true });
  });

  it("skips a dangling symlink with a warning instead of throwing ENOENT", () => {
    // Simulates a stale projected agent-rule surface like
    // `.claude/rules/webpresso-routing.md` whose source no longer exists.
    const broken = join(dir, "broken.md");
    symlinkSync(join(dir, "does-not-exist.md"), broken);
    const warn = vi.spyOn(console, "warn").mockImplementation(() => {});

    const result = validateFile(broken);

    expect(result).toStrictEqual([]);
    expect(warn).toHaveBeenCalledWith(expect.stringContaining("broken symlink"));
    warn.mockRestore();
  });

  it("skips an existing-but-unreadable path (EISDIR) with a warning", () => {
    // A directory exists but readFileSync throws EISDIR — must not crash.
    const warn = vi.spyOn(console, "warn").mockImplementation(() => {});

    const result = validateFile(dir);

    expect(result).toStrictEqual([]);
    expect(warn).toHaveBeenCalledWith(expect.stringContaining("skipping unreadable path"));
    warn.mockRestore();
  });

  it("still reports a dead reference in a readable file", () => {
    const doc = join(dir, "doc.md");
    writeFileSync(doc, "See `packages/does-not-exist/foo.ts` for details.\n");

    const result = validateFile(doc);

    expect(result).toHaveLength(1);
    expect(result[0]?.reference).toStrictEqual("packages/does-not-exist/foo.ts");
  });
});
