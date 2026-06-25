import { describe, expect, test } from "vitest";

import { auditBlueprintPrCoverage } from "./blueprint-pr-coverage.js";

describe("auditBlueprintPrCoverage", () => {
  test("passes docs-only Markdown changes", () => {
    const result = auditBlueprintPrCoverage("/repo", {
      changedFiles: ["README.md", "docs/guide.md", "blueprints/planned/example.md"],
    });

    expect(result.ok).toBe(true);
    expect(result.violations).toStrictEqual([]);
  });

  test("fails non-doc changes without a blueprint change", () => {
    const result = auditBlueprintPrCoverage("/repo", {
      changedFiles: ["src/runtime/example.ts", "package.json"],
    });

    expect(result.ok).toBe(false);
    expect(result.violations).toStrictEqual([
      {
        message:
          "non-doc PR without a blueprint change — add/update blueprints/ coverage, or include a commit trailer `Blueprint-exempt: <reason>` for a genuinely trivial change",
      },
    ]);
  });

  test("passes non-doc changes when a blueprint changes too", () => {
    const result = auditBlueprintPrCoverage("/repo", {
      changedFiles: ["src/runtime/example.ts", "blueprints/in-progress/example.md"],
    });

    expect(result.ok).toBe(true);
    expect(result.violations).toStrictEqual([]);
  });

  test("passes non-doc changes with an auditable Blueprint-exempt trailer", () => {
    const result = auditBlueprintPrCoverage("/repo", {
      changedFiles: ["src/runtime/example.ts"],
      commitMessages: [
        "fix: tiny typo in generated string\n\nBlueprint-exempt: one-line generated output typo",
      ],
    });

    expect(result.ok).toBe(true);
    expect(result.violations).toStrictEqual([
      {
        message: "[warn] Blueprint-exempt trailer present: one-line generated output typo",
      },
    ]);
  });

  test("degrades to pass-with-warning when no base ref or changed files are provided", () => {
    const result = auditBlueprintPrCoverage("/repo");

    expect(result.ok).toBe(true);
    expect(result.checked).toBe(0);
    expect(result.violations).toStrictEqual([
      {
        message:
          "[warn] blueprint-pr-coverage skipped: provide --base <ref> or changedFiles in PR contexts",
      },
    ]);
  });
});
