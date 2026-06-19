import { readFileSync } from 'node:fs'

import { describe, expect, it } from 'vitest'

const repos = [
  '/Users/ozby/repos/ozby/ingest-lens/_worktrees/wp-secret-orchestration-20260619',
  '/Users/ozby/repos/ozby/edge-matte/_worktrees/wp-secret-orchestration-20260619',
  '/Users/ozby/repos/ozby/ozby-dev/_worktrees/wp-secret-orchestration-20260619',
  '/Users/ozby/repos/ozby/aksaprocess.tr/_worktrees/wp-secret-orchestration-20260619',
] as const

describe('cross-repo secret orchestration matrix', () => {
  it('keeps verify:secrets aligned with the shared doctor/config audits', () => {
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
