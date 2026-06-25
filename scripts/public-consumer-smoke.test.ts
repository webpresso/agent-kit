import { describe, expect, it } from "vitest";

import {
  computeOverallStatus,
  summarizePhases,
  type PhaseResult,
  type PhaseStatus,
} from "./public-consumer-smoke-phases.js";

function makePhase(phase: string, status: PhaseStatus): PhaseResult {
  return { phase, status, durationMs: 0, capturedOutput: `output of ${phase}` };
}

describe("computeOverallStatus", () => {
  it("returns PASS for empty phases", () => {
    expect(computeOverallStatus([])).toStrictEqual("PASS");
  });

  it("returns PASS when all phases pass", () => {
    expect(
      computeOverallStatus([makePhase("build", "PASS"), makePhase("install", "PASS")]),
    ).toStrictEqual("PASS");
  });

  it("returns FAIL when any phase fails", () => {
    expect(
      computeOverallStatus([makePhase("build", "PASS"), makePhase("install", "FAIL")]),
    ).toStrictEqual("FAIL");
  });

  it("returns BLOCKED when any phase is blocked and none fail", () => {
    expect(
      computeOverallStatus([makePhase("build", "PASS"), makePhase("install", "BLOCKED")]),
    ).toStrictEqual("BLOCKED");
  });

  it("returns FAIL when FAIL and BLOCKED both present", () => {
    expect(
      computeOverallStatus([makePhase("build", "FAIL"), makePhase("install", "BLOCKED")]),
    ).toStrictEqual("FAIL");
  });

  it("returns FAIL regardless of order of FAIL and BLOCKED", () => {
    expect(
      computeOverallStatus([makePhase("build", "BLOCKED"), makePhase("install", "FAIL")]),
    ).toStrictEqual("FAIL");
  });
});

describe("summarizePhases", () => {
  it("returns empty phases with PASS overall for empty input", () => {
    expect(summarizePhases([])).toStrictEqual({ phases: [], overall: "PASS" });
  });

  it("returns FAIL overall when a phase fails", () => {
    const phases = [makePhase("build", "PASS"), makePhase("pack", "FAIL")];
    const result = summarizePhases(phases);
    expect(result.overall).toStrictEqual("FAIL");
    expect(result.phases).toStrictEqual(phases);
  });

  it("each PhaseResult has a capturedOutput field", () => {
    const phases = [makePhase("build", "PASS")];
    const result = summarizePhases(phases);
    expect(typeof result.phases[0]?.capturedOutput).toStrictEqual("string");
  });

  it("returns the exact phases array passed in", () => {
    const phases = [makePhase("build", "PASS"), makePhase("native-stage", "BLOCKED")];
    const result = summarizePhases(phases);
    expect(result.phases).toStrictEqual(phases);
  });
});
