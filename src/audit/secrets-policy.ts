import { execFileSync } from 'node:child_process'
import { existsSync, readdirSync, readFileSync } from 'node:fs'
import { join, relative } from 'node:path'

import type { Dirent } from 'node:fs'
import type { RepoAuditResult, RepoAuditViolation } from './repo-guardrails.js'
import {
  isForbiddenGitPath,
  isForbiddenWorkingTreePath,
  parseSecretsConfigMetadata,
  SECRET_VALUE_PATTERN,
  SECRETS_CONFIG_PATH,
  shouldScanGitFileForSecretValues,
} from './lib/secrets-policy.js'

const SKIP_DIRS = new Set(['.git', 'node_modules', '.wrangler', 'dist', 'coverage'])

function processEntry(
  entry: Dirent<string>,
  dir: string,
  root: string,
  violations: RepoAuditViolation[],
): number {
  if (SKIP_DIRS.has(entry.name)) return 0
  const fullPath = join(dir, entry.name)
  if (entry.isDirectory()) return walkDir(fullPath, root, violations)
  if (!entry.isFile()) return 0
  const relPath = relative(root, fullPath).replace(/\\/gu, '/')
  if (isForbiddenWorkingTreePath(relPath)) {
    violations.push({ file: relPath, message: `forbidden secret carrier on disk: ${relPath}` })
  }
  return 1
}

function walkDir(dir: string, root: string, violations: RepoAuditViolation[]): number {
  let checked = 0
  for (const entry of readdirSync(dir, { withFileTypes: true, encoding: 'utf8' })) {
    checked += processEntry(entry, dir, root, violations)
  }
  return checked
}

function listTrackedFiles(root: string): readonly string[] | null {
  try {
    const out = execFileSync('git', ['ls-files', '-z'], {
      cwd: root,
      encoding: 'utf8',
      stdio: ['ignore', 'pipe', 'ignore'],
    })
    return out.split('\0').filter(Boolean)
  } catch {
    return null
  }
}

function checkTrackedFile(root: string, relPath: string, violations: RepoAuditViolation[]): void {
  if (isForbiddenGitPath(relPath)) {
    violations.push({ file: relPath, message: `tracked forbidden secret carrier: ${relPath}` })
    return
  }
  const fullPath = join(root, relPath)
  if (!existsSync(fullPath)) return
  if (relPath === SECRETS_CONFIG_PATH) {
    try {
      parseSecretsConfigMetadata(readFileSync(fullPath, 'utf8'), relPath)
    } catch (error) {
      violations.push({
        file: relPath,
        message: error instanceof Error ? error.message : String(error),
      })
    }
    return
  }
  if (!shouldScanGitFileForSecretValues(relPath)) return
  if (SECRET_VALUE_PATTERN.test(readFileSync(fullPath, 'utf8'))) {
    violations.push({
      file: relPath,
      message: `tracked file contains secret-like value pattern: ${relPath}`,
    })
  }
}

function checkGitTrackedFiles(root: string, violations: RepoAuditViolation[]): void {
  if (!existsSync(join(root, '.git'))) return
  const tracked = listTrackedFiles(root)
  if (!tracked) return
  for (const relPath of tracked) {
    checkTrackedFile(root, relPath, violations)
  }
}

export function auditSecretsPolicy(rootDirectory: string = process.cwd()): RepoAuditResult {
  if (!existsSync(join(rootDirectory, SECRETS_CONFIG_PATH))) {
    return { ok: true, title: 'secrets-policy', checked: 0, violations: [] }
  }

  const violations: RepoAuditViolation[] = []
  const checked = walkDir(rootDirectory, rootDirectory, violations)
  checkGitTrackedFiles(rootDirectory, violations)

  return { ok: violations.length === 0, title: 'secrets-policy', checked, violations }
}
