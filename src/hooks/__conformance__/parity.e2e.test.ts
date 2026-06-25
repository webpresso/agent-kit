/**
 * Compiled-runtime parity (P4).
 *
 * Production hooks fire from the COMPILED bin/runtime/<target>/wp (bin/runtime-lanes forces
 * `hook`/`mcp` to the runtime lane), which can silently diverge from source. This test
 * builds the host runtime (~3s), then replays the conformance matrix through BOTH the
 * source lane (`bun src/cli/cli.ts hook ...`) and the compiled lane
 * (`WP_FORCE_COMPILED_RUNTIME=1 bin/wp hook ...`), asserting each conforms AND that the
 * two lanes agree. A stale/divergent compiled runtime fails this test.
 *
 * Self-contained: it builds the runtime itself, so there is no "forgot to build" silent
 * pass. If the build is unavailable the beforeAll throws (fail loud).
 */
import { spawnSync } from "node:child_process";
import { existsSync, mkdtempSync, readFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";

import { afterAll, beforeAll, describe, expect, it } from "vitest";

import {
  CONFORMANCE_MATRIX,
  assertConformance,
  type ConformanceRow,
  type HookRunResult,
} from "./matrix.js";
import { findLaneDivergences } from "./parity.js";

function findCloneRoot(start: string): string {
  let dir = start;
  for (let i = 0; i < 12; i += 1) {
    const pkgPath = join(dir, "package.json");
    if (existsSync(pkgPath)) {
      const pkg = JSON.parse(readFileSync(pkgPath, "utf8")) as { name?: string };
      if (pkg.name === "@webpresso/agent-kit") return dir;
    }
    const parent = dirname(dir);
    if (parent === dir) break;
    dir = parent;
  }
  throw new Error(`could not locate @webpresso/agent-kit clone root from ${start}`);
}

const cloneRoot = findCloneRoot(dirname(fileURLToPath(import.meta.url)));
const wpBin = join(cloneRoot, "bin", "wp");
const cliSource = join(cloneRoot, "src", "cli", "cli.ts");

let gitRepo: string;

function subcommandFor(row: ConformanceRow): string {
  return row.hookBin.replace(/^wp-/u, "");
}

function run(
  command: string,
  args: string[],
  stdin: string,
  extraEnv: Record<string, string>,
): HookRunResult {
  const result = spawnSync(command, args, {
    input: stdin,
    encoding: "utf-8",
    cwd: gitRepo,
    env: { ...process.env, WP_SKIP_UPDATE_CHECK: "1", ...extraEnv },
  });
  return { stdout: result.stdout ?? "", exitCode: result.status };
}

function runSourceLane(row: ConformanceRow): HookRunResult {
  return run("bun", [cliSource, "hook", subcommandFor(row)], row.stdin, { WP_FORCE_SOURCE: "1" });
}

function runCompiledLane(row: ConformanceRow): HookRunResult {
  return run(wpBin, ["hook", subcommandFor(row)], row.stdin, { WP_FORCE_COMPILED_RUNTIME: "1" });
}

beforeAll(() => {
  // Build the host compiled runtime (fail loud if it cannot build).
  const build = spawnSync("bun", ["scripts/build-runtime-binaries.ts", "--target", "host"], {
    cwd: cloneRoot,
    encoding: "utf-8",
  });
  if ((build.status ?? 1) !== 0) {
    throw new Error(`failed to build host runtime (build runtime first): ${build.stderr ?? ""}`);
  }
  gitRepo = mkdtempSync(join(tmpdir(), "hook-parity-"));
  spawnSync("git", ["init", "-q"], { cwd: gitRepo });
}, 120_000);

afterAll(() => {
  if (gitRepo) rmSync(gitRepo, { recursive: true, force: true });
});

describe("compiled-runtime parity", () => {
  it("built a host runtime binary", () => {
    expect(existsSync(resolve(cloneRoot, "dist/runtime"))).toBe(true);
  });

  const sourceResults = new Map<string, HookRunResult>();
  const compiledResults = new Map<string, HookRunResult>();

  for (const row of CONFORMANCE_MATRIX) {
    it(`both lanes conform: ${row.name}`, () => {
      const source = runSourceLane(row);
      const compiled = runCompiledLane(row);
      sourceResults.set(row.name, source);
      compiledResults.set(row.name, compiled);
      expect(() => assertConformance(row, source), `${row.name} (source lane)`).not.toThrow();
      expect(() => assertConformance(row, compiled), `${row.name} (compiled lane)`).not.toThrow();
    }, 45_000);
  }

  it("source and compiled lanes agree on every row (no stale-runtime divergence)", () => {
    const divergences = findLaneDivergences(CONFORMANCE_MATRIX, sourceResults, compiledResults);
    expect(divergences, JSON.stringify(divergences, null, 2)).toStrictEqual([]);
  });
});
