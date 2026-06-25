import { describe, expect, it } from "vitest";

import {
  isNextAction,
  type NextAction,
  type NextActionKind,
  NEXT_ACTION_KINDS,
  makeNextAction,
} from "./next-action.js";

// Exhaustive list of kinds — must match the union exactly.
const EXPECTED_KINDS: readonly NextActionKind[] = [
  "rebuild_db",
  "reingest_project",
  "disambiguate_slug",
  "verify_task",
  "create_blueprint",
  "configure_workspace",
  "unsupported_roots",
] as const;

describe("NextAction discriminated union", () => {
  it("exposes a frozen NEXT_ACTION_KINDS list that matches the union exhaustively", () => {
    expect(new Set(NEXT_ACTION_KINDS)).toStrictEqual(new Set(EXPECTED_KINDS));
    expect(NEXT_ACTION_KINDS).toHaveLength(EXPECTED_KINDS.length);
    expect(Object.isFrozen(NEXT_ACTION_KINDS)).toBe(true);
  });

  it("makeNextAction builds a typed { kind, hint } pair for every kind", () => {
    for (const kind of NEXT_ACTION_KINDS) {
      const action = makeNextAction(kind, `hint-for-${kind}`);
      expect(action).toStrictEqual({ kind, hint: `hint-for-${kind}` });
    }
  });

  it("makeNextAction rejects empty hint strings to keep audit trails grep-able", () => {
    expect(() => makeNextAction("rebuild_db", "")).toThrow(/hint/);
  });

  it("isNextAction guard accepts every kind and rejects unknown discriminators", () => {
    for (const kind of NEXT_ACTION_KINDS) {
      expect(isNextAction({ kind, hint: "x" })).toBe(true);
    }
    expect(isNextAction({ kind: "unknown_kind", hint: "x" })).toBe(false);
    expect(isNextAction({ kind: "rebuild_db" })).toBe(false); // missing hint
    expect(isNextAction(null)).toBe(false);
    expect(isNextAction(undefined)).toBe(false);
    expect(isNextAction("rebuild_db")).toBe(false);
  });

  it("exhaustive switch over kind compiles and dispatches for each kind", () => {
    function describeAction(a: NextAction): string {
      switch (a.kind) {
        case "rebuild_db":
          return "rebuild";
        case "reingest_project":
          return "reingest";
        case "disambiguate_slug":
          return "disambiguate";
        case "verify_task":
          return "verify";
        case "create_blueprint":
          return "create";
        case "configure_workspace":
          return "configure";
        case "unsupported_roots":
          return "unsupported";
        default: {
          // Exhaustiveness assertion — TS must see `never` here.
          const _exhaustive: never = a;
          return _exhaustive;
        }
      }
    }

    const results = NEXT_ACTION_KINDS.map((kind) => describeAction({ kind, hint: "h" }));
    expect(results).toStrictEqual([
      "rebuild",
      "reingest",
      "disambiguate",
      "verify",
      "create",
      "configure",
      "unsupported",
    ]);
  });
});
