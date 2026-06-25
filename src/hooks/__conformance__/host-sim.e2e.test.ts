/**
 * Host-simulation e2e (P3): path stability + Codex output cleanliness.
 *
 * Codex runs hook commands with the session cwd, which can be a SIBLING repo rather
 * than the project root — so the generated `.codex/hooks.json` command must be
 * self-contained (absolute node/wp paths + an embedded `cd`). This test proves that by
 * running the generated commands from an unrelated sibling directory and asserting the
 * decision still holds, and that Codex-bound output never contains the unsupported
 * fields Codex fails-closed on (ask/continue/stopReason/suppressOutput).
 */
import { spawnSync } from "node:child_process";
import { mkdtempSync, readFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

import { afterAll, beforeAll, describe, expect, it } from "vitest";

import { scaffoldAgentHooks } from "#cli/commands/init/scaffolders/agent-hooks/index.js";

import { CONFORMANCE_MATRIX, assertConformance, type ConformanceRow } from "./matrix.js";

type HostConfig = { readonly hooks: Record<string, Array<{ hooks: Array<{ command?: string }> }>> };

let repoRoot: string;
let siblingCwd: string;
let codexCommands: readonly string[];

function collectCommands(config: HostConfig): string[] {
  const out: string[] = [];
  for (const groups of Object.values(config.hooks ?? {})) {
    for (const group of groups) {
      for (const hook of group.hooks ?? []) {
        if (typeof hook.command === "string") out.push(hook.command);
      }
    }
  }
  return out;
}

function codexCommandFor(row: ConformanceRow): string {
  const needle = ` hook ${row.hookBin.replace(/^wp-/u, "")}`;
  const command = codexCommands.find((c) => c.includes(needle));
  if (!command) throw new Error(`no generated codex command for ${row.hookBin}`);
  return command;
}

beforeAll(async () => {
  repoRoot = mkdtempSync(join(tmpdir(), "hook-hostsim-repo-"));
  siblingCwd = mkdtempSync(join(tmpdir(), "hook-hostsim-sibling-"));
  spawnSync("git", ["init", "-q"], { cwd: repoRoot });
  await scaffoldAgentHooks({ repoRoot, options: {}, trustCodexHooks: false });
  codexCommands = collectCommands(
    JSON.parse(readFileSync(join(repoRoot, ".codex", "hooks.json"), "utf8")) as HostConfig,
  );
}, 60_000);

afterAll(() => {
  if (repoRoot) rmSync(repoRoot, { recursive: true, force: true });
  if (siblingCwd) rmSync(siblingCwd, { recursive: true, force: true });
});

describe("host-sim e2e: Codex path stability from a sibling cwd", () => {
  const codexRows = CONFORMANCE_MATRIX.filter(
    (row): row is ConformanceRow => row.host === "codex" && row.event === "PreToolUse",
  );

  it("has codex PreToolUse rows to exercise", () => {
    expect(codexRows.length).toBeGreaterThanOrEqual(2);
  });

  for (const row of codexRows) {
    it(`holds decision + emits Codex-clean output from sibling cwd: ${row.name}`, () => {
      const command = codexCommandFor(row);
      // Deliberately run from the SIBLING dir, not repoRoot — the embedded `cd` and
      // absolute paths must keep the hook correct regardless of caller cwd.
      const result = spawnSync("sh", ["-c", command], {
        input: row.stdin,
        encoding: "utf-8",
        cwd: siblingCwd,
        env: { ...process.env, WP_SKIP_UPDATE_CHECK: "1" },
      });
      // assertConformance enforces the per-event decision AND (for codex rows) that the
      // output contains no unsupported ask/continue/stopReason/suppressOutput fields.
      expect(
        () => assertConformance(row, { stdout: result.stdout ?? "", exitCode: result.status }),
        `${row.name} from sibling cwd\ncmd: ${command}`,
      ).not.toThrow();
    }, 30_000);
  }
});
