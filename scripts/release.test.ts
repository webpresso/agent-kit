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
import { execSync, spawnSync } from 'node:child_process'
import { mkdtempSync, mkdirSync, writeFileSync, existsSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join, resolve } from 'node:path'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'

const SCRIPT_PATH = resolve(__dirname, 'release.ts')

interface Fixture {
  binDir: string
  repoDir: string
  remoteDir: string
  cleanup: () => void
}

const fixtureForCwd = new Map<string, Fixture>()

function git(cwd: string, args: string): string {
  return execSync(`git ${args}`, { cwd, encoding: 'utf8' }).toString()
}

function runScript(
  cwd: string,
  flags: readonly string[],
): { stdout: string; stderr: string; status: number } {
  const result = spawnSync(
    process.execPath,
    ['--experimental-strip-types', SCRIPT_PATH, ...flags],
    {
      cwd,
      encoding: 'utf8',
      stdio: ['ignore', 'pipe', 'pipe'],
      env: {
        ...process.env,
        PATH: [fixtureForCwd.get(cwd)?.binDir, process.env.PATH].filter(Boolean).join(':'),
      },
    },
  )

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
  git(repoDir, 'init -b main')
  git(repoDir, 'config user.email "test@example.com"')
  git(repoDir, 'config user.name "Release Test"')
  git(repoDir, 'config commit.gpgsign false')
  git(repoDir, 'config tag.gpgsign false')

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
    [
      '#!/bin/sh',
      `node -e "const fs=require('fs'); const pkg=JSON.parse(fs.readFileSync('package.json','utf8')); const build=String(pkg.scripts?.build||''); process.exit(build.includes('process.exit(1)')?1:0)"`,
      '',
    ].join('\n'),
    'utf8',
  )
  execSync(`chmod +x "${join(binDir, 'pnpm')}"`)

  git(repoDir, 'add package.json .gitignore')
  git(repoDir, 'commit -m "initial commit"')

  if (withRemote) {
    mkdirSync(remoteDir, { recursive: true })
    git(remoteDir, 'init --bare -b main')
    git(repoDir, `remote add origin "${remoteDir}"`)
  }

  const fixture = {
    binDir,
    repoDir,
    remoteDir,
    cleanup: () => {
      try {
        execSync(`rm -rf "${root}"`)
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
      const tags = git(f.repoDir, 'tag -l').trim().split('\n').filter(Boolean)
      expect(tags).toContain('v9.9.9')
      // Release branch must exist locally.
      const branches = git(f.repoDir, 'branch --list')
        .split('\n')
        .map((l) => l.replace(/^[*+ ]+/, '').trim())
        .filter(Boolean)
      expect(branches).toContain('release/v9.9.9')
      // Original branch restored.
      const current = git(f.repoDir, 'rev-parse --abbrev-ref HEAD').trim()
      expect(current).toBe('main')
    })

    it('aborts when the working tree is dirty', () => {
      const f = fixture!
      writeFileSync(join(f.repoDir, 'package.json'), '{"name":"dirty"}\n')
      const result = runScript(f.repoDir, ['--dry-run'])
      expect(result.status).not.toBe(0)
      expect(result.stderr + result.stdout).toMatch(/working tree.*not clean|dirty/i)
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
      git(f.repoDir, 'add package.json')
      git(f.repoDir, 'commit -m "make build fail"')

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
      const remoteTags = git(f.remoteDir, 'tag -l').trim().split('\n').filter(Boolean)
      expect(remoteTags).toContain('v9.9.9')
      // Release branch landed on remote.
      const remoteBranches = git(f.remoteDir, 'branch --list')
        .split('\n')
        .map((l) => l.replace(/^[*+ ]+/, '').trim())
        .filter(Boolean)
      expect(remoteBranches).toContain('release/v9.9.9')
      // Original branch restored.
      const current = git(f.repoDir, 'rev-parse --abbrev-ref HEAD').trim()
      expect(current).toBe('main')
    })

    it('tags the mainline commit and keeps the dist commit on the compatibility branch', () => {
      const f = fixture!
      const mainBefore = git(f.repoDir, 'rev-parse HEAD').trim()
      const result = runScript(f.repoDir, ['--dry-run'])

      expect(result.status, `script failed: ${result.stderr}`).toBe(0)

      const tagCommit = git(f.repoDir, 'rev-parse v9.9.9^{commit}').trim()
      const branchCommit = git(f.repoDir, 'rev-parse release/v9.9.9').trim()

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
