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

function readPackageManifest(): {
  dependencies?: Record<string, string>
  devDependencies?: Record<string, string>
} {
  return JSON.parse(readFileSync(join(repositoryRoot, 'package.json'), 'utf8')) as {
    dependencies?: Record<string, string>
    devDependencies?: Record<string, string>
  }
}

describe('auth preflight package probes', () => {
  it('skips package registry probing when agent-kit has no install-time framework package dependency', () => {
    const manifest = readPackageManifest()

    expect(manifest.dependencies?.['@webpresso/runtime']).toBeUndefined()
    expect(manifest.dependencies?.['@webpresso/webpresso']).toBeUndefined()
    expect(manifest.devDependencies?.['@webpresso/runtime']).toBeUndefined()
    expect(manifest.devDependencies?.['@webpresso/webpresso']).toBeUndefined()

    for (const workflowPath of workflowPaths) {
      const workflow = readWorkflow(workflowPath)
      expect(workflow.includes('packages: read')).toBe(true)
      expect(workflow.includes('npm view @webpresso/agent-kit@latest')).toBe(false)
      expect(workflow.includes('npm pack @webpresso/agent-kit@latest')).toBe(false)
      expect(workflow.includes('npm view @webpresso/webpresso@latest')).toBe(false)
      expect(workflow.includes('npm pack @webpresso/webpresso@latest')).toBe(false)
      expect(workflow.includes('package_type=npm&per_page=1')).toBe(false)
      expect(workflow.includes('echo "packages_token_ok=true" >> "$GITHUB_OUTPUT"')).toBe(true)
      expect(workflow.includes('agent-kit intentionally avoids an install-time dependency')).toBe(
        true,
      )
    }
  })
})

describe('release workflow publish path', () => {
  it('publishes with npm public/provenance flow instead of legacy changeset or GitHub Packages publish', () => {
    const workflow = readWorkflow(join(repositoryRoot, '.github', 'workflows', 'release.yml'))
    expect(workflow.includes('pnpm changeset publish')).toBe(false)
    expect(workflow.includes('pnpm publish --no-git-checks')).toBe(false)
    expect(workflow.includes('npm publish --provenance --access public')).toBe(true)
    expect(workflow.includes('cannot publish over the previously published version')).toBe(true)
  })
})
