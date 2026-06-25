import { describe, expect, it } from "vitest";

import { CONFORMANCE_MATRIX, type HookRunResult } from "./matrix.js";
import { findLaneDivergences, laneDecision } from "./parity.js";

const ALLOW: HookRunResult = { stdout: "", exitCode: 0 };
const DENY: HookRunResult = {
  stdout: JSON.stringify({
    hookSpecificOutput: {
      hookEventName: "PreToolUse",
      permissionDecision: "deny",
      permissionDecisionReason: "x",
    },
  }),
  exitCode: 0,
};

describe("lane parity", () => {
  it("derives comparable lane decisions", () => {
    expect(laneDecision(ALLOW)).toBe("allow-or-empty");
    expect(laneDecision({ stdout: "{}", exitCode: 0 })).toBe("allow-or-empty");
    expect(laneDecision(DENY)).toBe("deny");
    expect(laneDecision({ stdout: JSON.stringify({ decision: "block" }), exitCode: 0 })).toBe(
      "deny",
    );
  });

  it("reports no divergence when both lanes agree", () => {
    const row = CONFORMANCE_MATRIX.find((r) => r.name === "claude:pretool allow gh pr merge")!;
    const source = new Map([[row.name, ALLOW]]);
    const compiled = new Map([[row.name, ALLOW]]);
    expect(findLaneDivergences([row], source, compiled)).toStrictEqual([]);
  });

  it("STALE-RUNTIME NEGATIVE FIXTURE: flags a compiled lane that diverges from fixed source", () => {
    // Models the exact rot the parity gate exists to catch: source is fixed (allows
    // `gh pr merge`) but a stale compiled runtime still DENIES it. The gate MUST flag it.
    const row = CONFORMANCE_MATRIX.find((r) => r.name === "claude:pretool allow gh pr merge")!;
    const source = new Map([[row.name, ALLOW]]);
    const staleCompiled = new Map([[row.name, DENY]]);
    const divergences = findLaneDivergences([row], source, staleCompiled);
    expect(divergences).toHaveLength(1);
    expect(divergences[0]).toStrictEqual({
      row: row.name,
      source: "allow-or-empty",
      compiled: "deny",
    });
  });
});
