import { readdirSync, readFileSync } from "node:fs";
import { join, relative, sep } from "node:path";

import { describe, expect, it } from "vitest";

/**
 * Guards `SERIAL_SUBPROCESS_GLOBS` (vitest.config.ts) against silent drift.
 *
 * A subprocess-pool test that mutates SHARED repo state while running
 * concurrently races the parallel pool — e.g. `package.contract` rewriting the
 * live `package.json` (prepare/restore around `npm pack`) while `init.e2e`
 * spawns the real CLI and reads a half-prepared manifest, or two tests building
 * the shared `dist/runtime` tree at once. Such tests MUST be isolated in the
 * `serial-subprocess` vitest project (its own `groupOrder`, `fileParallelism:false`).
 *
 * That routing is an explicit, hand-maintained list — the one place the repo's
 * "suffix routing, never edit the list" convention is intentionally broken. This
 * guard makes the list self-enforcing: if a new subprocess test introduces a
 * shared-state mutation without being listed, CI fails loudly here instead of
 * flaking intermittently with no obvious cause.
 */

const REPO_ROOT = process.cwd();

// Source markers that mean "this test writes shared repo state". Keep these in
// sync with the operations that actually mutate the working tree.
const SHARED_STATE_MUTATION_MARKERS = [
  "build-runtime-binaries", // writes dist/runtime (+ bin/runtime)
  "stage-plugin-runtime-artifacts", // stages dist/runtime-packages
  "package-manifest.ts", // prepare/restore rewrites the live package.json
] as const;

const SUBPROCESS_SUFFIXES = [".integration.test.ts", ".e2e.test.ts", ".subprocess.test.ts"];
const SKIP_DIRS = new Set(["node_modules", "dist", ".claude", "_worktrees", ".git"]);

function listSubprocessTestFiles(root: string): string[] {
  const found: string[] = [];
  const walk = (dir: string): void => {
    for (const entry of readdirSync(dir, { withFileTypes: true })) {
      if (entry.isDirectory()) {
        if (!SKIP_DIRS.has(entry.name)) walk(join(dir, entry.name));
        continue;
      }
      if (SUBPROCESS_SUFFIXES.some((suffix) => entry.name.endsWith(suffix))) {
        found.push(join(dir, entry.name));
      }
    }
  };
  walk(root);
  return found;
}

function readSerialGlobs(): readonly string[] {
  const config = readFileSync(join(REPO_ROOT, "vitest.config.ts"), "utf8");
  const block = config.match(/SERIAL_SUBPROCESS_GLOBS\s*=\s*\[([\s\S]*?)\]/u);
  if (block === null) {
    throw new Error("Could not locate SERIAL_SUBPROCESS_GLOBS in vitest.config.ts");
  }
  return [...block[1].matchAll(/"([^"]+)"/gu)].map((match) => match[1]);
}

describe("serial-subprocess isolation guard", () => {
  const serialGlobs = readSerialGlobs();
  const testFiles = listSubprocessTestFiles(REPO_ROOT);

  it("discovers the subprocess test corpus", () => {
    // Sanity check the scan itself — a broken walker must not vacuously pass.
    expect(testFiles.length).toBeGreaterThan(10);
  });

  for (const absPath of testFiles) {
    const relPath = relative(REPO_ROOT, absPath).split(sep).join("/");
    const markers = SHARED_STATE_MUTATION_MARKERS.filter((marker) =>
      readFileSync(absPath, "utf8").includes(marker),
    );
    if (markers.length === 0) continue;

    it(`isolates shared-state-mutating test: ${relPath}`, () => {
      expect(
        serialGlobs.includes(relPath),
        `${relPath} mutates shared repo state (${markers.join(", ")}) but is not in ` +
          `SERIAL_SUBPROCESS_GLOBS. Add it there so it runs in the serial-subprocess ` +
          `project and never races the parallel subprocess pool.`,
      ).toBe(true);
    });
  }
});
