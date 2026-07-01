import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, describe, expect, it } from "vitest";

import { auditSecurityQualityRegressions } from "./security-quality-regressions.js";

const tempDirs: string[] = [];

function tempRepo(): string {
  const root = mkdtempSync(join(tmpdir(), "wp-security-quality-"));
  tempDirs.push(root);
  mkdirSync(join(root, "src"), { recursive: true });
  mkdirSync(join(root, ".github", "workflows"), { recursive: true });
  return root;
}

describe("auditSecurityQualityRegressions", () => {
  afterEach(() => {
    for (const dir of tempDirs.splice(0)) {
      rmSync(dir, { recursive: true, force: true });
    }
  });

  it("passes clean source and workflows with explicit permissions", () => {
    const root = tempRepo();
    writeFileSync(join(root, "src", "clean.ts"), "new URL(input);\n");
    writeFileSync(
      join(root, ".github", "workflows", "ci.yml"),
      [
        "name: CI",
        "permissions:",
        "  contents: read",
        "jobs:",
        "  test:",
        "    runs-on: ubuntu-latest",
      ].join("\n"),
    );

    const result = auditSecurityQualityRegressions(root);

    expect(result.ok).toBe(true);
    expect(result.violations).toStrictEqual([]);
  });

  it("passes workflows where every job declares explicit permissions", () => {
    const root = tempRepo();
    writeFileSync(
      join(root, ".github", "workflows", "ci.yml"),
      [
        "name: CI",
        "jobs:",
        "  test:",
        "    runs-on: ubuntu-latest",
        "    permissions:",
        "      contents: read",
        "  publish:",
        "    runs-on: ubuntu-latest",
        "    permissions:",
        "      contents: write",
      ].join("\n"),
    );

    const result = auditSecurityQualityRegressions(root);

    expect(result.ok).toBe(true);
    expect(result.violations).toStrictEqual([]);
  });

  it("flags URL substring allow-list checks", () => {
    const root = tempRepo();
    writeFileSync(
      join(root, "src", "bad.ts"),
      'const ok = source.includes("https://registry.npmjs.org");\n',
    );

    const result = auditSecurityQualityRegressions(root);

    expect(result.ok).toBe(false);
    expect(result.violations.map((v) => v.message).join("\n")).toContain("url-substring-allowlist");
  });

  it("flags dot-only escaping before dynamic RegExp construction", () => {
    const root = tempRepo();
    writeFileSync(
      join(root, "src", "bad.ts"),
      'const pattern = new RegExp(`Task ${taskId.replace(/\\./g, "\\\\.")}`);\n',
    );

    const result = auditSecurityQualityRegressions(root);

    expect(result.ok).toBe(false);
    expect(result.violations.map((v) => v.message).join("\n")).toContain("partial-regex-escape");
  });

  it("flags pipe-only markdown table escaping", () => {
    const root = tempRepo();
    writeFileSync(join(root, "src", "bad.ts"), 'value.replace(/\\|/g, "\\\\|");\n');

    const result = auditSecurityQualityRegressions(root);

    expect(result.ok).toBe(false);
    expect(result.violations.map((v) => v.message).join("\n")).toContain(
      "markdown-pipe-backslash-escape",
    );
  });

  it("flags workflows without top-level permissions", () => {
    const root = tempRepo();
    writeFileSync(
      join(root, ".github", "workflows", "release.yml"),
      ["name: Release", "jobs:", "  build:", "    runs-on: ubuntu-latest"].join("\n"),
    );

    const result = auditSecurityQualityRegressions(root);

    expect(result.ok).toBe(false);
    expect(result.violations.map((v) => v.message).join("\n")).toContain(
      "job-level permissions for every job",
    );
  });
});
