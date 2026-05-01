/**
 * Resolve the agent-kit MCP server's *project* root.
 *
 * Why this exists: Claude Code does NOT set a reliable cwd for plugin-scope
 * MCP servers (anthropics/claude-code#42687, #17565, #19205). User-scope
 * plugin servers see `process.cwd()` set to the plugin cache path; the
 * `cwd` field in `.mcp.json` is documented but ignored. So `tsc` and
 * `oxlint` spawned with the inherited cwd would lint the wrong tree.
 *
 * Resolution order, first hit wins:
 *   1. `CLAUDE_PROJECT_DIR` env var (when set by Claude Code hooks).
 *   2. Walk up from `process.cwd()` looking for a marker:
 *      `.git`, `pnpm-workspace.yaml`, then `package.json`.
 *   3. Loud throw — diagnosing a wrong-tree lint silently is worse than
 *      forcing the caller to pass an explicit cwd.
 *
 * The walk searches `.git` and `pnpm-workspace.yaml` *before* `package.json`
 * so we anchor at the workspace root rather than at a nested package dir.
 */

import { existsSync } from 'node:fs'
import { dirname, join } from 'node:path'

const STRONG_MARKERS = ['.git', 'pnpm-workspace.yaml'] as const
const WEAK_MARKERS = ['package.json'] as const
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

export function resolveProjectRoot(options: ResolveProjectRootOptions = {}): string {
  if (options.explicitCwd) return options.explicitCwd
  const env = options.env ?? process.env
  const fromEnv = env.CLAUDE_PROJECT_DIR
  if (fromEnv && fromEnv.length > 0) return fromEnv

  const start = options.cwd ?? process.cwd()
  const fromStrong = walkUp(start, STRONG_MARKERS)
  if (fromStrong) return fromStrong
  const fromWeak = walkUp(start, WEAK_MARKERS)
  if (fromWeak) return fromWeak

  throw new ProjectRootNotFoundError(start)
}
