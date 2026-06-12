import type { Dirent } from 'node:fs'
import { existsSync, readdirSync } from 'node:fs'
import { join, relative } from 'node:path'

import type { RepoAuditResult, RepoAuditViolation } from './repo-guardrails.js'
import { SECRETS_CONFIG_PATH } from './lib/secrets-policy.js'

const SKIP_DIRS = new Set(['.git', 'node_modules'])

function isDevVarsOrEnvFile(name: string): boolean {
  if (name === '.env.example') return false
  if (name === '.dev.vars' || /^\.dev\.vars(?:\..+)?$/u.test(name)) return true
  return name === '.env' || (/^\.env(?:\..+)?$/u.test(name) && name !== '.env.example')
}

function walkDir(dir: string, root: string, violations: RepoAuditViolation[]): number {
  let checked = 0
  let entries: Dirent<string>[]
  try {
    entries = readdirSync(dir, { withFileTypes: true, encoding: 'utf8' })
  } catch {
    return 0
  }
  for (const entry of entries) {
    if (SKIP_DIRS.has(entry.name)) continue
    const fullPath = join(dir, entry.name)
    if (entry.isDirectory()) {
      checked += walkDir(fullPath, root, violations)
      continue
    }
    if (!entry.isFile()) continue
    checked += 1
    if (isDevVarsOrEnvFile(entry.name)) {
      const relPath = relative(root, fullPath).replace(/\\/gu, '/')
      violations.push({ file: relPath, message: `forbidden secret file on disk: ${relPath}` })
    }
  }
  return checked
}

export function auditNoDevVars(rootDirectory: string = process.cwd()): RepoAuditResult {
  if (!existsSync(join(rootDirectory, SECRETS_CONFIG_PATH))) {
    return { ok: true, title: 'no-dev-vars', checked: 0, violations: [] }
  }

  const violations: RepoAuditViolation[] = []
  const checked = walkDir(rootDirectory, rootDirectory, violations)

  return { ok: violations.length === 0, title: 'no-dev-vars', checked, violations }
}
