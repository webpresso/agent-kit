/**
 * Legacy DB deprecation + migration (F12 / R10 / E12, Task 1.1).
 *
 * Pre-worktree-scoping, the projection DB lived at
 * `<cwd>/.agent/.blueprints.db`. Task 1.1 moves it under the worktree-scoped
 * state-root path. For git repos that still have the legacy file (and any
 * sibling `-wal` / `-shm` files from a crashed write), do the following on
 * first access:
 *
 *  1. Log a one-line deprecation pointing at the new path.
 *  2. If the destination does not exist, rename the legacy files to the new
 *     location. Sibling WAL/SHM are moved alongside the main DB.
 *  3. If the destination already exists, leave both untouched and surface a
 *     failure-style warning. Callers should not double-count.
 *
 * Memoized per-repo so repeated calls within a process touch disk once.
 */

import { existsSync, mkdirSync, renameSync } from 'node:fs'
import path from 'node:path'

import { LEGACY_AGENT_DIR, LEGACY_DB_FILENAME } from './paths.js'
import { getSurfacePath, NotInGitRepoError } from '#paths/state-root.js'

export const LEGACY_DB_SIBLINGS = ['-wal', '-shm'] as const

export type MigrationOutcome = 'migrated' | 'destination-exists' | 'no-legacy' | 'not-git'

export interface MigrationResult {
  readonly outcome: MigrationOutcome
  readonly legacyPath: string
  readonly destinationPath: string | null
  readonly movedSiblings: readonly string[]
  readonly warning: string | null
}

interface Logger {
  warn(msg: string): void
}

const defaultLogger: Logger = {
  warn(msg) {
    process.stderr.write(`${msg}\n`)
  },
}

const memo = new Map<string, MigrationResult>()

function legacyDbPath(cwd: string): string {
  return path.join(cwd, LEGACY_AGENT_DIR, LEGACY_DB_FILENAME)
}

function moveOne(from: string, to: string): boolean {
  if (!existsSync(from)) return false
  renameSync(from, to)
  return true
}

function tryResolveDestination(cwd: string): string | null {
  // Call getSurfacePath directly (not resolveBlueprintProjectionDbPath) so
  // we can distinguish "git repo, real worktree-scoped destination" from
  // "non-git repo, legacy path IS canonical". The latter must not be treated
  // as a migration target.
  try {
    return getSurfacePath('blueprints/blueprints.db', 'worktree', cwd)
  } catch (err) {
    if (err instanceof NotInGitRepoError) return null
    throw err
  }
}

/**
 * Detect and (if safe) migrate a legacy `.agent/.blueprints.db` for `cwd`.
 *
 * Idempotent and memoized per `cwd`. Outside a git repo the function is a
 * no-op (returns `outcome: 'not-git'`) because the legacy path *is* the
 * canonical path in that case.
 */
export function migrateLegacyAgentDb(cwd: string, logger: Logger = defaultLogger): MigrationResult {
  const cached = memo.get(cwd)
  if (cached !== undefined) return cached

  const legacy = legacyDbPath(cwd)
  const result = computeMigration(cwd, legacy, logger)
  memo.set(cwd, result)
  return result
}

function computeMigration(cwd: string, legacy: string, logger: Logger): MigrationResult {
  if (!existsSync(legacy)) {
    return {
      outcome: 'no-legacy',
      legacyPath: legacy,
      destinationPath: null,
      movedSiblings: [],
      warning: null,
    }
  }

  const destination = tryResolveDestination(cwd)
  if (destination === null) {
    // Non-git: legacy path IS canonical; nothing to migrate.
    return {
      outcome: 'not-git',
      legacyPath: legacy,
      destinationPath: null,
      movedSiblings: [],
      warning: null,
    }
  }

  if (existsSync(destination)) {
    const warning = `[blueprint] WARNING: legacy DB ${legacy} found but worktree DB already exists at ${destination}; leaving both untouched. Delete the legacy file once you have verified the new DB is current.`
    logger.warn(warning)
    return {
      outcome: 'destination-exists',
      legacyPath: legacy,
      destinationPath: destination,
      movedSiblings: [],
      warning,
    }
  }

  logger.warn(
    `[blueprint] deprecated: ${legacy} → ${destination} (migrating; legacy .agent/.blueprints.db will be removed)`,
  )

  // Ensure the destination directory exists before renames.
  mkdirSync(path.dirname(destination), { recursive: true })

  moveOne(legacy, destination)
  const movedSiblings: string[] = []
  for (const suffix of LEGACY_DB_SIBLINGS) {
    const moved = moveOne(`${legacy}${suffix}`, `${destination}${suffix}`)
    if (moved) movedSiblings.push(suffix)
  }

  return {
    outcome: 'migrated',
    legacyPath: legacy,
    destinationPath: destination,
    movedSiblings,
    warning: null,
  }
}

/** Test-only helper. */
export function _clearMigrationMemoForTests(): void {
  memo.clear()
}
