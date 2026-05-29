import { execSync } from 'node:child_process'

/**
 * Run Stryker only on packages changed vs. the base branch.
 * Returns 0 on success, 1 if any package fails its break threshold.
 *
 * Reads GITHUB_BASE_REF (set by GitHub Actions on pull_request events) to
 * determine the base branch; falls back to "main".
 */
export function runAffectedMutation(): 0 | 1 {
  const base = process.env.GITHUB_BASE_REF ?? 'main'
  const changed = execSync(`git diff --name-only origin/${base}...HEAD`)
    .toString()
    .trim()
    .split('\n')
    .filter(Boolean)

  const affectedPkgs = new Set<string>()
  for (const file of changed) {
    const match = file.match(/^(apps\/[^/]+|packages\/[^/]+)\//)
    if (match) affectedPkgs.add(match[1] as string)
  }

  if (affectedPkgs.size === 0) {
    console.log('No affected packages — skipping mutation.')
    return 0
  }

  for (const pkg of affectedPkgs) {
    try {
      execSync(`pnpm --filter ./${pkg} mutation --if-present`, { stdio: 'inherit' })
    } catch {
      return 1
    }
  }

  return 0
}
