import { existsSync, readdirSync } from 'node:fs'
import { join } from 'node:path'

export interface RepoCollectionRootDetection {
  readonly isCollectionRoot: boolean
  readonly childNames: readonly string[]
  readonly reason: 'nested-git-roots' | 'unmarked-repo-children' | null
}

export interface WebpressoPackageLike {
  readonly dependencies?: Record<string, string>
  readonly devDependencies?: Record<string, string>
}

const IGNORED_CHILD_DIRS = new Set(['node_modules', '.git'])
const PROJECT_MARKERS = ['package.json', 'pnpm-workspace.yaml', '.webpressorc.json'] as const
const CHILD_REPO_MARKERS = [
  '.git',
  'package.json',
  'pnpm-workspace.yaml',
  '.webpressorc.json',
  'AGENTS.md',
  'CLAUDE.md',
] as const
const WEBPRESSO_PROJECT_MARKERS = ['.webpressorc.json', '.agent', 'blueprints'] as const
const WEBPRESSO_LOCAL_PACKAGES = ['@webpresso/agent-config', '@webpresso/agent-kit'] as const

function hasAnyMarker(dir: string, markers: readonly string[]): boolean {
  return markers.some((marker) => existsSync(join(dir, marker)))
}

function listImmediateChildDirs(dir: string): string[] {
  try {
    return readdirSync(dir, { withFileTypes: true })
      .filter((entry) => entry.isDirectory())
      .map((entry) => entry.name)
      .filter((name) => !name.startsWith('.') && !IGNORED_CHILD_DIRS.has(name))
      .toSorted()
  } catch {
    return []
  }
}


function listRepoLikeDescendants(repoRoot: string, markerNames: readonly string[]): string[] {
  const matches: string[] = []
  const firstLevel = listImmediateChildDirs(repoRoot)

  for (const firstName of firstLevel) {
    const firstPath = join(repoRoot, firstName)
    if (hasAnyMarker(firstPath, markerNames)) {
      matches.push(firstName)
    }

    for (const secondName of listImmediateChildDirs(firstPath)) {
      const relativeName = join(firstName, secondName)
      if (hasAnyMarker(join(repoRoot, relativeName), markerNames)) {
        matches.push(relativeName)
      }
    }
  }

  return [...new Set(matches)].toSorted()
}

export function detectRepoCollectionRoot(repoRoot: string): RepoCollectionRootDetection {
  const nestedGitRootNames = listRepoLikeDescendants(repoRoot, ['.git'])

  if (nestedGitRootNames.length >= 2) {
    return {
      isCollectionRoot: true,
      childNames: nestedGitRootNames,
      reason: 'nested-git-roots',
    }
  }

  if (!hasAnyMarker(repoRoot, PROJECT_MARKERS)) {
    const repoLikeChildren = listRepoLikeDescendants(repoRoot, CHILD_REPO_MARKERS)
    if (repoLikeChildren.length >= 3) {
      return {
        isCollectionRoot: true,
        childNames: repoLikeChildren,
        reason: 'unmarked-repo-children',
      }
    }
  }

  return { isCollectionRoot: false, childNames: [], reason: null }
}

export function isInitializedWebpressoProject(
  repoRoot: string,
  packageJson: WebpressoPackageLike | null | undefined,
): boolean {
  if (hasAnyMarker(repoRoot, WEBPRESSO_PROJECT_MARKERS)) return true

  const dependencies = {
    ...packageJson?.dependencies,
    ...packageJson?.devDependencies,
  }
  return WEBPRESSO_LOCAL_PACKAGES.some((name) => typeof dependencies[name] === 'string')
}
