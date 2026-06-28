import { readFileSync } from "node:fs";
import path from "node:path";

import { afterEach, beforeEach, describe, expect, it } from "vitest";

import {
  callTool,
  cleanupTempDir,
  makeEmptyProjectionBlueprintHarness,
  parseResult,
  type ToolMap,
} from "./blueprint-server.test-harness.js";

let tmpDir: string;
let tools: ToolMap;

beforeEach(async () => {
  ({ tmpDir, tools } = await makeEmptyProjectionBlueprintHarness("wp-bs-trust-dossier-"));
});

afterEach(() => {
  cleanupTempDir(tmpDir);
});

const document = {
  type: "blueprint",
  title: "Structured Put Blueprint",
  status: "draft",
  complexity: "S",
  owner: "tester",
  created: "2026-05-29",
  last_updated: "2026-05-29",
  product_wedge_anchor: {
    stage_outcome: "Phase 1 — prove structured blueprint upserts",
    consuming_surface: "wp blueprint MCP tools",
    new_user_visible_capability: "Users can upsert a blueprint via structured input",
  },
  summary: "Blueprint used to test the whole-document put path.",
  tasks: [
    {
      id: "1.1",
      title: "Write the first structured task",
      status: "todo",
      wave: "0",
      acceptance: ["The first structured task exists in markdown"],
    },
  ],
} as const;

const trustDossier = {
  readiness: {
    promotion_ready: true,
    unresolved_count: 0,
    verified_at: "2026-06-22T00:00:00.000Z",
    verified_head: "0123456789abcdef0123456789abcdef01234567",
    trust_gate_version: "v1",
  },
  material_claims: [
    {
      id: "C1",
      claim: "The structured put path has repository-backed evidence.",
      evidence: "repo:package.json",
    },
  ],
  material_decisions: [
    {
      id: "D1",
      decision: "Dossier authoring",
      chosen_option: "Use structured trust_dossier input.",
      rejected_alternatives: "Embed markdown in summary.",
      rationale: "The sanctioned writer should render gate-consumable markdown.",
    },
  ],
  promotion_gates: [
    {
      gate: "lint",
      command: "wp lint",
      expected_outcome: "pass",
      last_result: "pending",
    },
  ],
  residual_unknowns: [],
} as const;

describe("wp_blueprint_put trust dossier", () => {
  it("renders structured trust_dossier after tasks using gate-required subsection text", async () => {
    const result = await callTool(tools, "wp_blueprint_put", {
      project_id: tmpDir,
      slug: "structured-put-blueprint",
      document: { ...document, trust_dossier: trustDossier },
    });
    const data = parseResult(result) as { path: string };

    expect(result.isError).toStrictEqual(false);
    const written = readFileSync(data.path, "utf8");
    const taskIndex = written.indexOf("#### Task 1.1");
    const dossierIndex = written.indexOf("## Trust Dossier");
    expect(dossierIndex).toBeGreaterThan(taskIndex);
    expect(written).toContain("### Readiness Verdict");
    expect(written).toContain("### Material Claims");
    expect(written).toContain("### Material Decisions");
    expect(written).toContain("### Promotion Gates");
    expect(written).toContain("### Residual Unknowns\n\nNone.");
    expect(written).toContain(
      "| C1 | The structured put path has repository-backed evidence. | repo:package.json |",
    );
  });

  it("rejects invalid trust_dossier evidence and gate commands before writing", async () => {
    const lineNumberEvidence = await callTool(tools, "wp_blueprint_put", {
      project_id: tmpDir,
      slug: "line-number-evidence-blueprint",
      document: {
        ...document,
        trust_dossier: {
          ...trustDossier,
          material_claims: [
            { ...trustDossier.material_claims[0], evidence: "repo:package.json:1" },
          ],
        },
      },
    });
    expect(lineNumberEvidence.isError).toStrictEqual(true);
    expect(lineNumberEvidence.content[0]?.text).toMatch(/repo evidence path does not exist/i);

    const nonWpGate = await callTool(tools, "wp_blueprint_put", {
      project_id: tmpDir,
      slug: "non-wp-gate-blueprint",
      document: {
        ...document,
        trust_dossier: {
          ...trustDossier,
          promotion_gates: [
            { ...trustDossier.promotion_gates[0], command: "node scripts/check.js" },
          ],
        },
      },
    });
    expect(nonWpGate.isError).toStrictEqual(true);
    expect(nonWpGate.content[0]?.text).toMatch(/must use wp facade commands/i);
  });

  it("promotes a blueprint authored through structured trust_dossier without summary embedding", async () => {
    const putResult = await callTool(tools, "wp_blueprint_put", {
      project_id: tmpDir,
      slug: "structured-trust-round-trip",
      document: {
        ...document,
        title: "Structured Trust Round Trip",
        summary: "No embedded dossier markdown here.",
        trust_dossier: trustDossier,
      },
    });
    const putData = parseResult(putResult) as { path: string };
    const draft = readFileSync(putData.path, "utf8");
    expect(draft).toContain("## Summary\n\nNo embedded dossier markdown here.");
    expect(draft).toContain("## Trust Dossier");

    const promoteResult = await callTool(tools, "wp_blueprint_promote", {
      project_id: tmpDir,
      slug: "structured-trust-round-trip",
      to_state: "planned",
    });
    const promoteData = parseResult<{ to_state: string; new_path: string; failures: string[] }>(
      promoteResult,
    );

    expect(promoteResult.isError).toStrictEqual(false);
    expect(promoteData.to_state).toBe("planned");
    expect(promoteData.failures).toStrictEqual([]);
    expect(promoteData.new_path).toContain(path.join("blueprints", "planned"));
    expect(readFileSync(promoteData.new_path, "utf8")).toContain("pass at ");
  });
});
