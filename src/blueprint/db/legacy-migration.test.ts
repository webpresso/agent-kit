import { execSync } from 'node:child_process'
import { existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import path from 'node:path'

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

const mockState = vi.hoisted(() => ({ stateRoot: '/tmp/ak-state-root-placeholder' }))

vi.mock('env-paths', () => ({
  default: () => ({
    data: mockState.stateRoot,
    config: mockState.stateRoot,
    cache: mockState.stateRoot,
    log: mockState.stateRoot,
    temp: mockState.stateRoot,
  }),
}))

import { _clearMigrationMemoForTests, migrateLegacyAgentDb } from './legacy-migration.js'
import { resolveBlueprintProjectionDbPath } from './paths.js'
import { _clearCacheForTests } from '#paths/state-root.js'

function initGitRepo(dir: string): void {
  execSync('git init -q', { cwd: dir })
  execSync('git config user.email test@test.local', { cwd: dir })
  execSync('git config user.name test', { cwd: dir })
}

let stateRootDir: string

beforeEach(() => {
  _clearCacheForTests()
  _clearMigrationMemoForTests()
  stateRootDir = mkdtempSync(path.join(tmpdir(), 'ak-state-root-'))
  mockState.stateRoot = stateRootDir
})

afterEach(() => {
  _clearCacheForTests()
  _clearMigrationMemoForTests()
  rmSync(stateRootDir, { recursive: true, force: true })
})

function fakeLogger(): { warn: ReturnType<typeof vi.fn>; messages: string[] } {
  const messages: string[] = []
  const warn = vi.fn((msg: string) => {
    messages.push(msg)
  })
  return { warn, messages }
}

describe('migrateLegacyAgentDb', () => {
  it('returns no-legacy when the file is absent', () => {
    const repo = mkdtempSync(path.join(tmpdir(), 'ak-repo-'))
    try {
      initGitRepo(repo)
      const logger = fakeLogger()
      const res = migrateLegacyAgentDb(repo, logger)
      expect(res.outcome).toStrictEqual('no-legacy')
      expect(logger.warn).not.toHaveBeenCalled()
    } finally {
      rmSync(repo, { recursive: true, force: true })
    }
  })

  it('returns not-git outside a git repo (legacy IS canonical there)', () => {
    const nonGit = mkdtempSync(path.join(tmpdir(), 'ak-nogit-'))
    try {
      // Put a legacy file in place — but since it's not a git repo, the
      // legacy path IS the canonical path. Nothing to migrate.
      mkdirSync(path.join(nonGit, '.agent'), { recursive: true })
      writeFileSync(path.join(nonGit, '.agent', '.blueprints.db'), 'legacy')
      const logger = fakeLogger()
      const res = migrateLegacyAgentDb(nonGit, logger)
      expect(res.outcome).toStrictEqual('not-git')
      expect(logger.warn).not.toHaveBeenCalled()
    } finally {
      rmSync(nonGit, { recursive: true, force: true })
    }
  })

  it('moves the legacy DB + sibling WAL/SHM into the worktree-scoped path', () => {
    const repo = mkdtempSync(path.join(tmpdir(), 'ak-repo-'))
    try {
      initGitRepo(repo)
      // Place legacy files
      mkdirSync(path.join(repo, '.agent'), { recursive: true })
      const legacyDb = path.join(repo, '.agent', '.blueprints.db')
      writeFileSync(legacyDb, 'legacy-db-bytes')
      writeFileSync(`${legacyDb}-wal`, 'wal-bytes')
      writeFileSync(`${legacyDb}-shm`, 'shm-bytes')

      const logger = fakeLogger()
      const res = migrateLegacyAgentDb(repo, logger)

      expect(res.outcome).toStrictEqual('migrated')
      expect(res.movedSiblings).toStrictEqual(['-wal', '-shm'])
      expect(existsSync(legacyDb)).toBe(false)
      expect(existsSync(`${legacyDb}-wal`)).toBe(false)
      expect(existsSync(`${legacyDb}-shm`)).toBe(false)

      const newDb = resolveBlueprintProjectionDbPath(repo)
      expect(existsSync(newDb)).toBe(true)
      expect(existsSync(`${newDb}-wal`)).toBe(true)
      expect(existsSync(`${newDb}-shm`)).toBe(true)
      expect(readFileSync(newDb, 'utf8')).toStrictEqual('legacy-db-bytes')
      expect(readFileSync(`${newDb}-wal`, 'utf8')).toStrictEqual('wal-bytes')

      // One-line deprecation warning emitted
      expect(logger.warn).toHaveBeenCalledTimes(1)
      expect(logger.messages[0]).toContain('deprecated')
      expect(logger.messages[0]).toContain(legacyDb)
      expect(logger.messages[0]).toContain(newDb)
    } finally {
      rmSync(repo, { recursive: true, force: true })
    }
  })

  it('does not move when the destination already exists, emits a failure-style warning', () => {
    const repo = mkdtempSync(path.join(tmpdir(), 'ak-repo-'))
    try {
      initGitRepo(repo)
      mkdirSync(path.join(repo, '.agent'), { recursive: true })
      const legacyDb = path.join(repo, '.agent', '.blueprints.db')
      writeFileSync(legacyDb, 'legacy')

      const destDb = resolveBlueprintProjectionDbPath(repo)
      mkdirSync(path.dirname(destDb), { recursive: true })
      writeFileSync(destDb, 'new-db-already-there')

      const logger = fakeLogger()
      const res = migrateLegacyAgentDb(repo, logger)

      expect(res.outcome).toStrictEqual('destination-exists')
      // Both files untouched
      expect(readFileSync(legacyDb, 'utf8')).toStrictEqual('legacy')
      expect(readFileSync(destDb, 'utf8')).toStrictEqual('new-db-already-there')

      expect(logger.warn).toHaveBeenCalledTimes(1)
      expect(logger.messages[0]).toContain('WARNING')
      expect(logger.messages[0]).toContain('legacy DB')
    } finally {
      rmSync(repo, { recursive: true, force: true })
    }
  })

  it('is memoized per cwd — repeated calls do not re-warn or re-touch disk', () => {
    const repo = mkdtempSync(path.join(tmpdir(), 'ak-repo-'))
    try {
      initGitRepo(repo)
      mkdirSync(path.join(repo, '.agent'), { recursive: true })
      writeFileSync(path.join(repo, '.agent', '.blueprints.db'), 'legacy')

      const logger = fakeLogger()
      migrateLegacyAgentDb(repo, logger)
      migrateLegacyAgentDb(repo, logger)
      migrateLegacyAgentDb(repo, logger)
      expect(logger.warn).toHaveBeenCalledTimes(1)
    } finally {
      rmSync(repo, { recursive: true, force: true })
    }
  })

  it('leaves the destination untouched and does not promise migration when only the legacy file exists with no siblings', () => {
    const repo = mkdtempSync(path.join(tmpdir(), 'ak-repo-'))
    try {
      initGitRepo(repo)
      mkdirSync(path.join(repo, '.agent'), { recursive: true })
      const legacyDb = path.join(repo, '.agent', '.blueprints.db')
      writeFileSync(legacyDb, 'lone-legacy')

      const res = migrateLegacyAgentDb(repo, fakeLogger())
      expect(res.outcome).toStrictEqual('migrated')
      expect(res.movedSiblings).toStrictEqual([])
    } finally {
      rmSync(repo, { recursive: true, force: true })
    }
  })
})
