import { mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import { validateBlueprintTrust } from "./validator.js";
import { VALID_DOSSIER } from "./test-fixtures.js";
const dirs: string[] = [];
function root() {
  const dir = mkdtempSync(path.join(tmpdir(), "trust-validator-"));
  dirs.push(dir);
  writeFileSync(path.join(dir, "README.md"), "# ok");
  return dir;
}
afterEach(() => {
  while (dirs.length) rmSync(dirs.pop()!, { recursive: true, force: true });
});

describe("validateBlueprintTrust", () => {
  it("allows draft opt-out and requires planned dossiers", () => {
    const dir = root();
    expect(
      validateBlueprintTrust({ repoRoot: dir, file: "x.md", status: "draft", markdown: "" }).ok,
    ).toBe(true);
    expect(
      validateBlueprintTrust({ repoRoot: dir, file: "x.md", status: "planned", markdown: "" }).ok,
    ).toBe(false);
  });

  it("requires dossiers for all executable statuses and draft promotion candidates", () => {
    const dir = root();
    for (const status of ["planned", "in-progress", "completed"] as const) {
      expect(validateBlueprintTrust({ repoRoot: dir, file: "x.md", status, markdown: "" }).ok).toBe(
        false,
      );
    }
    expect(
      validateBlueprintTrust({
        repoRoot: dir,
        file: "x.md",
        status: "draft",
        markdown: "",
        promotionCandidate: true,
      }).ok,
    ).toBe(false);
  });

  it("rejects invalid service-owned readiness stamps", () => {
    const dir = root();
    const badHead = validateBlueprintTrust({
      repoRoot: dir,
      file: "x.md",
      status: "planned",
      markdown: VALID_DOSSIER.replace("0123456789abcdef0123456789abcdef01234567", "not-a-full-sha"),
    });
    expect(badHead.violations.some((violation) => /full git SHA/.test(violation.message))).toBe(
      true,
    );

    const badTime = validateBlueprintTrust({
      repoRoot: dir,
      file: "x.md",
      status: "planned",
      markdown: VALID_DOSSIER.replace("2026-06-22T00:00:00.000Z", "June 22 2026"),
    });
    expect(badTime.violations.some((violation) => /ISO timestamp/.test(violation.message))).toBe(
      true,
    );
  });

  it("requires material claims and promotion gates for executable dossiers", () => {
    const dir = root();
    const withoutClaims = VALID_DOSSIER.replace("| C1 | Parser exists | repo:README.md |", "");
    expect(
      validateBlueprintTrust({
        repoRoot: dir,
        file: "x.md",
        status: "planned",
        markdown: withoutClaims,
      }).violations.some((violation) => violation.section === "Material Claims"),
    ).toBe(true);

    const withoutGates = VALID_DOSSIER.replace(
      "| lifecycle | wp audit blueprint-lifecycle | pass | pass at 2026-06-22T00:00:00.000Z |",
      "",
    );
    expect(
      validateBlueprintTrust({
        repoRoot: dir,
        file: "x.md",
        status: "planned",
        markdown: withoutGates,
      }).violations.some((violation) => violation.section === "Promotion Gates"),
    ).toBe(true);

    const withoutDecisions = VALID_DOSSIER.replace(
      "| D1 | Storage | Markdown dossier | Sidecar | Reviewable with blueprint |",
      "",
    );
    expect(
      validateBlueprintTrust({
        repoRoot: dir,
        file: "x.md",
        status: "planned",
        markdown: withoutDecisions,
      }).violations.some((violation) => violation.section === "Material Decisions"),
    ).toBe(true);
  });

  it("rejects unsafe promotion gate commands in executable dossiers", () => {
    const dir = root();
    const result = validateBlueprintTrust({
      repoRoot: dir,
      file: "x.md",
      status: "planned",
      markdown: VALID_DOSSIER.replace("wp audit blueprint-lifecycle", "wp sync"),
    });
    expect(result.ok).toBe(false);
    expect(
      result.violations.some((violation) => /wp sync must be read-only/.test(violation.message)),
    ).toBe(true);
  });

  it("requires passing promotion gates unless explicitly disabled", () => {
    const dir = root();
    const failedGate = VALID_DOSSIER.replace(
      "pass at 2026-06-22T00:00:00.000Z",
      "fail at 2026-06-22T00:00:00.000Z",
    );
    expect(
      validateBlueprintTrust({
        repoRoot: dir,
        file: "x.md",
        status: "planned",
        markdown: failedGate,
      }).violations.some((violation) => /Last result must be pass/.test(violation.message)),
    ).toBe(true);
    expect(
      validateBlueprintTrust({
        repoRoot: dir,
        file: "x.md",
        status: "planned",
        markdown: failedGate,
        requirePassingGates: false,
      }).ok,
    ).toBe(true);
  });

  it("passes valid executable dossiers", () => {
    const dir = root();
    expect(
      validateBlueprintTrust({
        repoRoot: dir,
        file: "x.md",
        status: "planned",
        markdown: VALID_DOSSIER,
      }).ok,
    ).toBe(true);
  });
});
