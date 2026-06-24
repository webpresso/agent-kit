import { execFileSync } from 'node:child_process'
import { existsSync, mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'

import { afterEach, describe, expect, it, vi } from 'vitest'

import { resolveCatalogDir } from './index.js'
import { detectConsumer } from './detect-consumer.js'
import { runSelfHostSetup } from './self-host.js'

function makeAgentKitRepo(realGit = false): string {
  const repo = mkdtempSync(join(tmpdir(), 'wp-self-host-'))
  if (realGit) {
    execFileSync('git', ['init'], { cwd: repo, stdio: 'ignore' })
  } else {
    mkdirSync(join(repo, '.git'), { recursive: true })
  }
  writeFileSync(
    join(repo, 'package.json'),
    JSON.stringify({ name: '@webpresso/agent-kit', private: true }, null, 2),
  )
  return repo
}

function commitAll(repo: string): void {
  execFileSync('git', ['add', '.'], { cwd: repo, stdio: 'ignore' })
  execFileSync('git', ['commit', '-m', 'initial'], {
    cwd: repo,
    stdio: 'ignore',
    env: {
      ...process.env,
      GIT_AUTHOR_NAME: 'Test',
      GIT_AUTHOR_EMAIL: 'test@example.com',
      GIT_COMMITTER_NAME: 'Test',
      GIT_COMMITTER_EMAIL: 'test@example.com',
    },
  })
}

function consumerFor(repo: string) {
  const consumer = detectConsumer(repo)
  expect(consumer).not.toBeNull()
  return consumer!
}

function parseDriftOutput(log: ReturnType<typeof vi.spyOn>): unknown[] {
  return log.mock.calls
    .map((call) => call.join(' '))
    .filter((line) => line.startsWith('  {'))
    .map((line) => JSON.parse(line.trim()) as unknown)
}

// Real-git + real-subprocess integration suite (git init/add/commit plus
// per-call `git status` round-trips inside runSelfHostSetup). Solo runtime is
// ~5s; under parallel-fork contention the heaviest real-git case exceeds the
// 10s unit default. Mirror the sibling `init.integration.test.ts` real-process
// describe, which sets the same kind of measured per-suite budget.
describe('source-repo self-host setup', { timeout: 20_000 }, () => {
  const cleanup = new Set<string>()

  afterEach(() => {
    vi.restoreAllMocks()
    for (const repo of cleanup) rmSync(repo, { recursive: true, force: true })
    cleanup.clear()
  })

  it('checks hook-contract drift without writing and reports the exact repair command', async () => {
    const repo = makeAgentKitRepo()
    cleanup.add(repo)
    const log = vi.spyOn(console, 'log').mockImplementation(() => {})

    const result = await runSelfHostSetup({
      consumer: consumerFor(repo),
      catalogDir: resolveCatalogDir(),
      flags: { phase: 'hook-contracts' },
    })

    expect(result.ok).toBe(true)
    expect(existsSync(join(repo, '.claude', 'settings.json'))).toBe(false)
    expect(existsSync(join(repo, '.codex', 'hooks.json'))).toBe(false)
    expect(parseDriftOutput(log)).toEqual([
      {
        phase: 'hook-contracts',
        path: '.claude/settings.json',
        reason: 'managed content would change',
        applyCommand: 'wp setup --apply --phase hook-contracts',
      },
      {
        phase: 'hook-contracts',
        path: '.codex/hooks.json',
        reason: 'managed content would change',
        applyCommand: 'wp setup --apply --phase hook-contracts',
      },
    ])
  })

  it('applies hook-contracts without writing runtime hook files or user-home settings', async () => {
    const repo = makeAgentKitRepo(true)
    cleanup.add(repo)
    commitAll(repo)
    const home = join(repo, 'home')
    mkdirSync(home, { recursive: true })
    const originalHome = process.env.HOME
    process.env.HOME = home
    try {
      const result = await runSelfHostSetup({
        consumer: consumerFor(repo),
        catalogDir: resolveCatalogDir(),
        flags: { apply: true, phase: 'hook-contracts' },
      })

      expect(result.ok).toBe(true)
      expect(existsSync(join(repo, '.claude', 'settings.json'))).toBe(true)
      expect(existsSync(join(repo, '.codex', 'hooks.json'))).toBe(true)
      expect(existsSync(join(repo, '.claude', 'hooks'))).toBe(false)
      expect(existsSync(join(repo, '.codex', 'managed-hooks'))).toBe(false)
      expect(existsSync(join(home, '.claude', 'settings.json'))).toBe(false)
    } finally {
      if (originalHome === undefined) delete process.env.HOME
      else process.env.HOME = originalHome
    }
  })

  it('applies runtime-hooks and then reports that runtime-hooks are clean', async () => {
    const repo = makeAgentKitRepo(true)
    cleanup.add(repo)
    commitAll(repo)
    const log = vi.spyOn(console, 'log').mockImplementation(() => {})

    const applied = await runSelfHostSetup({
      consumer: consumerFor(repo),
      catalogDir: resolveCatalogDir(),
      flags: { apply: true, phase: 'runtime-hooks' },
    })

    expect(applied.ok).toBe(true)
    expect(existsSync(join(repo, '.claude', 'hooks', 'managed', 'wp-pretool-guard.sh'))).toBe(true)
    expect(existsSync(join(repo, '.codex', 'managed-hooks', 'wp-pretool-guard.sh'))).toBe(true)
    expect(existsSync(join(repo, '.webpresso', 'hooks-manifest.json'))).toBe(true)

    log.mockClear()
    const checked = await runSelfHostSetup({
      consumer: consumerFor(repo),
      catalogDir: resolveCatalogDir(),
      flags: { phase: 'runtime-hooks' },
    })

    expect(checked.ok).toBe(true)
    expect(log.mock.calls.map((call) => call.join(' '))).toEqual([
      `wp setup: source repo self-host check clean in ${repo}.`,
    ])
  })

  it('rejects self-host apply when unrelated dirty files are present', async () => {
    const repo = makeAgentKitRepo(true)
    cleanup.add(repo)
    commitAll(repo)
    writeFileSync(join(repo, 'README.md'), 'dirty\n')

    const result = await runSelfHostSetup({
      consumer: consumerFor(repo),
      catalogDir: resolveCatalogDir(),
      flags: { apply: true, phase: 'hook-contracts' },
    })

    expect(result).toEqual({
      ok: false,
      reason:
        'wp setup: refusing self-host apply; dirty paths outside the selected phase allowlist: README.md',
    })
  })

  it('requires --phase when applying in an agent-kit source repo', async () => {
    const repo = makeAgentKitRepo()
    cleanup.add(repo)

    const result = await runSelfHostSetup({
      consumer: consumerFor(repo),
      catalogDir: resolveCatalogDir(),
      flags: { apply: true },
    })

    expect(result).toEqual({
      ok: false,
      reason: 'wp setup: --apply in @webpresso/agent-kit requires --phase <phase>.',
    })
  })

  it('rejects invalid self-host phases', async () => {
    const repo = makeAgentKitRepo()
    cleanup.add(repo)

    const result = await runSelfHostSetup({
      consumer: consumerFor(repo),
      catalogDir: resolveCatalogDir(),
      flags: { phase: 'global-installs' },
    })

    expect(result).toEqual({
      ok: false,
      reason:
        'wp setup: invalid --phase "global-installs". Expected one of: hook-contracts, projections, agents-md, gitignore, runtime-hooks, all-safe.',
    })
  })

  it('fails closed when git status cannot inspect the dirty-path allowlist', async () => {
    const repo = makeAgentKitRepo()
    cleanup.add(repo)

    const result = await runSelfHostSetup({
      consumer: consumerFor(repo),
      catalogDir: resolveCatalogDir(),
      flags: { apply: true, phase: 'hook-contracts' },
    })

    expect(result.ok).toBe(false)
    expect(result.ok === false ? result.reason : '').toContain(
      'wp setup: refusing self-host apply; could not inspect git status for dirty-path allowlist',
    )
  })

  it('does not clean generated files from the git index during gitignore apply by default', async () => {
    const repo = makeAgentKitRepo(true)
    cleanup.add(repo)
    mkdirSync(join(repo, '.codex'), { recursive: true })
    writeFileSync(join(repo, '.codex', 'hooks.json'), '{}\n')
    execFileSync('git', ['add', '-f', '.codex/hooks.json'], { cwd: repo, stdio: 'ignore' })
    commitAll(repo)

    const result = await runSelfHostSetup({
      consumer: consumerFor(repo),
      catalogDir: resolveCatalogDir(),
      flags: { apply: true, phase: 'gitignore' },
    })

    expect(result.ok).toBe(true)
    expect(
      execFileSync('git', ['ls-files', '--', '.codex/hooks.json'], {
        cwd: repo,
        encoding: 'utf8',
      }).trim(),
    ).toBe('.codex/hooks.json')
  })

  it('cleans generated files from the git index only with the explicit cleanup flag', async () => {
    const repo = makeAgentKitRepo(true)
    cleanup.add(repo)
    mkdirSync(join(repo, '.codex'), { recursive: true })
    writeFileSync(join(repo, '.codex', 'hooks.json'), '{}\n')
    execFileSync('git', ['add', '-f', '.codex/hooks.json'], { cwd: repo, stdio: 'ignore' })
    commitAll(repo)

    const result = await runSelfHostSetup({
      consumer: consumerFor(repo),
      catalogDir: resolveCatalogDir(),
      flags: { apply: true, phase: 'gitignore', cleanupGitignoredIndex: true },
    })

    expect(result.ok).toBe(true)
    expect(
      execFileSync('git', ['ls-files', '--', '.codex/hooks.json'], {
        cwd: repo,
        encoding: 'utf8',
      }).trim(),
    ).toBe('')
  })
})
