import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

import { afterEach, describe, expect, it } from "vitest";

import { resolveAgentKitPackageRootOrThrow } from "./package-root.js";
import {
  assertManagedSkillSourcesPresent,
  findMissingManagedSkillSources,
  isProjectedManagedSkillSlug,
  OPTIONAL_SHARED_SKILLS,
  RENDERED_SKILLS,
  SHARED_FAVORITE_SKILLS,
} from "./scaffold-agent.js";

describe("managed init skill sources", () => {
  const cleanup = new Set<string>();

  afterEach(() => {
    for (const dir of cleanup) rmSync(dir, { recursive: true, force: true });
    cleanup.clear();
  });

  it("keeps shared, optional, and rendered skills backed by canonical sources", () => {
    const packageRoot = resolveAgentKitPackageRootOrThrow("expected agent-kit package root", {
      moduleUrl: import.meta.url,
      requireCatalog: true,
    });

    const missing = findMissingManagedSkillSources(packageRoot, [
      ...SHARED_FAVORITE_SKILLS,
      ...OPTIONAL_SHARED_SKILLS,
      ...RENDERED_SKILLS,
    ]);

    expect(missing).toEqual([]);
  });

  it("treats bootstrap-only selections as non-projected while keeping projected skills enforced", () => {
    expect(isProjectedManagedSkillSlug("base-kit")).toBe(false);
    expect(isProjectedManagedSkillSlug("tanstack-query")).toBe(true);
  });

  it("fails fast with a helpful error when a declared skill source is missing", () => {
    const packageRoot = mkdtempSync(join(tmpdir(), "wp-managed-skill-sources-"));
    cleanup.add(packageRoot);

    mkdirSync(join(packageRoot, "catalog", "agent", "skills", "verify"), { recursive: true });
    writeFileSync(
      join(packageRoot, "catalog", "agent", "skills", "verify", "SKILL.md"),
      "---\nname: verify\n---\n",
    );

    expect(() =>
      assertManagedSkillSourcesPresent(packageRoot, ["verify", "missing-skill"]),
    ).toThrow(/missing canonical skill source\(s\): missing-skill/u);
  });
});
