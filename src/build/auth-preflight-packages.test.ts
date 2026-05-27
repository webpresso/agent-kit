import { readFileSync } from 'node:fs'
import { join, resolve } from 'node:path'
import { describe, expect, it } from 'vitest'

const repositoryRoot = resolve(import.meta.dirname, '..', '..')
const workflowPaths = [
  join(repositoryRoot, '.github', 'workflows', 'ci.webpresso.yml'),
  join(repositoryRoot, '.github', 'workflows', 'bundle-smoke.yml'),
  join(repositoryRoot, '.github', 'workflows', 'release.yml'),
] as const

function readWorkflow(path: string): string {
  return readFileSync(path, 'utf8')
}

function extractPackageProbeUrls(workflow: string): string[] {
  return [...workflow.matchAll(/\$\{api_base\}\/(?:orgs|users)\/\$\{owner\}\/packages\?package_type=npm&per_page=1/g)].map(
    (match) => match[0]!,
  )
}

describe('auth preflight package probes', () => {
  it('checks package registry access without requiring an existing latest package', () => {
    for (const workflowPath of workflowPaths) {
      const workflow = readWorkflow(workflowPath)
      expect(workflow.includes('packages: read')).toBe(true)
      expect(workflow.includes('npm view @webpresso/agent-kit@latest')).toBe(false)
      expect(workflow.includes('npm pack @webpresso/agent-kit@latest')).toBe(false)
      expect(workflow.includes('GITHUB_API_URL: ${{ github.api_url }}')).toBe(true)
      expect(workflow.includes('GITHUB_REPOSITORY_OWNER: ${{ github.repository_owner }}')).toBe(true)
      expect(extractPackageProbeUrls(workflow)).toEqual([
        '${api_base}/orgs/${owner}/packages?package_type=npm&per_page=1',
        '${api_base}/users/${owner}/packages?package_type=npm&per_page=1',
      ])
    }
  })
})


describe('release workflow publish path', () => {
  it('publishes with pnpm directly instead of changeset publish', () => {
    const workflow = readWorkflow(join(repositoryRoot, '.github', 'workflows', 'release.yml'))
    expect(workflow.includes('pnpm changeset publish')).toBe(false)
    expect(workflow.includes('pnpm publish --no-git-checks')).toBe(true)
    expect(workflow.includes("grep -qi 'cannot publish over the previously published version' \"$publish_log\"" )).toBe(true)
  })
})
