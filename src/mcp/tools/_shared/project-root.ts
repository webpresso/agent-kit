/**
 * Resolve the webpresso MCP server's *project* root.
 *
 * Why this exists: Claude Code does NOT set a reliable cwd for plugin-scope
 * MCP servers (anthropics/claude-code#42687, #17565, #19205). User-scope
 * plugin servers see `process.cwd()` set to the plugin cache path; the
 * `cwd` field in `.mcp.json` is documented but ignored. So `tsc` and
 * `oxlint` spawned with the inherited cwd would lint the wrong tree.
 *
 * Resolution order, first hit wins:
 *   1. `explicitCwd` — caller says "use exactly this", no walk.
 *   2. An explicitly-passed `cwd` walked up to a marker (`.git`,
 *      `pnpm-workspace.yaml`, then `package.json`). A deliberate caller cwd
 *      outranks `CLAUDE_PROJECT_DIR`, which for a plugin-scope MCP server is
 *      the whole session/workspace root. If the passed cwd has no marker, fall
 *      back to `CLAUDE_PROJECT_DIR`, then throw — do not widen to `process.cwd()`.
 *   3. `CLAUDE_PROJECT_DIR` env var (when no explicit cwd was passed).
 *   4. Walk up from `process.cwd()` looking for a marker.
 *   5. Loud throw — diagnosing a wrong-tree lint silently is worse than
 *      forcing the caller to pass an explicit cwd.
 *
 * The walk searches `.git` and `pnpm-workspace.yaml` *before* `package.json`
 * so we anchor at the workspace root rather than at a nested package dir.
 */

import { existsSync } from 'node:fs'
import { dirname, join } from 'node:path'

const STRONG_MARKERS = ['.git', 'pnpm-workspace.yaml'] as const
const WEWP_MARKERS = ['package.json'] as const
const MAX_UPWARD_LEVELS = 32

export class ProjectRootNotFoundError extends Error {
  constructor(startedAt: string) {
    super(
      `Could not resolve project root walking up from ${startedAt} ` +
        `(no .git, pnpm-workspace.yaml, or package.json found within ${MAX_UPWARD_LEVELS} levels). ` +
        'Set CLAUDE_PROJECT_DIR or pass an explicit cwd.',
    )
    this.name = 'ProjectRootNotFoundError'
  }
}

function walkUp(start: string, markers: readonly string[]): string | null {
  let dir = start
  for (let i = 0; i < MAX_UPWARD_LEVELS; i++) {
    if (markers.some((m) => existsSync(join(dir, m)))) return dir
    const parent = dirname(dir)
    if (parent === dir) return null
    dir = parent
  }
  return null
}

export interface ResolveProjectRootOptions {
  readonly explicitCwd?: string
  readonly env?: NodeJS.ProcessEnv
  readonly cwd?: string
}

/**
 * Walk up from `start` to the nearest project root. Strong markers
 * (`.git`, `pnpm-workspace.yaml`) anchor at the workspace root in preference to
 * a closer weak marker (`package.json`) in a nested package dir.
 */
function walkToProjectRoot(start: string): string | null {
  return walkUp(start, STRONG_MARKERS) ?? walkUp(start, WEWP_MARKERS)
}

export function resolveProjectRoot(options: ResolveProjectRootOptions = {}): string {
  if (options.explicitCwd) return options.explicitCwd
  const env = options.env ?? process.env
  const fromEnv = env.CLAUDE_PROJECT_DIR

  // A caller-supplied cwd is a deliberate "scope to this project" signal and
  // must outrank the ambient CLAUDE_PROJECT_DIR — for a plugin-scope MCP server
  // that env var is the whole session/workspace root, so without this an
  // explicit `wp_lint`/`wp_test` cwd would scan every sibling repo. Anchor at
  // the cwd's project root; if it has no marker, defer to CLAUDE_PROJECT_DIR,
  // then throw — never silently widen the search to process.cwd().
  if (options.cwd) {
    const fromCwd = walkToProjectRoot(options.cwd)
    if (fromCwd) return fromCwd
    if (fromEnv && fromEnv.length > 0) return fromEnv
    throw new ProjectRootNotFoundError(options.cwd)
  }

  if (fromEnv && fromEnv.length > 0) return fromEnv
  const start = process.cwd()
  const fromCwd = walkToProjectRoot(start)
  if (fromCwd) return fromCwd
  throw new ProjectRootNotFoundError(start)
}
