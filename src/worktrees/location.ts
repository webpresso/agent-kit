import { createHash } from 'node:crypto'
import { homedir } from 'node:os'
import { basename, join } from 'node:path'

export const MANAGED_WORKTREE_ROOT_RELATIVE = '.agent/worktrees'

export interface RepoNamespaceInput {
  readonly originUrl?: string | null
  readonly repoRoot: string
}

export interface WorktreeLocationOptions {
  readonly homeDir?: string
  readonly originUrl?: string | null
}

function shortHash(value: string): string {
  return createHash('sha256').update(value).digest('hex').slice(0, 10)
}

function sanitizeNamespaceSegment(value: string): string {
  return (
    value
      .trim()
      .toLowerCase()
      .replace(/^git\+/, '')
      .replace(/^ssh:\/\//, '')
      .replace(/^https?:\/\//, '')
      .replace(/^git@([^:]+):/, '$1/')
      .replace(/\.git$/i, '')
      .replace(/[^a-z0-9_.-]+/g, '-')
      .replace(/-+/g, '-')
      .replace(/^-+|-+$/g, '') || 'repo'
  )
}

export function resolveManagedWorktreeRoot(homeDir = homedir()): string {
  return join(homeDir, MANAGED_WORKTREE_ROOT_RELATIVE)
}

export function deriveRepoNamespace(input: RepoNamespaceInput): string {
  const origin = input.originUrl?.trim()
  if (origin) {
    const normalized = sanitizeNamespaceSegment(origin)
    return `${normalized}-${shortHash(origin.toLowerCase())}`
  }

  const repoName = sanitizeNamespaceSegment(basename(input.repoRoot))
  return `local-${repoName}-${shortHash(input.repoRoot)}`
}

/**
 * Resolve the agent-kit managed root for a repository checkout.
 *
 * V1 is intentionally fixed under the user-global root: no repository or user
 * override is accepted for managed worktrees.
 */
export function resolveWorktreeRoot(repoRoot: string, options: WorktreeLocationOptions = {}): string {
  return join(
    resolveManagedWorktreeRoot(options.homeDir),
    'repos',
    deriveRepoNamespace({ repoRoot, originUrl: options.originUrl }),
  )
}

export function resolveBlueprintWorktreeRoot(
  repoRoot: string,
  slug: string,
  options: WorktreeLocationOptions = {},
): string {
  return join(resolveWorktreeRoot(repoRoot, options), 'blueprints', slug)
}

export function resolveOwnerWorktreePath(
  repoRoot: string,
  slug: string,
  options: WorktreeLocationOptions = {},
): string {
  return join(resolveBlueprintWorktreeRoot(repoRoot, slug, options), 'owner')
}

export function resolveScratchWorktreePath(
  repoRoot: string,
  slug: string,
  lane: string,
  id: string,
  options: WorktreeLocationOptions = {},
): string {
  return join(
    resolveBlueprintWorktreeRoot(repoRoot, slug, options),
    '.scratch',
    `${sanitizeNamespaceSegment(lane)}-${sanitizeNamespaceSegment(id)}`,
  )
}

/**
 * Resolve a generated child worktree path below the shared worktree root.
 */
export function resolveGeneratedWorktreePath(worktreeRoot: string, slug: string): string {
  return join(worktreeRoot, slug)
}
