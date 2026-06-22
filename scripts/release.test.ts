/**
 * Integration test for `scripts/release.ts`.
 *
 * Strategy: build a temp git repo on disk (with optional bare remote) and
 * execute the real release script against it. This exercises the actual git
 * invocations rather than mocking them, which catches argv/escaping bugs that
 * a pure unit test would miss.
 *
 * The script under test runs `pnpm build` as part of its sequence. To keep
 * this test hermetic and fast, the fixture repo provides a stub `package.json`
 * whose `build` script is a no-op (`node -e "process.exit(0)"`). The script
 * therefore exercises every git step end-to-end without depending on tshy.
 */
import { execFileSync, spawnSync } from 'node:child_process'
import { existsSync, mkdtempSync, mkdirSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join, resolve } from 'node:path'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'

const SCRIPT_PATH = resolve(__dirname, 'release.ts')
const FAST_GIT_ENV = {
  ...process.env,
  GIT_AUTHOR_EMAIL: 'test@example.com',
  GIT_AUTHOR_NAME: 'Release Test',
  GIT_COMMITTER_EMAIL: 'test@example.com',
  GIT_COMMITTER_NAME: 'Release Test',
  GIT_CONFIG_COUNT: '3',
  GIT_CONFIG_GLOBAL: '/dev/null',
  GIT_CONFIG_KEY_0: 'core.fsync',
  GIT_CONFIG_KEY_1: 'commit.gpgsign',
  GIT_CONFIG_KEY_2: 'tag.gpgsign',
  GIT_CONFIG_NOSYSTEM: '1',
  GIT_CONFIG_VALUE_0: 'none',
  GIT_CONFIG_VALUE_1: 'false',
  GIT_CONFIG_VALUE_2: 'false',
}

interface Fixture {
  binDir: string
  repoDir: string
  remoteDir: string
  cleanup: () => void
}

const fixtureForCwd = new Map<string, Fixture>()

function git(cwd: string, args: readonly string[]): string {
  return execFileSync('git', [...args], { cwd, encoding: 'utf8', env: FAST_GIT_ENV }).toString()
}

function refs(cwd: string): string[] {
  return git(cwd, ['for-each-ref', '--format=%(refname:short)', 'refs/heads', 'refs/tags'])
    .trim()
    .split('\n')
    .filter(Boolean)
}

function runScript(
  cwd: string,
  flags: readonly string[],
): { stdout: string; stderr: string; status: number } {
  const result = spawnSync('bun', [SCRIPT_PATH, ...flags], {
    cwd,
    encoding: 'utf8',
    stdio: ['ignore', 'pipe', 'pipe'],
    env: {
      ...FAST_GIT_ENV,
      PATH: [fixtureForCwd.get(cwd)?.binDir, process.env.PATH].filter(Boolean).join(':'),
    },
  })

  return {
    stdout: result.stdout ?? '',
    stderr: result.stderr ?? '',
    status: result.status ?? 1,
  }
}

function createFixture({ withRemote = false }: { withRemote?: boolean } = {}): Fixture {
  const root = mkdtempSync(join(tmpdir(), 'wp-release-'))
  const binDir = join(root, 'bin')
  const repoDir = join(root, 'repo')
  const remoteDir = join(root, 'remote.git')
  mkdirSync(binDir, { recursive: true })
  mkdirSync(repoDir, { recursive: true })

  // Initialize repo with a default branch named `main` so the assertion below
  // is deterministic across user-level git config differences.
  git(repoDir, ['init', '-q', '-b', 'main'])

  // Stub package.json with a no-op build so the script's pnpm build call
  // succeeds without actually invoking tshy. The script invokes `pnpm build`,
  // which pnpm resolves via the local package.json#scripts.build.
  const pkg = {
    name: 'fixture-pkg',
    version: '9.9.9',
    private: true,
    scripts: {
      build: 'node -e "process.exit(0)"',
    },
  }
  writeFileSync(join(repoDir, 'package.json'), JSON.stringify(pkg, null, 2) + '\n')
  // Pre-populate dist/ so `git add -f dist` has something to add. The real
  // pnpm build would do this; we shortcut for hermeticity.
  mkdirSync(join(repoDir, 'dist'), { recursive: true })
  writeFileSync(join(repoDir, 'dist', 'index.js'), '// fake build output\n')
  // Gitignore dist/ to mirror the real repo and confirm the script's `-f` flag works.
  writeFileSync(join(repoDir, '.gitignore'), 'dist/\n')
  writeFileSync(
    join(binDir, 'pnpm'),
    ['#!/bin/sh', "grep -q 'process.exit(1)' package.json && exit 1", 'exit 0', ''].join('\n'),
    'utf8',
  )
  execFileSync('chmod', ['+x', join(binDir, 'pnpm')])

  git(repoDir, ['add', 'package.json', '.gitignore'])
  git(repoDir, ['commit', '-q', '-m', 'initial commit'])

  if (withRemote) {
    mkdirSync(remoteDir, { recursive: true })
    git(remoteDir, ['init', '--bare', '-q', '-b', 'main'])
    git(repoDir, ['remote', 'add', 'origin', remoteDir])
  }

  const fixture = {
    binDir,
    repoDir,
    remoteDir,
    cleanup: () => {
      try {
        rmSync(root, { recursive: true, force: true })
      } catch {
        // ignore cleanup failures in tests
      } finally {
        fixtureForCwd.delete(repoDir)
      }
    },
  } satisfies Fixture
  fixtureForCwd.set(repoDir, fixture)
  return fixture
}

describe('scripts/release.ts', () => {
  let fixture: Fixture | undefined

  afterEach(() => {
    fixture?.cleanup()
    fixture = undefined
  })

  describe('--dry-run (default)', () => {
    beforeEach(() => {
      fixture = createFixture({ withRemote: false })
    })

    it('creates the release branch and tag locally without pushing', () => {
      const f = fixture!
      const result = runScript(f.repoDir, ['--dry-run'])

      expect(result.status, `script failed: ${result.stderr}`).toBe(0)
      expect(result.stdout).toContain('[dry-run]')
      expect(result.stdout).toContain('v9.9.9')
      // Tag must exist locally.
      const localRefs = refs(f.repoDir)
      expect(localRefs).toContain('v9.9.9')
      expect(localRefs).toContain('release/v9.9.9')
      // Original branch restored.
      const current = git(f.repoDir, ['rev-parse', '--abbrev-ref', 'HEAD']).trim()
      expect(current).toBe('main')
    })

    it('aborts when the working tree is dirty (tracked change)', () => {
      const f = fixture!
      writeFileSync(join(f.repoDir, 'package.json'), '{"name":"dirty"}\n')
      const result = runScript(f.repoDir, ['--dry-run'])
      expect(result.status).not.toBe(0)
      expect(result.stderr + result.stdout).toMatch(/working tree.*not clean|dirty/i)
    })

    it('proceeds when only untracked files are present', () => {
      const f = fixture!
      // Use a filename not matched by .gitignore (which only ignores dist/).
      // Pre-assert it appears in porcelain output so the test is not vacuous:
      // an ignored file is absent from porcelain and the test would pass even
      // against the git-status--porcelain version, proving nothing.
      const untrackedFile = join(f.repoDir, 'UNTRACKED_PROOF.txt')
      writeFileSync(untrackedFile, 'untracked\n')
      const porcelain = git(f.repoDir, ['status', '--porcelain'])
      expect(porcelain).toContain('UNTRACKED_PROOF.txt')

      const result = runScript(f.repoDir, ['--dry-run'])
      expect(result.status, `release should proceed with untracked file: ${result.stderr}`).toBe(0)
    })

    it('aborts when pnpm build fails', () => {
      const f = fixture!
      // Replace stub with a build that exits non-zero.
      const pkg = {
        name: 'fixture-pkg',
        version: '9.9.9',
        private: true,
        scripts: { build: 'node -e "process.exit(1)"' },
      }
      writeFileSync(join(f.repoDir, 'package.json'), JSON.stringify(pkg, null, 2) + '\n')
      git(f.repoDir, ['add', 'package.json'])
      git(f.repoDir, ['commit', '-q', '-m', 'make build fail'])

      const result = runScript(f.repoDir, ['--dry-run'])
      expect(result.status).not.toBe(0)
      expect(result.stderr + result.stdout).toMatch(/build/i)
    })
  })

  describe('--no-dry-run', () => {
    beforeEach(() => {
      fixture = createFixture({ withRemote: true })
    })

    it('pushes the tag and release branch to origin', { timeout: 20000 }, () => {
      const f = fixture!
      const result = runScript(f.repoDir, ['--no-dry-run'])

      expect(result.status, `script failed: ${result.stderr}`).toBe(0)
      // Tag landed on remote.
      const remoteRefs = refs(f.remoteDir)
      expect(remoteRefs).toContain('v9.9.9')
      expect(remoteRefs).toContain('release/v9.9.9')
      // Original branch restored.
      const current = git(f.repoDir, ['rev-parse', '--abbrev-ref', 'HEAD']).trim()
      expect(current).toBe('main')
    })

    it('tags the mainline commit and keeps the dist commit on the compatibility branch', () => {
      const f = fixture!
      const result = runScript(f.repoDir, ['--dry-run'])

      expect(result.status, `script failed: ${result.stderr}`).toBe(0)

      const [mainBefore, tagCommit, branchCommit] = git(f.repoDir, [
        'rev-parse',
        'main',
        'v9.9.9^{commit}',
        'release/v9.9.9',
      ])
        .trim()
        .split('\n')

      expect(tagCommit).toBe(mainBefore)
      expect(branchCommit).not.toBe(mainBefore)
    })
  })

  describe('script artifact', () => {
    it('exists at scripts/release.ts', () => {
      expect(existsSync(SCRIPT_PATH)).toBe(true)
    })
  })
})
