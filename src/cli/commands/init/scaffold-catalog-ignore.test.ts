import { mkdirSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";

import { scaffoldCatalogIgnore } from "./scaffold-catalog-ignore.js";

describe("scaffoldCatalogIgnore", () => {
  let cwd: string;
  let catalogDir: string;

  beforeEach(() => {
    const root = join(
      tmpdir(),
      `wp-catalog-ignore-${Date.now()}-${Math.random().toString(36).slice(2)}`,
    );
    cwd = join(root, "consumer");
    catalogDir = join(root, "catalog");
    mkdirSync(cwd, { recursive: true });
    mkdirSync(join(catalogDir, "agent", "skills", "alpha-skill"), { recursive: true });
    mkdirSync(join(catalogDir, "agent", "skills", "beta-skill"), { recursive: true });
    mkdirSync(join(catalogDir, "agent", "rules"), { recursive: true });
    writeFileSync(join(catalogDir, "agent", "rules", "one-rule.md"), "# one");
    writeFileSync(join(catalogDir, "agent", "rules", "two-rule.md"), "# two");
    writeFileSync(join(catalogDir, "agent", "rules", "README.md"), "# readme — must skip");
  });

  afterEach(() => {
    rmSync(cwd, { recursive: true, force: true });
    rmSync(catalogDir, { recursive: true, force: true });
  });

  it("writes a sorted catalog-installed block with skills and rules", () => {
    const { results, skillNames, ruleNames } = scaffoldCatalogIgnore({ cwd, catalogDir });

    expect(skillNames).toStrictEqual(["alpha-skill", "beta-skill"]);
    expect(ruleNames).toStrictEqual(["one-rule", "two-rule"]);
    expect(results[0]?.action).toBe("created");

    const gi = readFileSync(join(cwd, ".gitignore"), "utf8");
    expect(gi).toContain("# >>> managed by webpresso (catalog-installed)");
    expect(gi).toContain("agent-skills/alpha-skill/");
    expect(gi).toContain("agent-skills/beta-skill/");
    expect(gi).toContain("agent-rules/one-rule.md");
    expect(gi).toContain("agent-rules/two-rule.md");
    expect(gi).not.toContain("agent-rules/README.md");
    expect(gi).toContain("# <<< managed by webpresso (catalog-installed)");
  });

  it("is idempotent on a second run", () => {
    scaffoldCatalogIgnore({ cwd, catalogDir });
    const before = readFileSync(join(cwd, ".gitignore"), "utf8");

    const { results } = scaffoldCatalogIgnore({ cwd, catalogDir });
    expect(results[0]?.action).toBe("identical");
    expect(readFileSync(join(cwd, ".gitignore"), "utf8")).toBe(before);
  });

  it("overwrites when catalog list changes", () => {
    scaffoldCatalogIgnore({ cwd, catalogDir });

    mkdirSync(join(catalogDir, "agent", "skills", "gamma-skill"), { recursive: true });
    rmSync(join(catalogDir, "agent", "rules", "two-rule.md"));

    const { results } = scaffoldCatalogIgnore({ cwd, catalogDir, overwrite: true });
    expect(results[0]?.action).toBe("overwritten");

    const gi = readFileSync(join(cwd, ".gitignore"), "utf8");
    expect(gi).toContain("agent-skills/gamma-skill/");
    expect(gi).not.toContain("agent-rules/two-rule.md");
  });

  it("preserves unrelated managed blocks", () => {
    writeFileSync(
      join(cwd, ".gitignore"),
      "node_modules/\n# >>> managed by webpresso (skill-sync)\n.claude/skills/\n# <<< managed by webpresso (skill-sync)\n",
    );
    scaffoldCatalogIgnore({ cwd, catalogDir });

    const gi = readFileSync(join(cwd, ".gitignore"), "utf8");
    expect(gi).toContain("# >>> managed by webpresso (skill-sync)");
    expect(gi).toContain(".claude/skills/");
    expect(gi).toContain("# >>> managed by webpresso (catalog-installed)");
    expect(gi).toContain("agent-skills/alpha-skill/");
  });

  it("re-adds the block when deleted, without touching unrelated entries", () => {
    const unrelatedBefore = [
      "node_modules/",
      "dist/",
      ".env",
      "# >>> managed by webpresso (skill-sync)",
      ".claude/skills/",
      "# <<< managed by webpresso (skill-sync)",
      "# user comment that must survive",
      "coverage/",
      "",
    ].join("\n");
    writeFileSync(join(cwd, ".gitignore"), unrelatedBefore);

    const { results } = scaffoldCatalogIgnore({ cwd, catalogDir });
    expect(results[0]?.action).toBe("overwritten");

    const after = readFileSync(join(cwd, ".gitignore"), "utf8");

    expect(after.startsWith(unrelatedBefore)).toBe(true);

    expect(after).toContain("# >>> managed by webpresso (skill-sync)");
    expect(after).toContain(".claude/skills/");
    expect(after).toContain("# user comment that must survive");

    expect(after).toContain("# >>> managed by webpresso (catalog-installed)");
    expect(after).toContain("agent-skills/alpha-skill/");
    expect(after).toContain("# <<< managed by webpresso (catalog-installed)");

    expect(after.split("# >>> managed by webpresso (skill-sync)").length - 1).toBe(1);
    expect(after.split("# >>> managed by webpresso (catalog-installed)").length - 1).toBe(1);
  });

  it("delete + re-add round-trip is byte-identical", () => {
    scaffoldCatalogIgnore({ cwd, catalogDir });
    const original = readFileSync(join(cwd, ".gitignore"), "utf8");

    const stripped = original.replace(
      /\n?# >>> managed by webpresso \(catalog-installed\)[\s\S]*?# <<< managed by webpresso \(catalog-installed\)\n?/,
      "\n",
    );
    writeFileSync(join(cwd, ".gitignore"), stripped);

    scaffoldCatalogIgnore({ cwd, catalogDir });
    const restored = readFileSync(join(cwd, ".gitignore"), "utf8");

    expect(restored).toBe(original);
  });

  it("handles a .gitignore that does not end with a trailing newline", () => {
    writeFileSync(join(cwd, ".gitignore"), "node_modules/\ndist/");

    scaffoldCatalogIgnore({ cwd, catalogDir });

    const after = readFileSync(join(cwd, ".gitignore"), "utf8");
    expect(after).toContain("node_modules/");
    expect(after).toContain("dist/");
    expect(after).toContain("agent-skills/alpha-skill/");
    expect(after.endsWith("\n")).toBe(true);
  });

  it("dryRun writes nothing", () => {
    const { results } = scaffoldCatalogIgnore({ cwd, catalogDir, dryRun: true });
    expect(results[0]?.action).toBe("skipped-dry");
  });

  it("emits an empty block when catalog has no skills or rules", () => {
    rmSync(join(catalogDir, "agent"), { recursive: true, force: true });
    mkdirSync(join(catalogDir, "agent"), { recursive: true });

    const { results, skillNames, ruleNames } = scaffoldCatalogIgnore({ cwd, catalogDir });
    expect(skillNames).toStrictEqual([]);
    expect(ruleNames).toStrictEqual([]);
    expect(results[0]?.action).toBe("created");

    const gi = readFileSync(join(cwd, ".gitignore"), "utf8");
    expect(gi).toContain("# >>> managed by webpresso (catalog-installed)");
    expect(gi).toContain("# <<< managed by webpresso (catalog-installed)");
  });
});
