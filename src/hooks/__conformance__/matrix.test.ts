import { describe, expect, it } from "vitest";

import { WP_HOOK_BIN_NAMES } from "#cli/commands/init/scaffolders/agent-hooks/ir.js";

import {
  CONFORMANCE_MATRIX,
  PROBE_ROWS,
  WEBPRESSO_HOOK_BINS,
  assertConformance,
  bashPayload,
  type ConformanceRow,
  type HookRunResult,
  type PreToolUseRow,
} from "./matrix.js";

function rowByName(name: string): ConformanceRow {
  const row = CONFORMANCE_MATRIX.find((candidate) => candidate.name === name);
  if (!row) throw new Error(`fixture row not found: ${name}`);
  return row;
}

const DENY_STDOUT = JSON.stringify({
  hookSpecificOutput: {
    hookEventName: "PreToolUse",
    permissionDecision: "deny",
    permissionDecisionReason: "Use wp_pr_status MCP tool instead",
  },
});

describe("hook conformance matrix", () => {
  it("covers every webpresso hook bin across both hosts where applicable", () => {
    const isClaudePre = (r: ConformanceRow): r is PreToolUseRow =>
      r.event === "PreToolUse" && r.host === "claude";
    const isCodexPre = (r: ConformanceRow): r is PreToolUseRow =>
      r.event === "PreToolUse" && r.host === "codex";
    const claudePre = CONFORMANCE_MATRIX.filter(isClaudePre);
    const codexPre = CONFORMANCE_MATRIX.filter(isCodexPre);
    expect(claudePre.length).toBeGreaterThan(0);
    expect(codexPre.length).toBeGreaterThan(0);
    // PreToolUse rows include both allow and deny expectations.
    expect(new Set(claudePre.map((r) => r.expect))).toStrictEqual(new Set(["allow", "deny"]));
  });

  it("keeps WEBPRESSO_HOOK_BINS in sync with the WP_HOOK_BIN_NAMES SSOT (ir.ts)", () => {
    // The matrix hand-types its bin tuple to anchor the WebpressoHookBin literal
    // union; ir.ts derives WP_HOOK_BIN_NAMES from WP_HOOK_SPECS. This guard fails
    // if a 7th hook spec is added to ir.ts without a matching conformance bin (or
    // vice-versa), so a new managed hook cannot silently miss conformance rows.
    expect([...WEBPRESSO_HOOK_BINS].sort()).toStrictEqual([...WP_HOOK_BIN_NAMES].sort());
  });

  it("builds host-shaped stdin (codex adds tool_use_id/turn_id; claude does not)", () => {
    const claude = JSON.parse(bashPayload("claude", "PreToolUse", "echo x")) as Record<
      string,
      unknown
    >;
    const codex = JSON.parse(bashPayload("codex", "PreToolUse", "echo x")) as Record<
      string,
      unknown
    >;
    expect(claude.tool_name).toBe("Bash");
    expect(claude.tool_use_id).toBeUndefined();
    expect(claude.turn_id).toBeUndefined();
    expect(codex.tool_use_id).toBe("conformance-tool-use");
    expect(codex.turn_id).toBe("conformance-turn");
  });

  it("PreToolUse allow row: passes on empty stdout, fails on a deny envelope", () => {
    const allow = rowByName("claude:pretool allow gh pr merge");
    expect(() => assertConformance(allow, { stdout: "", exitCode: 0 })).not.toThrow();
    expect(() => assertConformance(allow, { stdout: "{}", exitCode: 0 })).not.toThrow();
    expect(() => assertConformance(allow, { stdout: DENY_STDOUT, exitCode: 0 })).toThrow(
      /expected PreToolUse allow but hook DENIED/,
    );
  });

  it("PreToolUse deny row: passes on a deny envelope, fails on allow", () => {
    const deny = rowByName("claude:pretool deny gh pr view");
    expect(() => assertConformance(deny, { stdout: DENY_STDOUT, exitCode: 0 })).not.toThrow();
    expect(() => assertConformance(deny, { stdout: "", exitCode: 0 })).toThrow(
      /expected a PreToolUse deny/,
    );
  });

  it("rejects invalid-JSON stdout for any row", () => {
    const allow = rowByName("claude:pretool allow benign echo");
    expect(() => assertConformance(allow, { stdout: "not json", exitCode: 0 })).toThrow(
      /not valid JSON/,
    );
  });

  it("rejects Codex-bound output containing unsupported fields or ask", () => {
    const codexAllow = rowByName("codex:pretool allow gh pr merge");
    const withContinue: HookRunResult = {
      stdout: JSON.stringify({ continue: false }),
      exitCode: 0,
    };
    expect(() => assertConformance(codexAllow, withContinue)).toThrow(
      /unsupported field "continue"/,
    );

    const codexDeny = rowByName("codex:pretool deny gh pr view");
    const askEnvelope: HookRunResult = {
      stdout: JSON.stringify({
        hookSpecificOutput: { hookEventName: "PreToolUse", permissionDecision: "ask" },
      }),
      exitCode: 0,
    };
    expect(() => assertConformance(codexDeny, askEnvelope)).toThrow(/permissionDecision "ask"/);
  });

  it("allows the same ask envelope for a Claude row (claude supports ask)", () => {
    // Claude rows are not subject to the Codex unsupported-field rule; an ask envelope on a
    // deny row still counts as a deny decision.
    const claudeDeny = rowByName("claude:pretool deny gh pr view");
    const askEnvelope: HookRunResult = {
      stdout: JSON.stringify({
        hookSpecificOutput: { hookEventName: "PreToolUse", permissionDecision: "deny" },
      }),
      exitCode: 0,
    };
    expect(() => assertConformance(claudeDeny, askEnvelope)).not.toThrow();
  });

  it("treats a non-zero exit as failure on an allow row (crash != allow)", () => {
    const allow = rowByName("claude:pretool allow gh pr merge");
    expect(() => assertConformance(allow, { stdout: "", exitCode: 1 })).toThrow(/exited with 1/);
    expect(() => assertConformance(allow, { stdout: "", exitCode: null })).toThrow(
      /exited with null/,
    );
  });

  it("accepts a PreToolUse deny via exit code 2 (exit-code deny convention)", () => {
    const deny = rowByName("claude:pretool deny gh pr view");
    expect(() => assertConformance(deny, { stdout: "", exitCode: 2 })).not.toThrow();
  });

  it("rejects a deny envelope printed just before a crash (deny + exit 1)", () => {
    const deny = rowByName("claude:pretool deny gh pr view");
    expect(() => assertConformance(deny, { stdout: DENY_STDOUT, exitCode: 1 })).toThrow(
      /exited with 1/,
    );
  });

  it("requires fail-open and SessionStart hooks to exit 0", () => {
    const stop = rowByName("claude:stop");
    expect(() => assertConformance(stop, { stdout: "{}", exitCode: 1 })).toThrow(/exited with 1/);
    const session = rowByName("claude:sessionstart");
    expect(() => assertConformance(session, { stdout: "", exitCode: 3 })).toThrow(/exited with 3/);
  });

  it("fail-open events accept empty stdout and valid JSON", () => {
    const stop = rowByName("claude:stop");
    expect(() => assertConformance(stop, { stdout: "", exitCode: 0 })).not.toThrow();
    expect(() => assertConformance(stop, { stdout: "{}", exitCode: 0 })).not.toThrow();
    expect(() => assertConformance(stop, { stdout: "broken", exitCode: 0 })).toThrow(
      /not valid JSON/,
    );
  });

  it("exposes a small probe subset (allow + deny)", () => {
    expect(PROBE_ROWS.length).toBeGreaterThanOrEqual(2);
    const events = new Set(PROBE_ROWS.map((r) => r.event));
    expect(events.has("PreToolUse")).toBe(true);
  });
});
