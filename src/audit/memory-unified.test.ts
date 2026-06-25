import { mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";

import { auditMemoryUnified } from "./memory-unified.js";

describe("auditMemoryUnified", () => {
  let dirs: string[] = [];

  beforeEach(() => {
    dirs = [];
  });
  afterEach(() => {
    for (const d of dirs) rmSync(d, { recursive: true, force: true });
  });

  function tmp(): string {
    const d = mkdtempSync(join(tmpdir(), "wp-memory-unified-audit-"));
    dirs.push(d);
    return d;
  }

  it("passes (ok:true) and no violations when CLAUDE.md contains @AGENTS.md", async () => {
    const cwd = tmp();
    writeFileSync(join(cwd, "CLAUDE.md"), "# Instructions\n\n@AGENTS.md\n\nSome other content.\n");

    const result = await auditMemoryUnified(cwd);

    expect(result.ok).toBe(true);
    expect(result.violations).toHaveLength(0);
    expect(result.checked).toBe(1);
  });

  it("warns (ok:true, violation present) when CLAUDE.md lacks @AGENTS.md", async () => {
    const cwd = tmp();
    writeFileSync(join(cwd, "CLAUDE.md"), "# Instructions\n\nSome content without the import.\n");

    const result = await auditMemoryUnified(cwd);

    expect(result.ok).toBe(true); // warns, never fails
    expect(result.violations).toHaveLength(1);
    expect(result.violations[0]?.message).toContain("[warn]");
    expect(result.violations[0]?.message).toContain("@AGENTS.md");
  });

  it("passes silently (ok:true, no violations) when CLAUDE.md is absent", async () => {
    const cwd = tmp();

    const result = await auditMemoryUnified(cwd);

    expect(result.ok).toBe(true);
    expect(result.violations).toHaveLength(0);
    expect(result.checked).toBe(0);
  });

  it('title is "memory unified"', async () => {
    const cwd = tmp();
    writeFileSync(join(cwd, "CLAUDE.md"), "@AGENTS.md\n");

    const result = await auditMemoryUnified(cwd);

    expect(result.title).toBe("memory unified");
  });

  it("violation file is CLAUDE.md", async () => {
    const cwd = tmp();
    writeFileSync(join(cwd, "CLAUDE.md"), "# No import here\n");

    const result = await auditMemoryUnified(cwd);

    expect(result.violations[0]?.file).toBe("CLAUDE.md");
  });

  it("passes when @AGENTS.md appears mid-file", async () => {
    const cwd = tmp();
    const content = [
      "# Global instructions",
      "",
      "Some content here.",
      "",
      "@AGENTS.md",
      "",
      "More content after.",
    ].join("\n");
    writeFileSync(join(cwd, "CLAUDE.md"), content);

    const result = await auditMemoryUnified(cwd);

    expect(result.ok).toBe(true);
    expect(result.violations).toHaveLength(0);
  });
});
