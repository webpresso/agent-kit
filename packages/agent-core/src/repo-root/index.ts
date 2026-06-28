/**
 * Workspace-root discovery — a strict upward marker walk.
 *
 * Self-contained (no dependencies) so agent-kit and agent-config (and consumers
 * via agent-config) all resolve the repo root from ONE implementation. Strong
 * markers (`.git`, `pnpm-workspace.yaml`) anchor at the workspace root in
 * preference to a nested `package.json`.
 */
import { existsSync } from "node:fs";
import { dirname, join, resolve } from "node:path";

const STRONG_MARKERS = [".git", "pnpm-workspace.yaml"] as const;
const WEAK_MARKERS = ["package.json"] as const;
const MAX_UPWARD_LEVELS = 32;

export class RepoRootNotFoundError extends Error {
  constructor(startedAt: string) {
    super(
      `Could not resolve repo root walking up from ${startedAt} ` +
        `(no .git, pnpm-workspace.yaml, or package.json found within ${MAX_UPWARD_LEVELS} levels).`,
    );
    this.name = "RepoRootNotFoundError";
  }
}

function walkUp(start: string, markers: readonly string[]): string | null {
  let dir = start;
  for (let i = 0; i < MAX_UPWARD_LEVELS; i += 1) {
    if (markers.some((marker) => existsSync(join(dir, marker)))) return dir;
    const parent = dirname(dir);
    if (parent === dir) return null;
    dir = parent;
  }
  return null;
}

/** Walk up to the nearest workspace root; returns null when no marker is found. */
export function walkToRepoRoot(start: string): string | null {
  return walkUp(start, STRONG_MARKERS) ?? walkUp(start, WEAK_MARKERS);
}

/**
 * Strict upward walk from `startDir` (default `process.cwd()`) to the nearest
 * workspace root. Throws `RepoRootNotFoundError` when no marker is found — it
 * deliberately does not fall back to any ambient env var.
 */
export function findRepoRoot(startDir: string = process.cwd()): string {
  const root = walkToRepoRoot(startDir);
  if (!root) throw new RepoRootNotFoundError(startDir);
  return root;
}

/** Resolve an absolute path from a repo root + path segments. */
export function resolveFromRepoRoot(root: string, ...segments: string[]): string {
  return resolve(root, ...segments);
}
