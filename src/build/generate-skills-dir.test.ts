import { existsSync, readdirSync, readFileSync } from "node:fs";
import { join, resolve } from "node:path";
import { describe, expect, it } from "vitest";

const PACKAGE_ROOT = resolve(import.meta.dirname, "..", "..");
const SKILLS_DIR = join(PACKAGE_ROOT, "skills");
const CATALOG_SKILLS = join(PACKAGE_ROOT, "catalog", "agent", "skills");
const PLUGIN_JSON = join(PACKAGE_ROOT, ".claude-plugin", "plugin.json");

const skillsDirExists = existsSync(SKILLS_DIR);

describe("plugin manifest", () => {
  it(".claude-plugin/plugin.json is present", () => {
    expect(existsSync(PLUGIN_JSON)).toBe(true);
  });

  it("plugin.json is valid JSON with a name field", () => {
    const raw = readFileSync(PLUGIN_JSON, "utf-8");
    const parsed = JSON.parse(raw);
    expect(typeof parsed.name).toBe("string");
    expect(parsed.name.length).toBeGreaterThan(0);
  });

  it("plugin.json has skills pointing to ./skills", () => {
    const parsed = JSON.parse(readFileSync(PLUGIN_JSON, "utf-8"));
    expect(parsed.skills).toBe("./skills");
  });
});

describe("skills directory", () => {
  it.skipIf(!skillsDirExists)(
    "skills/ directory exists (run pnpm generate-skills if missing)",
    () => {
      expect(existsSync(SKILLS_DIR)).toBe(true);
    },
  );

  it.skipIf(!skillsDirExists)("skills/ has at least 6 subdirectories", () => {
    const skillDirs = readdirSync(SKILLS_DIR);
    expect(skillDirs.length).toBeGreaterThanOrEqual(6);
  });

  it.skipIf(!skillsDirExists)("every skill dir contains a non-empty SKILL.md", () => {
    const skillDirs = readdirSync(SKILLS_DIR);
    for (const dir of skillDirs) {
      const skillMd = join(SKILLS_DIR, dir, "SKILL.md");
      expect(existsSync(skillMd), `Missing SKILL.md in skills/${dir}`).toBe(true);
      const content = readFileSync(skillMd, "utf-8");
      expect(content.trim().length, `Empty SKILL.md in skills/${dir}`).toBeGreaterThan(0);
    }
  });

  it.skipIf(!skillsDirExists)("all skill directory names are valid kebab-case", () => {
    const skillDirs = readdirSync(SKILLS_DIR);
    const kebabCase = /^[a-z0-9]+(-[a-z0-9]+)*$/;
    for (const dir of skillDirs) {
      expect(kebabCase.test(dir), `"${dir}" is not valid kebab-case`).toBe(true);
    }
  });

  it.skipIf(!skillsDirExists)("skills/ count matches catalog/agent/skills/ SKILL.md count", () => {
    const catalogDirs = readdirSync(CATALOG_SKILLS).filter((entry) => {
      const skillMd = join(CATALOG_SKILLS, entry, "SKILL.md");
      return existsSync(skillMd);
    });
    const skillDirs = readdirSync(SKILLS_DIR);
    expect(skillDirs.length).toBe(catalogDirs.length);
  });
});
