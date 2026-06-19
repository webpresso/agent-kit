import { spawnSync } from 'node:child_process'
import { existsSync, mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'

import { afterEach, describe, expect, it, vi } from 'vitest'

import { EXIT_SUCCESS, runInit } from './index.js'
import { detectRepoCollectionRoot, isInitializedWebpressoProject } from './repo-collection-guard.js'

function makeGitRepo(prefix: string): string {
  const dir = mkdtempSync(join(tmpdir(), prefix))
  spawnSync('git', ['init', '-q'], { cwd: dir })
  return dir
}

function makeNestedGitRoot(parent: string, name: string): void {
  const child = join(parent, name)
  mkdirSync(child, { recursive: true })
  mkdirSync(join(child, '.git'))
}

describe('repo collection root guard', () => {
  const cleanup: string[] = []

  afterEach(() => {
    vi.restoreAllMocks()
    for (const dir of cleanup.splice(0)) {
      rmSync(dir, { recursive: true, force: true })
    }
  })

  it('detects a parent folder containing nested git repos even when accidental setup markers exist', () => {
    const root = makeGitRepo('wp-repo-collection-')
    cleanup.push(root)
    writeFileSync(join(root, 'package.json'), '{"name":"my-app","private":true}\n')
    writeFileSync(join(root, '.webpressorc.json'), '{}\n')
    makeNestedGitRoot(root, 'webpresso')
    makeNestedGitRoot(root, 'ozby')

    expect(detectRepoCollectionRoot(root)).toMatchObject({
      isCollectionRoot: true,
      childNames: ['ozby', 'webpresso'],
      reason: 'nested-git-roots',
    })
  })

  it('detects an organization folder that groups repos one level down', () => {
    const root = makeGitRepo('wp-org-collection-')
    cleanup.push(root)
    makeNestedGitRoot(join(root, 'webpresso'), 'framework')
    makeNestedGitRoot(join(root, 'ozby'), 'ingest-lens')

    expect(detectRepoCollectionRoot(root)).toMatchObject({
      isCollectionRoot: true,
      childNames: ['ozby/ingest-lens', 'webpresso/framework'],
      reason: 'nested-git-roots',
    })
  })

  it('does not classify an empty project repo or normal pnpm monorepo as a repo collection', () => {
    const emptyRepo = makeGitRepo('wp-empty-project-')
    const monorepo = makeGitRepo('wp-monorepo-')
    cleanup.push(emptyRepo, monorepo)
    writeFileSync(join(monorepo, 'package.json'), '{"name":"workspace","private":true}\n')
    writeFileSync(join(monorepo, 'pnpm-workspace.yaml'), 'packages:\n  - packages/*\n')
    mkdirSync(join(monorepo, 'packages', 'app'), { recursive: true })
    writeFileSync(join(monorepo, 'packages', 'app', 'package.json'), '{"name":"app"}\n')

    expect(detectRepoCollectionRoot(emptyRepo).isCollectionRoot).toBe(false)
    expect(detectRepoCollectionRoot(monorepo).isCollectionRoot).toBe(false)
  })

  it('recognizes initialized Webpresso project markers and local package pins', () => {
    const root = makeGitRepo('wp-webpresso-project-')
    cleanup.push(root)

    expect(isInitializedWebpressoProject(root, null)).toBe(false)

    mkdirSync(join(root, '.agent'), { recursive: true })
    expect(isInitializedWebpressoProject(root, null)).toBe(true)

    rmSync(join(root, '.agent'), { recursive: true, force: true })
    expect(
      isInitializedWebpressoProject(root, {
        devDependencies: { '@webpresso/agent-config': '^1.0.0' },
      }),
    ).toBe(true)
  })

  it('falls back to user-only setup without writing repo files in a repo collection parent', async () => {
    const root = makeGitRepo('wp-repos-parent-')
    cleanup.push(root)
    makeNestedGitRoot(join(root, 'webpresso'), 'framework')
    makeNestedGitRoot(join(root, 'ozby'), 'ingest-lens')

    vi.spyOn(console, 'log').mockImplementation(() => {})
    vi.spyOn(console, 'warn').mockImplementation(() => {})
    vi.spyOn(console, 'error').mockImplementation(() => {})
    const exitCode = await runInit({ cwd: root, yes: true, with: 'base-kit', dryRun: true })

    expect(exitCode).toBe(EXIT_SUCCESS)
    expect(existsSync(join(root, 'package.json'))).toBe(false)
    expect(existsSync(join(root, '.webpressorc.json'))).toBe(false)
    expect(existsSync(join(root, 'oxlint.config.ts'))).toBe(false)
    expect(existsSync(join(root, 'node_modules'))).toBe(false)
    expect(existsSync(join(root, '.agent'))).toBe(false)
  })

  it('falls back to user-only setup for a non-Webpresso repo unless --project-init is passed', async () => {
    const root = makeGitRepo('wp-plain-project-')
    cleanup.push(root)

    const warnSpy = vi.spyOn(console, 'warn').mockImplementation(() => {})
    vi.spyOn(console, 'log').mockImplementation(() => {})
    vi.spyOn(console, 'error').mockImplementation(() => {})

    const exitCode = await runInit({ cwd: root, yes: true, dryRun: true })

    expect(exitCode).toBe(EXIT_SUCCESS)
    expect(warnSpy.mock.calls.join('\n')).toContain(
      'does not look like an initialized Webpresso project',
    )
    expect(existsSync(join(root, '.webpressorc.json'))).toBe(false)
    expect(existsSync(join(root, '.agent'))).toBe(false)
  })
})
