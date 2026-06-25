import { mkdtempSync, mkdirSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";

import { afterEach, describe, expect, it } from "vitest";

import { auditNoLegacyCliBin } from "./no-legacy-cli-bin.js";

const cleanupDirs: string[] = [];

afterEach(() => {
  for (const dir of cleanupDirs.splice(0)) {
    try {
      rmSync(dir, { recursive: true, force: true });
    } catch {
      // best effort in tests
    }
  }
});

function createFixture(structure: Record<string, string>): string {
  const root = mkdtempSync(join(tmpdir(), "wp-no-legacy-cli-bin-"));
  cleanupDirs.push(root);
  for (const [relativePath, content] of Object.entries(structure)) {
    const absolutePath = join(root, relativePath);
    mkdirSync(dirname(absolutePath), { recursive: true });
    writeFileSync(absolutePath, content);
  }
  return root;
}

describe("auditNoLegacyCliBin", () => {
  it("fails active user-facing legacy command mentions", () => {
    const root = createFixture({
      "catalog/README.md": "Run `ak setup` to scaffold this repo.\n",
    });

    const result = auditNoLegacyCliBin(root);
    expect(result.ok).toBe(false);
    expect(result.violations[0]?.message).toContain("ak setup");
  });

  it("allows current-state migration wording when the exact replacement is present", () => {
    const root = createFixture({
      "catalog/README.md":
        "Current-state only: `ak setup` still runs today; future replacement: `webpresso agent setup`.\n",
    });

    const result = auditNoLegacyCliBin(root);
    expect(result.ok).toBe(true);
    expect(result.violations).toHaveLength(0);
  });

  it("ignores historical completed blueprint evidence", () => {
    const root = createFixture({
      "blueprints/completed/old/_overview.md":
        "Historical evidence mentions `ak bench session-memory`.\n",
    });

    const result = auditNoLegacyCliBin(root);
    expect(result.ok).toBe(true);
    expect(result.violations).toHaveLength(0);
  });

  it("allows wp because AGENTS.md defines it as the canonical current CLI", () => {
    const root = createFixture({
      "catalog/README.md": "Run `wp setup` to scaffold this repo.\n",
    });

    const result = auditNoLegacyCliBin(root);
    expect(result.ok).toBe(true);
    expect(result.violations).toHaveLength(0);
  });

  it("allows internal hook helper mentions", () => {
    const root = createFixture({
      "src/internal.md":
        "Internal hook helper `wp-pretool-guard` remains generated-hook-only and is not a public command.\n",
    });

    const result = auditNoLegacyCliBin(root);
    expect(result.ok).toBe(true);
  });
});
