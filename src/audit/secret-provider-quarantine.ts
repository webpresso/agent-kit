import { existsSync, readdirSync, readFileSync } from 'node:fs'
import { join, relative } from 'node:path'

import type { RepoAuditResult, RepoAuditViolation } from './repo-guardrails.js'
import { SECRETS_CONFIG_PATH } from './lib/secrets-policy.js'

const IGNORED_DIRS = new Set([
  '.git',
  'node_modules',
  '.agent',
  '.claude',
  '.codex',
  '.omx',
  '.omc',
  'blueprints',
  'dist',
  'coverage',
])

const TEXT_FILE_PATTERN = /\.(md|ts|tsx|js|json|ya?ml|toml|txt)$/iu

type BannedPattern = { readonly pattern: RegExp; readonly message: string }

// RegExp instances built from parts to avoid self-triggering this audit scan
const p = (parts: readonly string[]): RegExp => new RegExp(parts.join(''), 'u')

const BANNED_PATTERNS: readonly BannedPattern[] = [
  {
    pattern: p([String.raw`\b`, 'doppler', ' run', String.raw`\b`]),
    message:
      'use `wp secrets run --sink <sink> --profile <profile> -- <cmd>` instead of direct doppler invocation',
  },
  {
    pattern: p([String.raw`\bwith-secrets\s+`, '--doppler', String.raw`\b`]),
    message:
      'use `wp secrets run --sink <sink> --profile <profile> -- <cmd>` instead of provider flags',
  },
  {
    pattern: p([String.raw`\bwith-secrets\s+`, '--infisical', String.raw`\b`]),
    message:
      'use `wp secrets run --sink <sink> --profile <profile> -- <cmd>` instead of provider flags',
  },
  {
    pattern: /\bwith-secrets\s+--(?!doppler\b|infisical\b)/u,
    message:
      'use `wp secrets run --sink <sink> --profile <profile> -- <cmd>` instead of the legacy with-secrets wrapper',
  },
  {
    pattern: /\bwith-secrets\s+(?:act|node|vp|pnpm|bun|wrangler)\b/u,
    message:
      'use `wp secrets run --sink <sink> --profile <profile> -- <cmd>` instead of the legacy with-secrets wrapper',
  },
  {
    pattern: p([String.raw`\b`, 'doppler secrets' + ' download', String.raw`\b`]),
    message: 'load secrets through runtime/env, not direct provider downloads',
  },
  {
    pattern: /runtime\/process\/secret-runner/u,
    message: 'use `@webpresso/framework/runtime/env` instead of secret-runner',
  },
]

function scanFile(fullPath: string, relPath: string, violations: RepoAuditViolation[]): void {
  const content = readFileSync(fullPath, 'utf8')
  for (const { pattern, message } of BANNED_PATTERNS) {
    if (pattern.test(content)) {
      violations.push({ file: relPath, message: `${relPath}: ${message}` })
    }
  }
}

function walkDir(dir: string, root: string, violations: RepoAuditViolation[]): number {
  let checked = 0
  for (const entry of readdirSync(dir, { withFileTypes: true, encoding: 'utf8' })) {
    if (IGNORED_DIRS.has(entry.name)) continue
    const fullPath = join(dir, entry.name)
    if (entry.isDirectory()) {
      checked += walkDir(fullPath, root, violations)
      continue
    }
    if (!entry.isFile() || !TEXT_FILE_PATTERN.test(entry.name)) continue
    checked += 1
    const relPath = relative(root, fullPath).replace(/\\/gu, '/')
    scanFile(fullPath, relPath, violations)
  }
  return checked
}

export function auditSecretProviderQuarantine(
  rootDirectory: string = process.cwd(),
): RepoAuditResult {
  if (!existsSync(join(rootDirectory, SECRETS_CONFIG_PATH))) {
    return { ok: true, title: 'secret-provider-quarantine', checked: 0, violations: [] }
  }

  const violations: RepoAuditViolation[] = []
  const checked = walkDir(rootDirectory, rootDirectory, violations)

  return { ok: violations.length === 0, title: 'secret-provider-quarantine', checked, violations }
}
