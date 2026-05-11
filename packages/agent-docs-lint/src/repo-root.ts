import { existsSync } from 'node:fs'
import path from 'node:path'

export const REPO_ROOT_MARKER = 'pnpm-workspace.yaml'

export function findRepoRoot(startDir: string = process.cwd()): string {
  let current = path.resolve(startDir)

  for (;;) {
    if (existsSync(path.join(current, REPO_ROOT_MARKER))) {
      return current
    }

    const parent = path.dirname(current)
    if (parent === current) {
      throw new Error(
        `Could not find repo root with ${REPO_ROOT_MARKER}. Started from: ${startDir}`,
      )
    }

    current = parent
  }
}
