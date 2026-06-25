import { describe, expect, it } from "vitest";

import {
  DEBUG_QRELS_FILE,
  loadAllScenarios,
  loadDebugRecallFile,
  SCENARIO_FILES,
  validateScenarioQrelProvenance,
} from "./_schema";

describe("bench scenario schema", () => {
  it("validates all scenario fixtures and their compaction-oriented metadata", () => {
    const scenarios = loadAllScenarios();

    expect(SCENARIO_FILES).toHaveLength(3);
    expect(scenarios).toHaveLength(3);

    for (const scenario of scenarios) {
      expect(scenario.qrels.length).toBeGreaterThanOrEqual(5);
      expect(scenario.worst_case_token_count).toBeGreaterThan(200_000);
      expect(scenario.prompt_turns.length).toBeGreaterThanOrEqual(8);
      expect(new Set(scenario.expected_tool_calls).size).toBe(scenario.expected_tool_calls.length);
    }

    const resumable = scenarios.find((scenario) => scenario.scenario_id === "resumable-task");
    expect(resumable).toBeDefined();
    expect(new Set(resumable?.prompt_turns.map((turn) => turn.session_id))).toHaveProperty(
      "size",
      2,
    );
  });

  it("requires auditable independent qrel ground-truth provenance for the fixed suite", () => {
    const scenarios = loadAllScenarios();
    const qrels = scenarios.flatMap((scenario) => scenario.qrels);

    expect(qrels).toHaveLength(15);
    for (const scenario of scenarios) {
      expect(() => validateScenarioQrelProvenance(scenario)).not.toThrow();
    }

    for (const qrel of qrels) {
      expect(qrel.provenance).toMatchObject({
        scenario_id: expect.any(String),
        qrel_id: qrel.qrel_id,
        source_file: expect.stringMatching(/^scripts\/bench\/scenarios\//),
        source_span: expect.stringMatching(/^prompt_turns\[\d+\]\.text$/),
        query_id: expect.any(String),
        relevance_criterion_version: "context-recall-qrel-v1",
        label_status: "accepted",
        provenance_version: 1,
      });
      expect(qrel.provenance.primary_labeler.identity).not.toBe(
        qrel.provenance.independent_reviewer.identity,
      );
    }
  });

  it("keeps the standalone debug recall file in sync with the inline debug scenario qrels", () => {
    const scenarios = loadAllScenarios();
    const debugScenario = scenarios.find(
      (scenario) => scenario.scenario_id === "debug-long-session",
    );
    const debugRecall = loadDebugRecallFile();

    expect(DEBUG_QRELS_FILE.endsWith("debug-recall.json")).toBe(true);
    expect(debugScenario).toBeDefined();
    expect(debugRecall.scenario_id).toBe("debug-long-session");
    expect(debugRecall.qrels).toStrictEqual(debugScenario?.qrels);
  });
});
