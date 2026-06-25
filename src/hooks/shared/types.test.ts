import { describe, expect, it } from "vitest";

import { buildDenyEnvelope } from "#hooks/shared/types";

describe("buildDenyEnvelope", () => {
  it("produces valid JSON with permissionDecision: deny", () => {
    const envelope = buildDenyEnvelope({ reason: "Command is forbidden" });
    expect(envelope).toStrictEqual({
      hookSpecificOutput: {
        hookEventName: "PreToolUse",
        permissionDecision: "deny",
        permissionDecisionReason: "Command is forbidden",
      },
    });
    // Must be serialisable
    expect(() => JSON.stringify(envelope)).not.toThrow();
  });

  it("emits no keys beyond the policy envelope shape", () => {
    const envelope = buildDenyEnvelope({ reason: "Blocked" });
    expect(Object.keys(envelope)).toStrictEqual(["hookSpecificOutput"]);
  });
});
