/**
 * Stable subpath export: `@webpresso/agent-kit/repo-root`.
 *
 * Consumer-facing workspace-root discovery. Exists so agent-kit-only consumers
 * (aksaprocess.tr, edge-matte) — which cannot import the `@webpresso/webpresso`
 * framework facade — and ingest-lens all resolve the repo root from ONE
 * implementation instead of each hand-rolling a `findRepoRoot` copy.
 *
 * Backed by the same marker walk the MCP tools use
 * (`#mcp/tools/_shared/project-root`), so agent-kit keeps a single
 * root-resolution implementation.
 *
 * Scope is deliberately narrow: root discovery only. Command/binary resolution
 * (`resolveWorkspaceBinary`, `resolveVpCommand`, child-env building) lives under
 * `@webpresso/agent-kit/dev`, not here.
 */
import { resolve } from "node:path";

import { ProjectRootNotFoundError, walkToProjectRoot } from "#mcp/tools/_shared/project-root";

/**
 * Walk up from `startDir` (default `process.cwd()`) to the nearest workspace
 * root, preferring strong markers (`.git`, `pnpm-workspace.yaml`) over a nested
 * `package.json`. Throws `ProjectRootNotFoundError` when no marker is found
 * within the bounded walk.
 *
 * This is a STRICT upward walk: unlike the MCP server's `resolveProjectRoot`,
 * it deliberately does NOT fall back to `CLAUDE_PROJECT_DIR`. A consumer asking
 * "what repo is `startDir` in?" must get that repo or a loud failure — never a
 * silently-widened ambient root (which in an agent session is the whole
 * workspace).
 */
export function findRepoRoot(startDir: string = process.cwd()): string {
  const root = walkToProjectRoot(startDir);
  if (!root) throw new ProjectRootNotFoundError(startDir);
  return root;
}

/** Resolve an absolute path from a repo root + path segments. */
export function resolveFromRepoRoot(root: string, ...segments: string[]): string {
  return resolve(root, ...segments);
}
