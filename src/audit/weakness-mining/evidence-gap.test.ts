import { describe, expect, it } from "vitest";

import { detectEvidenceGap } from "./evidence-gap.js";

describe("detectEvidenceGap", () => {
  it("records a non-failing no-evidence gap for clean checkouts", () => {
    const gap = detectEvidenceGap({
      records: [],
      candidateFiles: [".agent/logs/pretool-guard.log"],
      warnings: [],
    });

    expect(gap).toMatchObject({ kind: "no-pretool-evidence" });
  });

  it("does not report a gap when records exist", () => {
    const gap = detectEvidenceGap({
      records: [
        {
          timestamp: "2026-06-13T10:00:00.000Z",
          status: "PASS",
          tool: "Bash",
          target: "git status",
          sourceFile: "x",
          lineNumber: 1,
        },
      ],
      candidateFiles: ["x"],
      warnings: [],
    });

    expect(gap).toBeNull();
  });
});
