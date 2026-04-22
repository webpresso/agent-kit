/**
 * Walks upward from startDir looking for a repo root marker. Strategy:
 *
 *   1. Prefer the highest `pnpm-workspace.yaml` or `.git` we find while
 *      walking up — those unambiguously mark the repo root.
 *   2. If neither is present anywhere upward, fall back to the closest
 *      `package.json` (single-package project).
 *   3. Throw if nothing was found.
 *
 * Inlined so this package has no external runtime dependencies.
 */
import { existsSync } from 'node:fs'
import path from 'node:path'

/** Markers that unambiguously identify a repo root. */
export const REPO_ROOT_MARKERS = ['pnpm-workspace.yaml', '.git'] as const

/**
 * Legacy single-marker export. Retained for backwards compat with callers
 * that still reference it; new code should use REPO_ROOT_MARKERS or
 * findRepoRoot().
 */
export const REPO_ROOT_MARKER = REPO_ROOT_MARKERS[0]

export function findRepoRoot(startDir: string = process.cwd()): string {
  let current = path.resolve(startDir)
  let closestPackageJson: string | null = null

  for (;;) {
    for (const marker of REPO_ROOT_MARKERS) {
      if (existsSync(path.join(current, marker))) {
        return current
      }
    }

    if (closestPackageJson === null && existsSync(path.join(current, 'package.json'))) {
      closestPackageJson = current
    }

    const parent = path.dirname(current)
    if (parent === current) {
      if (closestPackageJson !== null) {
        return closestPackageJson
      }
      throw new Error(
        `Could not find repo root (looked for ${REPO_ROOT_MARKERS.join(', ')} or a package.json). Started from: ${startDir}`,
      )
    }

    current = parent
  }
}
