import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";

import { afterEach, describe, expect, it } from "vitest";

import { buildReviewScoreboard, logReviewEntry, readReviewLedger } from "./review.js";

const BLUEPRINT_TEMPLATE = `---
type: blueprint
title: Test blueprint
status: planned
complexity: S
owner: ozby
created: 2026-06-28
last_updated: 2026-06-28
progress: "0% (0/1 tasks done, 0 blocked, updated 2026-06-28)"
---

# Test blueprint
`;

function writeConsumerBlueprint(projectRoot: string, status: string, slug: string): string {
  const dir = path.join(projectRoot, "blueprints", status, slug);
  mkdirSync(dir, { recursive: true });
  const filePath = path.join(dir, "_overview.md");
  writeFileSync(
    filePath,
    BLUEPRINT_TEMPLATE.replace("status: planned", `status: ${status}`),
    "utf8",
  );
  return filePath;
}

describe("review command helpers", () => {
  const tempDirs: string[] = [];

  afterEach(async () => {
    for (const dir of tempDirs.splice(0)) {
      await rm(dir, { recursive: true, force: true });
    }
  });

  it("logs committed review records and refreshes the derived .webpresso cache", async () => {
    const projectRoot = await mkdtemp(path.join(tmpdir(), "wp-review-log-"));
    tempDirs.push(projectRoot);
    writeFileSync(path.join(projectRoot, "package.json"), '{"name":"consumer"}\n', "utf8");
    writeConsumerBlueprint(projectRoot, "planned", "blueprint-pr-governance");

    const entry = await logReviewEntry(projectRoot, "blueprint-pr-governance", {
      reviewer: "Codex",
      targetKind: "blueprint",
      artifact: "review-artifacts/codex-final.md",
      targetHash: "sha256:abc",
      verdict: "approve",
      rev: "final",
      commit: "abc123",
      evidence: "reviews.md",
      note: "Looks good.",
      taskType: "blueprint-feasibility",
      findingsSurvived: "3",
      falsePositives: "1",
      latencyMs: "4200",
      agreementWithFinal: "true",
    });

    expect(entry.reviewer).toBe("codex");
    expect(entry.verdict).toBe("approve");
    expect(entry.targetKind).toBe("blueprint");
    expect(entry.targetId).toBe("planned/blueprint-pr-governance");
    expect(entry.artifact).toBe("review-artifacts/codex-final.md");
    expect(entry.targetHash).toBe("sha256:abc");
    expect(entry.agreementWithFinal).toBe(true);

    const reviewsPath = path.join(
      projectRoot,
      "blueprints",
      "planned",
      "blueprint-pr-governance",
      "reviews.md",
    );
    const markdown = readFileSync(reviewsPath, "utf8");
    expect(markdown).toContain("| Date | Reviewer | Rev | Verdict | Note |");
    expect(markdown).toContain("| codex |");
    expect(markdown).toContain("<!-- wp:review-entry ");
    expect(markdown).toContain('"artifact":"review-artifacts/codex-final.md"');

    const cachePath = path.join(projectRoot, ".webpresso", "reviews", "index.json");
    expect(existsSync(cachePath)).toBe(true);
    const cache = JSON.parse(readFileSync(cachePath, "utf8")) as {
      entries: Array<{ reviewer: string }>;
    };
    expect(cache.entries).toHaveLength(1);
    expect(cache.entries[0]?.reviewer).toBe("codex");
  });

  it("reads both legacy review tables and structured entries from a blueprint folder ledger", async () => {
    const projectRoot = await mkdtemp(path.join(tmpdir(), "wp-review-read-"));
    tempDirs.push(projectRoot);
    writeFileSync(path.join(projectRoot, "package.json"), '{"name":"consumer"}\n', "utf8");
    const overviewPath = writeConsumerBlueprint(projectRoot, "planned", "blueprint-pr-governance");
    const reviewsPath = path.join(path.dirname(overviewPath), "reviews.md");
    writeFileSync(
      reviewsPath,
      `# Review ledger — blueprint-pr-governance

| Date | Reviewer | Rev | Verdict | Note |
| --- | --- | --- | --- | --- |
| 2026-06-27 | codex | 1 | REJECT | overclaimed |

## Review entries

<!-- wp:review-entry {"id":"2026-06-28T00:00:00.000Z:deepseek:final","blueprintSlug":"planned/blueprint-pr-governance","blueprintPath":"blueprints/planned/blueprint-pr-governance/_overview.md","targetKind":"blueprint","targetId":"planned/blueprint-pr-governance","timestamp":"2026-06-28T00:00:00.000Z","reviewer":"deepseek","verdict":"approve","rev":"final","taskType":"blueprint-feasibility","source":"structured"} -->
### 2026-06-28 — deepseek — APPROVE
`,
      "utf8",
    );

    const ledger = await readReviewLedger(projectRoot, "blueprint-pr-governance");

    expect(ledger.entries).toHaveLength(2);
    expect(ledger.entries.map((entry) => entry.reviewer)).toEqual(["codex", "deepseek"]);
    expect(ledger.entries.map((entry) => entry.source)).toEqual(["legacy-table", "structured"]);
  });

  it("builds a reviewer x task-type scoreboard with routing recommendations", () => {
    const rows = buildReviewScoreboard([
      {
        id: "1",
        blueprintSlug: "planned/one",
        blueprintPath: "blueprints/planned/one/_overview.md",
        timestamp: "2026-06-28T00:00:00.000Z",
        reviewer: "codex",
        verdict: "reject",
        taskType: "blueprint-feasibility",
        findingsSurvived: 3,
        falsePositives: 0,
        latencyMs: 1000,
        agreementWithFinal: true,
        targetKind: "blueprint",
        targetId: "planned/one",
        source: "structured",
      },
      {
        id: "2",
        blueprintSlug: "planned/two",
        blueprintPath: "blueprints/planned/two/_overview.md",
        timestamp: "2026-06-28T01:00:00.000Z",
        reviewer: "codex",
        verdict: "approve",
        taskType: "blueprint-feasibility",
        findingsSurvived: 1,
        falsePositives: 0,
        latencyMs: 2000,
        agreementWithFinal: true,
        targetKind: "blueprint",
        targetId: "planned/two",
        source: "structured",
      },
      {
        id: "3",
        blueprintSlug: "planned/three",
        blueprintPath: "blueprints/planned/three/_overview.md",
        timestamp: "2026-06-28T02:00:00.000Z",
        reviewer: "deepseek",
        verdict: "no-verdict",
        taskType: "blueprint-feasibility",
        falsePositives: 1,
        latencyMs: 9000,
        agreementWithFinal: false,
        targetKind: "blueprint",
        targetId: "planned/three",
        source: "structured",
      },
      {
        id: "4",
        blueprintSlug: "planned/four",
        blueprintPath: "blueprints/planned/four/_overview.md",
        timestamp: "2026-06-28T03:00:00.000Z",
        reviewer: "deepseek",
        verdict: "approve",
        taskType: "blueprint-feasibility",
        falsePositives: 1,
        latencyMs: 3000,
        agreementWithFinal: false,
        targetKind: "blueprint",
        targetId: "planned/four",
        source: "structured",
      },
    ]);

    expect(rows).toHaveLength(2);

    const codexRow = rows.find((row) => row.reviewer === "codex");
    expect(codexRow).toMatchObject({
      taskType: "blueprint-feasibility",
      total: 2,
      findingsSurvived: 4,
      falsePositives: 0,
      averageLatencyMs: 1500,
      agreementWithFinalRate: 1,
      signalPrecision: 1,
    });
    expect(codexRow?.recommendation).toContain("Prefer for blueprint-feasibility");

    const deepseekRow = rows.find((row) => row.reviewer === "deepseek");
    expect(deepseekRow).toMatchObject({
      taskType: "blueprint-feasibility",
      total: 2,
      noVerdict: 1,
      agreementWithFinalRate: 0,
      timeoutRate: 0.5,
    });
    expect(deepseekRow?.recommendation).toContain("secondary voice");
  });
});
