import { readFileSync } from 'node:fs'
import { join, resolve } from 'node:path'
import { describe, expect, it } from 'vitest'
import { RUNTIME_TARGETS } from '#build/runtime-targets.js'

const repositoryRoot = resolve(import.meta.dirname, '..', '..')
const authPreflightWorkflowPaths = [
  join(repositoryRoot, '.github', 'workflows', 'ci.agent-kit.yml'),
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

    for (const workflowPath of authPreflightWorkflowPaths) {
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
    expect(workflow).toMatch(/uses:\s+changesets\/action@/)
    expect(workflow.includes('version: pnpm run version')).toBe(true)
    expect(workflow.includes('publish: pnpm run release:publish')).toBe(true)
    expect(workflow.includes('createGithubReleases: false')).toBe(true)
    expect(workflow.includes('pull-requests: write')).toBe(true)
    expect(workflow.includes('id-token: write')).toBe(true)
    expect(workflow.includes('secrets.NPM_TOKEN')).toBe(false)
    expect(workflow.includes('NPM_TOKEN:')).toBe(false)
    expect(workflow.includes('NODE_AUTH_TOKEN:')).toBe(false)
  })

  it('does not stage native runtime artifacts into the changesets version-PR working tree', () => {
    const workflow = readWorkflow(join(repositoryRoot, '.github', 'workflows', 'release.yml'))
    const changesetsActionIndex = workflow.indexOf('uses: changesets/action@')
    const beforeChangesetsAction = workflow.slice(0, changesetsActionIndex)
    const runtimeStageBlocks =
      beforeChangesetsAction.match(
        /- name: Stage native runtime artifacts[\s\S]*?(?=\n\s*- name:|$)/g,
      ) ?? []

    expect(runtimeStageBlocks).toHaveLength(1)
    expect(runtimeStageBlocks[0]).toContain(
      "if: ${{ github.event_name == 'workflow_dispatch' && inputs.dry-run == true }}",
    )
    expect(runtimeStageBlocks[0]).not.toContain(
      "if: ${{ github.event_name != 'workflow_dispatch' || inputs.dry-run != true }}",
    )
    expect(workflow).toContain('publish: pnpm run release:publish')
  })

  it('uses the changesets published output as the post-publish gate instead of a registry probe', () => {
    const workflow = readWorkflow(join(repositoryRoot, '.github', 'workflows', 'release.yml'))
    const changesetsActionIndex = workflow.indexOf('uses: changesets/action@')
    const afterChangesetsAction = workflow.slice(changesetsActionIndex)

    expect(afterChangesetsAction).toContain("steps.changesets.outputs.published == 'true'")
    expect(afterChangesetsAction).not.toContain("steps.publish_probe.outputs.published == 'true'")
    expect(afterChangesetsAction).toContain('id: registry_visibility')
    expect(afterChangesetsAction).toContain(
      'Publish output reported success, but npm registry visibility probe did not converge',
    )
    expect(afterChangesetsAction).toContain('if: ${{ always()')
    expect(afterChangesetsAction).toContain('Assert release finalization contract')
  })

  it('builds every native runtime target and attaches them to a GitHub Release in the publish path', () => {
    const workflow = readWorkflow(join(repositoryRoot, '.github', 'workflows', 'release.yml'))
    const changesetsActionIndex = workflow.indexOf('uses: changesets/action@')
    const afterChangesetsAction = workflow.slice(changesetsActionIndex)
    const beforeChangesetsAction = workflow.slice(0, changesetsActionIndex)

    // The full runtime matrix is compiled only AFTER the changesets action, in
    // the post-publish path — never into the version-PR working tree.
    expect(afterChangesetsAction).toContain('pnpm run build:runtime-binaries -- --target')
    expect(beforeChangesetsAction.includes('build:runtime-binaries -- --target')).toBe(false)
    for (const target of RUNTIME_TARGETS) {
      expect(afterChangesetsAction).toContain(target.id)
    }

    // A GitHub Release is created/updated with the compiled binaries attached.
    expect(afterChangesetsAction).toContain('gh release create')
    expect(afterChangesetsAction).toContain('gh release upload')
    expect(afterChangesetsAction).toContain('gh release view "$tag" --json url,assets')
    expect(afterChangesetsAction).toContain("echo \"asset_count=$asset_count\" >> \"$GITHUB_OUTPUT\"")
    expect(afterChangesetsAction).toContain('"$assets"/*')
  })
})
