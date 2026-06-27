import { describe, expect, it } from "vitest";

import { validateApprovalGate } from "./audit.js";

const fm = (status: string, approvals?: unknown) => ({ type: "blueprint", status, approvals });
const approve = (reviewer: string) => ({ reviewer, verdict: "approve" });

describe("validateApprovalGate (≥2 distinct reviewer approvals past draft)", () => {
  it("passes a planned blueprint with 2 distinct approvals", () => {
    expect(
      validateApprovalGate("x", fm("planned", [approve("codex"), approve("deepseek")])),
    ).toEqual([]);
  });

  it("fails a planned blueprint with only 1 approval", () => {
    const issues = validateApprovalGate("x", fm("planned", [approve("codex")]));
    expect(issues).toHaveLength(1);
    expect(issues[0]?.level).toBe("warning");
    expect(issues[0]?.message).toContain("≥2");
  });

  it("fails when 2 approvals come from the SAME reviewer (not distinct)", () => {
    expect(
      validateApprovalGate("x", fm("planned", [approve("codex"), approve("Codex")])),
    ).toHaveLength(1);
  });

  it("does not count a reject toward the gate", () => {
    const approvals = [approve("codex"), { reviewer: "deepseek", verdict: "reject" }];
    expect(validateApprovalGate("x", fm("planned", approvals))).toHaveLength(1);
  });

  it("exempts draft (gate applies only past draft)", () => {
    expect(validateApprovalGate("x", fm("draft", []))).toEqual([]);
  });

  it("exempts parked/archived", () => {
    expect(validateApprovalGate("x", fm("parked", []))).toEqual([]);
    expect(validateApprovalGate("x", fm("archived", []))).toEqual([]);
  });

  it("checks only the planned promotion boundary (in-progress/completed inherit it)", () => {
    // The gate fires at draft→planned; later statuses reached planned first.
    expect(validateApprovalGate("x", fm("in-progress", []))).toEqual([]);
    expect(validateApprovalGate("x", fm("completed", []))).toEqual([]);
  });

  it("ignores non-blueprint documents", () => {
    expect(validateApprovalGate("x", { type: "rule", status: "planned", approvals: [] })).toEqual(
      [],
    );
  });

  it("treats missing/malformed approvals as zero", () => {
    expect(validateApprovalGate("x", fm("planned"))).toHaveLength(1);
    expect(validateApprovalGate("x", fm("planned", "nope"))).toHaveLength(1);
  });
});
