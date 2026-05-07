import { execFileSync } from 'node:child_process'
import { existsSync, readFileSync } from 'node:fs'
import { dirname, isAbsolute, join, resolve } from 'node:path'

function findRepoRoot(startDir: string): string {
  let current = resolve(startDir)
  for (;;) {
    if (existsSync(join(current, 'pnpm-workspace.yaml'))) return current
    const parent = dirname(current)
    if (parent === current) throw new Error(`Could not find repo root from: ${startDir}`)
    current = parent
  }
}

export function resolveActiveWorktreeRoot(cwd: string = process.cwd()): string {
  try {
    const gitDir = execFileSync('git', ['rev-parse', '--git-dir'], {
      cwd,
      encoding: 'utf8',
      stdio: ['ignore', 'pipe', 'ignore'],
    }).trim()
    const gitCommonDir = execFileSync('git', ['rev-parse', '--git-common-dir'], {
      cwd,
      encoding: 'utf8',
      stdio: ['ignore', 'pipe', 'ignore'],
    }).trim()

    if (gitDir && gitCommonDir && gitDir !== gitCommonDir) {
      const gitDirAbs = isAbsolute(gitDir) ? gitDir : resolve(cwd, gitDir)
      const worktreeGitPath = readFileSync(resolve(gitDirAbs, 'gitdir'), 'utf8').trim()
      if (worktreeGitPath.length > 0) return dirname(worktreeGitPath)
    }

    const gitRoot = execFileSync('git', ['rev-parse', '--show-toplevel'], {
      cwd,
      encoding: 'utf8',
      stdio: ['ignore', 'pipe', 'ignore'],
    }).trim()
    if (gitRoot.length > 0) return gitRoot
  } catch {
    // fall through
  }
  return findRepoRoot(cwd)
}
