import { execFileSync } from 'node:child_process'
import { existsSync, realpathSync } from 'node:fs'
import { join, resolve } from 'node:path'

import type { RepoAuditResult, RepoAuditViolation } from './repo-guardrails.js'

const IGNORED_PATH_PREFIXES = [
  'node_modules',
  'dist',
  'build',
  'coverage',
  '.wrangler',
  '.codex',
  '.omx',
  '.omc',
  'logs',
  '.test-reports',
  '.webpresso/generated',
] as const

export function isIgnoredNoFirstPartyMjsPath(relativePath: string): boolean {
  const normalized = relativePath.replace(/\\/gu, '/')
  return IGNORED_PATH_PREFIXES.some(
    (prefix) => normalized === prefix || normalized.startsWith(`${prefix}/`),
  )
}

export function findTrackedFirstPartyMjsPaths(trackedPaths: readonly string[]): string[] {
  return trackedPaths
    .map((path) => path.replace(/\\/gu, '/'))
    .filter((path) => path.endsWith('.mjs'))
    .filter((path) => !isIgnoredNoFirstPartyMjsPath(path))
    .toSorted()
}

function fail(root: string, message: string): RepoAuditResult {
  return {
    ok: false,
    title: 'no first-party .mjs',
    checked: 0,
    violations: [{ file: root, message }],
  }
}

function resolveCanonicalRepoRoot(
  rootDirectory: string,
): { ok: true; root: string } | RepoAuditResult {
  const requestedRoot = realpathSync.native(resolve(rootDirectory))
  let gitRoot: string

  try {
    gitRoot = realpathSync.native(
      execFileSync('git', ['rev-parse', '--show-toplevel'], {
        cwd: requestedRoot,
        encoding: 'utf8',
        stdio: ['ignore', 'pipe', 'pipe'],
      }).trim(),
    )
  } catch {
    return fail(
      requestedRoot,
      `run no-first-party-mjs from a canonical repo root; ${requestedRoot} is not a git repository root`,
    )
  }

  if (requestedRoot !== gitRoot) {
    return fail(
      requestedRoot,
      `run no-first-party-mjs from the canonical repo root ${gitRoot}; refusing to scan ${requestedRoot}`,
    )
  }

  if (!existsSync(join(gitRoot, 'package.json'))) {
    return fail(
      requestedRoot,
      `run no-first-party-mjs from a canonical repo root with package.json; ${gitRoot} does not qualify`,
    )
  }

  return { ok: true, root: gitRoot }
}

function listTrackedFiles(root: string): string[] {
  const output = execFileSync('git', ['ls-files'], {
    cwd: root,
    encoding: 'utf8',
    stdio: ['ignore', 'pipe', 'pipe'],
  })

  return output
    .split('\n')
    .map((line) => line.trim())
    .filter(Boolean)
    .filter((relativePath) => existsSync(join(root, relativePath)))
}

export function auditNoFirstPartyMjs(rootDirectory: string = process.cwd()): RepoAuditResult {
  const canonical = resolveCanonicalRepoRoot(rootDirectory)
  if ('violations' in canonical) return canonical

  const violations: RepoAuditViolation[] = findTrackedFirstPartyMjsPaths(
    listTrackedFiles(canonical.root),
  ).map((file) => ({
    file,
    message: 'tracked first-party .mjs files are forbidden; rename this file to .ts',
  }))

  return {
    ok: violations.length === 0,
    title: 'no first-party .mjs',
    checked: violations.length,
    violations,
  }
}
