import { existsSync, readFileSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { describe, expect, it } from 'vitest'
import { RUNTIME_TARGETS } from '#build/runtime-targets.js'
import { SESSION_MEMORY_NATIVE_TARGETS } from '#session-memory/native-targets.js'

const repositoryRoot = findRepoRoot(import.meta.dirname)
const authPreflightWorkflowPaths = [
  join(repositoryRoot, '.github', 'workflows', 'ci.agent-kit.yml'),
] as const

function findRepoRoot(startDir: string): string {
  let current = startDir
  while (true) {
    if (existsSync(join(current, 'pnpm-workspace.yaml'))) return current
    const parent = dirname(current)
    if (parent === current) {
      throw new Error(`Could not locate pnpm-workspace.yaml from ${startDir}`)
    }
    current = parent
  }
}

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

    expect(manifest.dependencies?.['@webpresso/runtime']).toBe(undefined)
    expect(manifest.dependencies?.['@webpresso/framework']).toBe(undefined)
    expect(manifest.dependencies?.['webpresso']).toBe(undefined)
    expect(manifest.devDependencies?.['@webpresso/runtime']).toBe(undefined)
    expect(manifest.devDependencies?.['@webpresso/framework']).toBe(undefined)
    expect(manifest.devDependencies?.['webpresso']).toBe(undefined)

    for (const workflowPath of authPreflightWorkflowPaths) {
      const workflow = readWorkflow(workflowPath)
      expect(workflow.includes('packages: read')).toBe(true)
      expect(workflow.includes('npm view @webpresso/agent-kit@latest')).toBe(false)
      expect(workflow.includes('npm pack @webpresso/agent-kit@latest')).toBe(false)
      expect(workflow.includes('npm view @webpresso/framework@latest')).toBe(false)
      expect(workflow.includes('npm pack @webpresso/framework@latest')).toBe(false)
      expect(workflow.includes('package_type=npm&per_page=1')).toBe(false)
      expect(workflow.includes('echo "packages_token_ok=true" >> "$GITHUB_OUTPUT"')).toBe(true)
      expect(workflow.includes('agent-kit intentionally avoids an install-time dependency')).toBe(
        true,
      )
    }
  })
})

describe('release workflow publish path', () => {
  it('runs the provenance-backed release publish path on a GitHub-hosted runner', () => {
    const workflow = readWorkflow(join(repositoryRoot, '.github', 'workflows', 'release.yml'))
    expect(workflow).toContain('runs-on: ubuntu-latest')
    expect(workflow).toContain('npm provenance verification requires a GitHub-hosted runner')
  })

  it('limits GitHub-hosted release execution to real release-surface changes on main', () => {
    const workflow = readWorkflow(join(repositoryRoot, '.github', 'workflows', 'release.yml'))
    expect(workflow).toContain('paths:')
    expect(workflow).toContain("- '.changeset/**'")
    expect(workflow).toContain("- 'package.json'")
    expect(workflow).toContain("- 'packages/*/package.json'")
    expect(workflow).toContain("- 'pnpm-lock.yaml'")
    expect(workflow).toContain("- 'CHANGELOG.md'")
    expect(workflow).toContain("- 'packages/*/CHANGELOG.md'")
    expect(workflow).toContain("- 'scripts/release-publish.ts'")
  })

  it('installs release native-artifact dependencies without lifecycle scripts', () => {
    const workflow = readWorkflow(join(repositoryRoot, '.github', 'workflows', 'release.yml'))
    const nativeMatrixJob = workflow.slice(
      workflow.indexOf('  session-memory-native-artifacts:'),
      workflow.indexOf('  release:'),
    )

    expect(nativeMatrixJob).toContain('Session memory native (${{ matrix.target }})')
    expect(nativeMatrixJob).toContain('pnpm install --frozen-lockfile --ignore-scripts')
    expect(nativeMatrixJob).not.toContain('run: pnpm install --frozen-lockfile\n')
  })

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

  it('uses the explicit publish-result handoff for release finalization instead of brittle action outputs', () => {
    const workflow = readWorkflow(join(repositoryRoot, '.github', 'workflows', 'release.yml'))
    const changesetsActionIndex = workflow.indexOf('uses: changesets/action@')
    const afterChangesetsAction = workflow.slice(changesetsActionIndex)

    expect(workflow).toContain('RELEASE_PUBLISH_RESULT_FILE')
    expect(afterChangesetsAction).toContain('id: publish_result')
    expect(afterChangesetsAction).toContain(
      "steps.publish_result.outputs.should_finalize == 'true'",
    )
    expect(afterChangesetsAction).toContain('packages_json=$(')
    expect(afterChangesetsAction).toContain('root_package_published=$(')
    expect(afterChangesetsAction).toContain('non_root_package_count=$(')
    expect(afterChangesetsAction).not.toContain("steps.publish_probe.outputs.published == 'true'")
    expect(afterChangesetsAction).toContain('id: registry_visibility')
    expect(afterChangesetsAction).toContain('Assert release finalization contract')
    expect(afterChangesetsAction).toContain('gh release view "$tag" --json url,assets')
  })

  it('creates GitHub Releases for non-root workspace packages published by the custom release path', () => {
    const workflow = readWorkflow(join(repositoryRoot, '.github', 'workflows', 'release.yml'))
    const workspaceReleaseStep = workflow.slice(
      workflow.indexOf('- name: Publish workspace package GitHub Releases'),
      workflow.indexOf('- name: Build native runtime binaries for the GitHub Release'),
    )

    expect(workspaceReleaseStep).toContain(
      "steps.publish_result.outputs.non_root_package_count != '0'",
    )
    expect(workspaceReleaseStep).toContain("pkg.packageName !== '@webpresso/agent-kit'")
    expect(workspaceReleaseStep).toContain('const tag = `${pkg.packageName}@${pkg.version}`')
    expect(workspaceReleaseStep).toContain('scripts/github-release-notes.ts')
    expect(workspaceReleaseStep).toContain("'--notes-file',")
    expect(workspaceReleaseStep).not.toContain("'--notes',")
    expect(workspaceReleaseStep).toContain("execFileSync('gh', [")
    expect(workspaceReleaseStep).toContain("'release',")
    expect(workspaceReleaseStep).toContain("'create',")
    expect(workspaceReleaseStep).toContain('urls=${urls.join')
  })

  it('runs root runtime release finalization only when the root package was published', () => {
    const workflow = readWorkflow(join(repositoryRoot, '.github', 'workflows', 'release.yml'))
    const rootOnlySteps = [
      '- name: Resolve published version for artifacts',
      '- name: Create mainline release tag when missing',
      '- name: Verify tag points at the published mainline commit',
      '- name: Create marketplace compatibility branch',
      '- name: Build native runtime binaries for the GitHub Release',
      '- name: Publish GitHub Release with native runtime binaries',
      '- name: Verify GitHub Release assets',
    ]

    for (const stepName of rootOnlySteps) {
      const start = workflow.indexOf(stepName)
      const step = workflow.slice(start, workflow.indexOf('\n      - name:', start + 1))
      expect(step).toContain("steps.publish_result.outputs.root_package_published == 'true'")
    }
  })

  it('does not run local Husky hooks for the generated compatibility branch push', () => {
    const workflow = readWorkflow(join(repositoryRoot, '.github', 'workflows', 'release.yml'))
    const branchStep = workflow.slice(
      workflow.indexOf('- name: Create marketplace compatibility branch'),
      workflow.indexOf('- name: Build native runtime binaries for the GitHub Release'),
    )

    expect(branchStep).toContain('HUSKY=0 git commit')
    expect(branchStep).toContain('HUSKY=0 git push origin "HEAD:refs/heads/${branch}"')
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
    expect(afterChangesetsAction).toContain('scripts/github-release-notes.ts')
    expect(afterChangesetsAction).toContain('--runtime-assets')
    expect(afterChangesetsAction).toContain('--notes-file "$notes_file"')
    expect(afterChangesetsAction).toContain(
      'gh release edit "$tag" --title "v${version}" --notes-file "$notes_file"',
    )
    expect(afterChangesetsAction).toContain('gh release create')
    expect(afterChangesetsAction).toContain('gh release upload')
    expect(afterChangesetsAction).toContain('echo "asset_count=$asset_count" >> "$GITHUB_OUTPUT"')
    expect(afterChangesetsAction).toContain('"$assets"/*')
  })

  it('fails closed unless every session-memory native optional package is staged for publish', () => {
    const releasePublish = readFileSync(
      join(repositoryRoot, 'scripts', 'release-publish.ts'),
      'utf8',
    )

    expect(releasePublish).toContain('assertPreparedSessionMemoryNativePackages')
    expect(releasePublish).toContain("run('pnpm', ['run', 'stage:session-memory-native'])")
    expect(releasePublish).not.toContain(
      "'build:session-memory-native',\n    '--',\n    '--target',\n    'host'",
    )
    expect(releasePublish).not.toContain(
      "if (!existsSync(resolve(preparedPackageRoot, 'package.json'))) continue",
    )
    expect(SESSION_MEMORY_NATIVE_TARGETS).toHaveLength(6)
  })
})
