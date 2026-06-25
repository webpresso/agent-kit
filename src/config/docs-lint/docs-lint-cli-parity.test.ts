import { execFileSync } from "node:child_process";
import { existsSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

// Anchor all paths to the repo root via import.meta.dirname so the test is
// cwd-independent and can run from any working directory (e.g. /tmp).
const repoRoot = join(import.meta.dirname, "..", "..", "..");
const foldedTemplatesRoot = join(repoRoot, "src/config/docs-lint/templates");
const validateCli = join(repoRoot, "src/config/docs-lint/cli/validate.ts");
const migrateCli = join(repoRoot, "src/config/docs-lint/cli/migrate.ts");

function runNodeHelp(entrypoint: string): string {
  return execFileSync(process.execPath, [entrypoint, "--help"], {
    cwd: repoRoot,
    encoding: "utf8",
  });
}

describe("folded docs-lint CLI parity", () => {
  it("keeps docs-lint templates available from the canonical source tree", () => {
    for (const template of ["blueprint.yaml", "core-doc.yaml", "guide.yaml"]) {
      const folded = join(foldedTemplatesRoot, template);

      expect(existsSync(folded), `${template} should be folded`).toBe(true);
      expect(readFileSync(folded, "utf8").trim().length).toBeGreaterThan(0);
    }
  });

  it("smoke-runs the folded validate CLI help entrypoint", () => {
    const output = runNodeHelp(validateCli);

    expect(output).toContain("docs validate");
    expect(output).toContain("--staged");
    expect(output).toContain("--fix");
  });

  it("keeps the folded validate CLI on runtime-resolvable .js command imports", () => {
    const source = readFileSync(validateCli, "utf8");

    expect(source).toContain("./commands/validate-command.js");
    expect(source).not.toContain("./commands/validate-command.ts");
  });

  it("smoke-runs the folded migrate CLI help entrypoint", () => {
    const output = runNodeHelp(migrateCli);

    expect(output).toContain("docs-migrate");
    expect(output).toContain("--dry-run");
    expect(output).toContain("--no-backup");
  });
});
