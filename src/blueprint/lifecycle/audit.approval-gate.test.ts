import { mkdtempSync, mkdirSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";

import { afterEach, describe, expect, it } from "vitest";

import { validateApprovalGate } from "./audit.js";

const approve = (reviewer: string, evidence = "reviews.md") => ({
  reviewer,
  verdict: "approve",
  evidence,
});

function makeBlueprintWithReviews(
  status: string,
  approvals?: unknown,
  reviewsMarkdown = `# reviews

| Date | Reviewer | Rev | Verdict | Note |
| --- | --- | --- | --- | --- |
| 2026-06-28 | codex | final | APPROVE | ok |
| 2026-06-28 | deepseek | final | APPROVE | ok |
`,
): { root: string; file: string } {
  const root = mkdtempSync(path.join(tmpdir(), "approval-gate-"));
  mkdirSync(path.join(root, "blueprints", status, "sample"), { recursive: true });
  writeFileSync(
    path.join(root, "blueprints", status, "sample", "_overview.md"),
    `---
type: blueprint
status: ${status}
approvals: ${JSON.stringify(approvals ?? [])}
---
`,
    "utf8",
  );
  writeFileSync(
    path.join(root, "blueprints", status, "sample", "reviews.md"),
    reviewsMarkdown,
    "utf8",
  );
  return { root, file: path.join(root, "blueprints", status, "sample", "_overview.md") };
}

const tempRoots: string[] = [];

afterEach(() => {
  while (tempRoots.length > 0) rmSync(tempRoots.pop()!, { recursive: true, force: true });
});

describe("validateApprovalGate (≥2 distinct reviewer approvals past draft)", () => {
  it("passes a planned blueprint with 2 distinct log-backed approvals", () => {
    const { root, file } = makeBlueprintWithReviews("planned", [
      approve("codex"),
      approve("deepseek"),
    ]);
    tempRoots.push(root);
    expect(
      validateApprovalGate(file, {
        type: "blueprint",
        status: "planned",
        approvals: [approve("codex"), approve("deepseek")],
      }),
    ).toEqual([]);
  });

  it("fails a planned blueprint with only 1 log-backed approval", () => {
    const approvals = [approve("codex")];
    const { root, file } = makeBlueprintWithReviews("planned", approvals);
    tempRoots.push(root);
    const issues = validateApprovalGate(file, { type: "blueprint", status: "planned", approvals });
    expect(issues).toHaveLength(1);
    expect(issues[0]?.level).toBe("error");
    expect(issues[0]?.message).toContain("backed by committed review evidence");
  });

  it("fails when two approvals come from the same reviewer", () => {
    const approvals = [approve("codex"), approve("Codex")];
    const { root, file } = makeBlueprintWithReviews("planned", approvals);
    tempRoots.push(root);
    expect(
      validateApprovalGate(file, { type: "blueprint", status: "planned", approvals }),
    ).toHaveLength(1);
  });

  it("does not count a frontmatter approval with no matching committed review record", () => {
    const approvals = [approve("codex"), approve("glm")];
    const { root, file } = makeBlueprintWithReviews("planned", approvals);
    tempRoots.push(root);
    expect(
      validateApprovalGate(file, { type: "blueprint", status: "planned", approvals }),
    ).toHaveLength(1);
  });

  it("does not count a reject toward the gate", () => {
    const approvals = [
      approve("codex"),
      { reviewer: "deepseek", verdict: "reject", evidence: "reviews.md" },
    ];
    const { root, file } = makeBlueprintWithReviews("planned", approvals);
    tempRoots.push(root);
    expect(
      validateApprovalGate(file, { type: "blueprint", status: "planned", approvals }),
    ).toHaveLength(1);
  });

  it("exempts draft", () => {
    expect(
      validateApprovalGate("x", { type: "blueprint", status: "draft", approvals: [] }),
    ).toEqual([]);
  });

  it("exempts parked/archived", () => {
    expect(
      validateApprovalGate("x", { type: "blueprint", status: "parked", approvals: [] }),
    ).toEqual([]);
    expect(
      validateApprovalGate("x", { type: "blueprint", status: "archived", approvals: [] }),
    ).toEqual([]);
  });

  it("checks only the planned promotion boundary (in-progress/completed inherit it)", () => {
    expect(
      validateApprovalGate("x", { type: "blueprint", status: "in-progress", approvals: [] }),
    ).toEqual([]);
    expect(
      validateApprovalGate("x", { type: "blueprint", status: "completed", approvals: [] }),
    ).toEqual([]);
  });

  it("ignores non-blueprint documents", () => {
    expect(validateApprovalGate("x", { type: "rule", status: "planned", approvals: [] })).toEqual(
      [],
    );
  });

  it("treats missing/malformed approvals as zero", () => {
    expect(validateApprovalGate("x", { type: "blueprint", status: "planned" })).toHaveLength(1);
    expect(
      validateApprovalGate("x", { type: "blueprint", status: "planned", approvals: "nope" }),
    ).toHaveLength(1);
  });
});
