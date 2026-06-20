import { readdirSync, readFileSync } from 'node:fs'
import { join, relative } from 'node:path'

import type { RepoAuditResult, RepoAuditViolation } from './repo-guardrails.js'
import { resolveSecretsAuditRoot } from './lib/secrets-policy.js'

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

const BANNED_PATH_PATTERNS: ReadonlyArray<{
  readonly pattern: RegExp
  readonly message: string
}> = [
  {
    pattern: /(^|\/)act-with-webpresso\.[^./]+$/u,
    message: 'delete local act-with-webpresso clones; use `wp ci act`',
  },
  {
    pattern: /(^|\/)act-secret-profile\.[^./]+$/u,
    message: 'delete local act-secret-profile clones; use repo-owned .webpresso/secrets.config.json profiles',
  },
]

// RegExp instances built from parts to avoid self-triggering this audit scan
const p = (parts: readonly string[]): RegExp => new RegExp(parts.join(''), 'u')

const BANNED_PATTERNS: readonly BannedPattern[] = [
  {
    pattern: p([String.raw`\b`, 'doppler', ' run', String.raw`\b`]),
    message: 'use `with-secrets -- <cmd>` instead of direct doppler invocation',
  },
  {
    pattern: p([String.raw`\bwith-secrets\s+`, '--doppler', String.raw`\b`]),
    message: 'use selected-manager `with-secrets -- <cmd>` instead of provider flags',
  },
  {
    pattern: p([String.raw`\bwith-secrets\s+`, '--infisical', String.raw`\b`]),
    message: 'use selected-manager `with-secrets -- <cmd>` instead of provider flags',
  },
  {
    pattern: p([String.raw`\b`, 'doppler secrets' + ' download', String.raw`\b`]),
    message: 'load secrets through runtime/env, not direct provider downloads',
  },
  {
    pattern: /runtime\/process\/secret-runner/u,
    message: 'use `@webpresso/framework/runtime/env` instead of secret-runner',
  },
  {
    pattern: /\bwith-secrets\s+--\s*act\b/u,
    message: 'use `wp ci act` instead of raw `with-secrets -- act`',
  },
  {
    pattern: /\bwith-secrets\s+act\b/u,
    message: 'use `wp ci act` instead of raw `with-secrets act`',
  },
  {
    pattern: /\bact-with-webpresso\b/u,
    message: 'delete local act-with-webpresso clones; use `wp ci act`',
  },
  {
    pattern: /\bact-secret-profile\b/u,
    message: 'delete local act-secret-profile clones; use repo-owned .webpresso/secrets.config.json profiles',
  },
  {
    pattern: /\bsecretEnvProfile\b/u,
    message: 'use repo-owned secretProfile names instead of provider-specific secretEnvProfile wiring',
  },
  {
    pattern: /\b--secret-env-profile\b/u,
    message: 'use repo-owned secretProfile names instead of provider-specific --secret-env-profile wiring',
  },
]

const LEGACY_CI_TOKEN_PATTERNS: readonly BannedPattern[] = [
  {
    pattern: /\bDOPPLER_SERVICE_TOKEN\b/u,
    message: 'OIDC-only CI: do not use DOPPLER_SERVICE_TOKEN fallback in workflows',
  },
  {
    pattern: /\bDOPPLER_TOKEN\b/u,
    message: 'OIDC-only CI: do not use DOPPLER_TOKEN fallback in workflows',
  },
]

const THIRD_PARTY_ACTION_USE_PATTERN = /^\s*(?:-\s+)?uses:\s+([^@\s]+)@([^\s#]+)\s*$/gmu
const FULL_SHA_PATTERN = /^[a-f0-9]{40}$/u

function isWorkflowFile(relPath: string): boolean {
  return /^\.github\/workflows\/.+\.ya?ml$/u.test(relPath)
}

function fileNeedsSecretWorkflowAudit(content: string): boolean {
  return (
    content.includes('with-secrets') ||
    content.includes('.webpresso/secrets.config.json') ||
    content.includes('secret-profile') ||
    content.includes('secret_profile') ||
    content.includes('ci_secret_provider_token') ||
    content.includes('secrets:')
  )
}

function fileNeedsOidc(content: string): boolean {
  return (
    content.includes('doppler_identity_id') ||
    content.includes('infisical_identity_id') ||
    content.includes('auth-method: oidc') ||
    content.includes('method: "oidc"') ||
    content.includes("method: 'oidc'")
  )
}

function scanFile(fullPath: string, relPath: string, violations: RepoAuditViolation[]): void {
  for (const { pattern, message } of BANNED_PATH_PATTERNS) {
    if (pattern.test(relPath)) {
      violations.push({ file: relPath, message: `${relPath}: ${message}` })
    }
  }

  const content = readFileSync(fullPath, 'utf8')
  for (const { pattern, message } of BANNED_PATTERNS) {
    if (pattern.test(content)) {
      violations.push({ file: relPath, message: `${relPath}: ${message}` })
    }
  }

  if (!isWorkflowFile(relPath)) return

  for (const { pattern, message } of LEGACY_CI_TOKEN_PATTERNS) {
    if (pattern.test(content)) {
      violations.push({ file: relPath, message: `${relPath}: ${message}` })
    }
  }

  if (!fileNeedsSecretWorkflowAudit(content) && !fileNeedsOidc(content)) return

  if (fileNeedsOidc(content) && !/\bid-token:\s*write\b/u.test(content)) {
    violations.push({
      file: relPath,
      message: `${relPath}: OIDC-capable workflow must request \`id-token: write\` for OIDC`,
    })
  }

  for (const match of content.matchAll(THIRD_PARTY_ACTION_USE_PATTERN)) {
    const target = match[1]
    const ref = match[2]
    if (!target || !ref) continue
    if (target.startsWith('./') || target.startsWith('docker://')) continue
    if (FULL_SHA_PATTERN.test(ref)) continue
    violations.push({
      file: relPath,
      message: `${relPath}: secret-bearing workflow must SHA-pin third-party action ${target}@${ref}`,
    })
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
  const auditRoot = resolveSecretsAuditRoot(rootDirectory)
  if (!auditRoot) {
    return { ok: true, title: 'secret-provider-quarantine', checked: 0, violations: [] }
  }

  const violations: RepoAuditViolation[] = []
  const checked = walkDir(auditRoot, auditRoot, violations)

  return { ok: violations.length === 0, title: 'secret-provider-quarantine', checked, violations }
}
