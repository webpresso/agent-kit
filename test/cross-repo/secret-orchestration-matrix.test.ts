import { existsSync, readFileSync } from 'node:fs'

import { describe, expect, it } from 'vitest'

const repoCandidates = {
  'ozby/ingest-lens': [
    '/Users/ozby/repos/ozby/ingest-lens/_worktrees/wp-secret-orchestration-ingest-lens-20260619',
    '/Users/ozby/repos/ozby/ingest-lens/_worktrees/wp-secret-orchestration-20260619',
  ],
  'ozby/edge-matte': [
    '/Users/ozby/repos/ozby/edge-matte/_worktrees/wp-secret-orchestration-20260619',
  ],
  'ozby/ozby-dev': ['/Users/ozby/repos/ozby/ozby-dev/_worktrees/wp-secret-orchestration-20260619'],
  'ozby/aksaprocess.tr': [
    '/Users/ozby/repos/ozby/aksaprocess.tr/_worktrees/wp-secret-orchestration-20260619',
  ],
} as const

function existingRepoPaths(): readonly string[] {
  return Object.values(repoCandidates)
    .map((candidates) => candidates.find((repo) => existsSync(`${repo}/package.json`)))
    .filter((repo): repo is string => Boolean(repo))
}

describe('cross-repo secret orchestration matrix', () => {
  it('keeps verify:secrets aligned with the shared doctor/config audits when sibling worktrees are available', () => {
    const repos = existingRepoPaths()
    if (repos.length === 0) {
      expect(repos).toHaveLength(0)
      return
    }

    for (const repo of repos) {
      const packageJson = JSON.parse(readFileSync(`${repo}/package.json`, 'utf8')) as {
        scripts?: Record<string, string>
      }
      const verifySecrets = packageJson.scripts?.['verify:secrets'] ?? ''
      expect(verifySecrets).toContain('wp audit secret-provider-quarantine')
      expect(verifySecrets).toContain('wp audit secrets-config')
      expect(verifySecrets).toContain('wp secrets doctor --profile preview --json')
    }
  })
})
