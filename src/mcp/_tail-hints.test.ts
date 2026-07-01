import { existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";

import { afterEach, describe, expect, it } from "vitest";

import {
  maybeHint,
  recordHint,
  shouldShowHint,
  TAIL_HINTS,
  type TailHintId,
} from "./_tail-hints.js";

const roots: string[] = [];

afterEach(() => {
  while (roots.length > 0) rmSync(roots.pop()!, { recursive: true, force: true });
});

function tempCwd(): string {
  const root = mkdtempSync(path.join(tmpdir(), "wp-tail-hints-"));
  roots.push(root);
  return root;
}

function historyFile(cwd: string): string {
  return path.join(cwd, ".agent", ".tail-hint-history.jsonl");
}

describe("tail hints", () => {
  it("shows a hint once, records it, and suppresses duplicates within the TTL", () => {
    const cwd = tempCwd();

    expect(shouldShowHint(cwd, "VERIFY_DONE")).toBe(true);
    expect(maybeHint(cwd, "VERIFY_DONE")).toBe(TAIL_HINTS.VERIFY_DONE);
    expect(shouldShowHint(cwd, "VERIFY_DONE")).toBe(false);
    expect(maybeHint(cwd, "VERIFY_DONE")).toBeNull();

    expect(readFileSync(historyFile(cwd), "utf8")).toContain("VERIFY_DONE");
  });

  it("allows the same hint after the seven-day TTL expires", () => {
    const cwd = tempCwd();
    const file = historyFile(cwd);
    const oldTs = Date.now() - 8 * 24 * 60 * 60 * 1000;
    mkdirSync(path.dirname(file), { recursive: true });
    writeFileSync(file, JSON.stringify({ hintId: "PLAN_REFINE", cwd, ts: oldTs }) + "\n", {
      flag: "w",
    });

    expect(shouldShowHint(cwd, "PLAN_REFINE")).toBe(true);
  });

  it("persists records in an isolated .agent fallback when cwd is not a git repo", () => {
    const cwd = tempCwd();

    recordHint(cwd, "AUDIT_FIX");

    expect(existsSync(historyFile(cwd))).toBe(true);
    expect(JSON.parse(readFileSync(historyFile(cwd), "utf8").trim())).toMatchObject({
      hintId: "AUDIT_FIX",
      cwd,
    });
  });

  it("defines static hint strings for every TailHintId", () => {
    const ids = Object.keys(TAIL_HINTS) as TailHintId[];

    expect(ids).toEqual(["PLL_PARALLEL", "VERIFY_DONE", "PLAN_REFINE", "AUDIT_FIX"]);
    for (const id of ids) {
      expect(TAIL_HINTS[id]).toEqual(expect.any(String));
      expect(TAIL_HINTS[id].length).toBeGreaterThan(0);
    }
  });
});
