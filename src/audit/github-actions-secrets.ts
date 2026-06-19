import { existsSync, readdirSync, readFileSync } from 'node:fs'
import { join, relative } from 'node:path'

import type { RepoAuditResult, RepoAuditViolation } from './repo-guardrails.js'

const WORKFLOWS_DIR = '.github/workflows'
const WORKFLOW_PATTERN = /\.ya?ml$/iu
const SECRET_BEARING_ACTION_PATTERNS = [
  { name: 'dopplerhq/secrets-fetch-action', pattern: /dopplerhq\/secrets-fetch-action@([^\s#]+)/u },
] as const

function isFullSha(ref: string): boolean {
  return /^[0-9a-f]{40}$/u.test(ref)
}

function pushViolation(violations: RepoAuditViolation[], file: string, message: string): void {
  violations.push({ file, message })
}

function auditWorkflow(filePath: string, relativePath: string, violations: RepoAuditViolation[]): void {
  const text = readFileSync(filePath, 'utf8')
  const usesSecretBearingAction = SECRET_BEARING_ACTION_PATTERNS.some(({ pattern }) => pattern.test(text))

  for (const { name, pattern } of SECRET_BEARING_ACTION_PATTERNS) {
    const match = pattern.exec(text)
    if (!match) continue
    const ref = match[1] ?? ''
    if (!isFullSha(ref)) {
      pushViolation(
        violations,
        relativePath,
        `${relativePath}: ${name} must be pinned by full 40-character SHA`,
      )
    }
  }

  if (/secrets:\s*inherit/u.test(text)) {
    pushViolation(
      violations,
      relativePath,
      `${relativePath}: replace secrets: inherit with explicit lane-named workflow_call secrets`,
    )
  }

  if (/workflow_call:/u.test(text) && usesSecretBearingAction) {
    if (!(text.includes('ci_secret_provider_token:') && text.includes('required: false'))) {
      pushViolation(
        violations,
        relativePath,
        `${relativePath}: reusable secret-bearing workflows must declare ci_secret_provider_token explicitly`,
      )
    }
  }

  if (usesSecretBearingAction && !text.includes('id-token: write')) {
    pushViolation(
      violations,
      relativePath,
      `${relativePath}: secret-bearing workflows must request id-token: write`,
    )
  }
}

export function auditGitHubActionsSecrets(rootDirectory: string = process.cwd()): RepoAuditResult {
  const workflowsRoot = join(rootDirectory, WORKFLOWS_DIR)
  if (!existsSync(workflowsRoot)) {
    return { ok: true, title: 'github-actions-secrets', checked: 0, violations: [] }
  }

  const violations: RepoAuditViolation[] = []
  let checked = 0

  for (const entry of readdirSync(workflowsRoot, { withFileTypes: true, encoding: 'utf8' })) {
    if (!entry.isFile() || !WORKFLOW_PATTERN.test(entry.name)) continue
    const filePath = join(workflowsRoot, entry.name)
    const relativePath = relative(rootDirectory, filePath).replace(/\\/gu, '/')
    checked += 1
    auditWorkflow(filePath, relativePath, violations)
  }

  return {
    ok: violations.length === 0,
    title: 'github-actions-secrets',
    checked,
    violations,
  }
}
