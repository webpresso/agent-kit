import { execFileSync } from "node:child_process";
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

const structuredApprove = (reviewer: string, overrides: Record<string, unknown> = {}): string =>
  `<!-- wp:review-entry ${JSON.stringify({
    id: `2026-06-28T00:00:00.000Z:${reviewer}:final`,
    blueprintSlug: "planned/sample",
    blueprintPath: "blueprints/planned/sample/_overview.md",
    targetKind: "blueprint",
    targetId: "planned/sample",
    targetHash: "sha256:good",
    timestamp: "2026-06-28T00:00:00.000Z",
    reviewer,
    verdict: "approve",
    rev: "final",
    commit: "abc123",
    evidence: "reviews.md",
    artifact: `review-artifacts/${reviewer}.md`,
    source: "structured",
    ...overrides,
  })} -->`;

function makeBlueprintWithReviews(
  status: string,
  approvals?: unknown,
  reviewsMarkdown = `# reviews

| Date | Reviewer | Rev | Verdict | Note |
| --- | --- | --- | --- | --- |
| 2026-06-28 | codex | final | APPROVE | ok |
| 2026-06-28 | deepseek | final | APPROVE | ok |

## Review entries

${structuredApprove("codex")}
${structuredApprove("deepseek")}
`,
  options: { trackReviews?: boolean } = { trackReviews: true },
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
  mkdirSync(path.join(root, "blueprints", status, "sample", "review-artifacts"), {
    recursive: true,
  });
  writeFileSync(
    path.join(root, "blueprints", status, "sample", "review-artifacts", "codex.md"),
    "# Codex review\n\nVerdict: APPROVE\n",
    "utf8",
  );
  writeFileSync(
    path.join(root, "blueprints", status, "sample", "review-artifacts", "deepseek.md"),
    "# DeepSeek review\n\nVerdict: APPROVE\n",
    "utf8",
  );
  if (options.trackReviews !== false) {
    execFileSync("git", ["init"], { cwd: root, stdio: "ignore" });
    execFileSync("git", ["add", "blueprints"], { cwd: root, stdio: "ignore" });
  }
  return { root, file: path.join(root, "blueprints", status, "sample", "_overview.md") };
}

const tempRoots: string[] = [];

afterEach(() => {
  while (tempRoots.length > 0) rmSync(tempRoots.pop()!, { recursive: true, force: true });
});

describe("validateApprovalGate (≥2 distinct reviewer approvals past draft)", () => {
  it("passes a planned blueprint with 2 distinct provenance-backed approvals", () => {
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

  it("fails a planned blueprint with only 1 provenance-backed approval", () => {
    const approvals = [approve("codex")];
    const { root, file } = makeBlueprintWithReviews("planned", approvals);
    tempRoots.push(root);
    const issues = validateApprovalGate(file, { type: "blueprint", status: "planned", approvals });
    expect(issues).toHaveLength(1);
    expect(issues[0]?.level).toBe("error");
    expect(issues[0]?.message).toContain("provenance-backed");
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

  it("requires structured review metadata to match frontmatter approval metadata when provided", () => {
    const approvals = [
      { ...approve("codex"), rev: "final", commit: "abc123", targetHash: "sha256:good" },
      { ...approve("deepseek"), rev: "final", commit: "abc123", targetHash: "sha256:wrong" },
    ];
    const { root, file } = makeBlueprintWithReviews("planned", approvals);
    tempRoots.push(root);
    expect(
      validateApprovalGate(file, { type: "blueprint", status: "planned", approvals }),
    ).toHaveLength(1);
  });

  it("counts the structured review record format emitted by wp review log with artifacts", () => {
    const approvals = [
      { ...approve("codex"), rev: "final", commit: "abc123", targetHash: "sha256:good" },
      { ...approve("deepseek"), rev: "final", commit: "abc123", targetHash: "sha256:good" },
    ];
    const { root, file } = makeBlueprintWithReviews("planned", approvals);
    tempRoots.push(root);
    expect(validateApprovalGate(file, { type: "blueprint", status: "planned", approvals })).toEqual(
      [],
    );
  });

  it("rejects bare structured review records without separate artifacts", () => {
    const approvals = [
      { ...approve("codex"), rev: "final", commit: "abc123", targetHash: "sha256:good" },
      { ...approve("deepseek"), rev: "final", commit: "abc123", targetHash: "sha256:good" },
    ];
    const { root, file } = makeBlueprintWithReviews(
      "planned",
      approvals,
      `# reviews

## Review entries

${structuredApprove("codex", { artifact: undefined })}
${structuredApprove("deepseek", { artifact: undefined })}
`,
    );
    tempRoots.push(root);
    expect(
      validateApprovalGate(file, { type: "blueprint", status: "planned", approvals }),
    ).toHaveLength(1);
  });

  it("rejects review entries whose artifact points back at the review ledger", () => {
    const approvals = [
      { ...approve("codex"), rev: "final", commit: "abc123", targetHash: "sha256:good" },
      { ...approve("deepseek"), rev: "final", commit: "abc123", targetHash: "sha256:good" },
    ];
    const { root, file } = makeBlueprintWithReviews(
      "planned",
      approvals,
      `# reviews

## Review entries

${structuredApprove("codex", { artifact: "reviews.md" })}
${structuredApprove("deepseek", { artifact: "reviews.md" })}
`,
    );
    tempRoots.push(root);
    expect(
      validateApprovalGate(file, { type: "blueprint", status: "planned", approvals }),
    ).toHaveLength(1);
  });

  it("rejects review entries with untracked artifacts", () => {
    const approvals = [
      { ...approve("codex"), rev: "final", commit: "abc123", targetHash: "sha256:good" },
      { ...approve("deepseek"), rev: "final", commit: "abc123", targetHash: "sha256:good" },
    ];
    const { root, file } = makeBlueprintWithReviews("planned", approvals, undefined, {
      trackReviews: false,
    });
    tempRoots.push(root);
    expect(
      validateApprovalGate(file, { type: "blueprint", status: "planned", approvals }),
    ).toHaveLength(1);
  });

  it("rejects review entries not emitted by the structured review logger", () => {
    const approvals = [
      { ...approve("codex"), rev: "final", commit: "abc123", targetHash: "sha256:good" },
      { ...approve("deepseek"), rev: "final", commit: "abc123", targetHash: "sha256:good" },
    ];
    const { root, file } = makeBlueprintWithReviews(
      "planned",
      approvals,
      `# reviews

## Review entries

${structuredApprove("codex", { source: "manual" })}
${structuredApprove("deepseek", { source: "manual" })}
`,
    );
    tempRoots.push(root);
    expect(
      validateApprovalGate(file, { type: "blueprint", status: "planned", approvals }),
    ).toHaveLength(1);
  });

  it("rejects absolute, parent-relative, and untracked evidence paths", () => {
    const { root, file } = makeBlueprintWithReviews("planned", []);
    tempRoots.push(root);
    expect(
      validateApprovalGate(file, {
        type: "blueprint",
        status: "planned",
        approvals: [
          approve("codex", path.join(root, "blueprints", "planned", "sample", "reviews.md")),
          approve("deepseek", "../../reviews.md"),
        ],
      }),
    ).toHaveLength(1);

    const untracked = makeBlueprintWithReviews(
      "planned",
      [approve("codex"), approve("deepseek")],
      undefined,
      { trackReviews: false },
    );
    tempRoots.push(untracked.root);
    expect(
      validateApprovalGate(untracked.file, {
        type: "blueprint",
        status: "planned",
        approvals: [approve("codex"), approve("deepseek")],
      }),
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
