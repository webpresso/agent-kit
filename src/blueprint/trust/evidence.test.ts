import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import { parseTrustDossier } from "./dossier.js";
import { validateTrustEvidence } from "./evidence.js";
import { VALID_DOSSIER } from "./test-fixtures.js";

const dirs: string[] = [];
function root() {
  const dir = mkdtempSync(path.join(tmpdir(), "trust-evidence-"));
  dirs.push(dir);
  writeFileSync(path.join(dir, "README.md"), "# ok");
  return dir;
}
afterEach(() => {
  while (dirs.length) rmSync(dirs.pop()!, { recursive: true, force: true });
});

describe("validateTrustEvidence", () => {
  it("accepts repo, web, and derived evidence", () => {
    const dir = root();
    writeFileSync(path.join(dir, "my..notes.md"), "# dotted name\n");
    const md = VALID_DOSSIER.replace(
      "| C1 | Parser exists | repo:README.md |",
      "| C2 | Second claim | repo:my..notes.md |\n| C1 | Parser exists | repo:README.md; web:https://example.com (2026-06-22); derived:C2 |",
    );
    const dossier = parseTrustDossier(md).dossier!;
    expect(validateTrustEvidence(dir, dossier)).toEqual([]);
  });

  it("accepts markdown-escaped underscores in repo evidence paths", () => {
    const dir = root();
    const evidencePath = "blueprints/completed/example/_overview.md";
    mkdirSync(path.dirname(path.join(dir, evidencePath)), { recursive: true });
    writeFileSync(path.join(dir, evidencePath), "# ok\n");
    const md = VALID_DOSSIER.replace(
      "repo:README.md",
      "repo:blueprints/completed/example/\\_overview.md",
    );
    const dossier = parseTrustDossier(md).dossier!;
    expect(validateTrustEvidence(dir, dossier)).toEqual([]);
  });

  it("rejects missing repo paths, path traversal, and derived cycles", () => {
    const dir = root();
    const md = VALID_DOSSIER.replace(
      "repo:README.md",
      "repo:missing.md; repo:../outside.md; derived:C1",
    );
    const dossier = parseTrustDossier(md).dossier!;
    const errors = validateTrustEvidence(dir, dossier).map((v) => v.message);
    expect(errors.join("\n")).toMatch(/does not exist/);
    expect(errors.join("\n")).toMatch(/stay under repo root/);
    expect(errors.join("\n")).toMatch(/self/);
  });
});
