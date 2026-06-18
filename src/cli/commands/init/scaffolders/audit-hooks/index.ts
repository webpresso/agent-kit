/**
 * `audit-hooks` scaffolder preset.
 *
 * Extends `.husky/pre-commit` to ensure the shared policy checks are present.
 *
 * Additive: appends lines only when not already present (idempotent).
 * Does not remove existing content.
 */
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs'
import path from 'node:path'

import type { MergeOptions } from '#cli/commands/init/merge'

export interface ScaffoldAuditHooksInput {
  repoRoot: string
  options: MergeOptions
}

export interface ScaffoldAuditHooksResult {
  preCommitPath: string
  action: 'created' | 'appended' | 'identical' | 'skipped-dry'
}

/**
 * Lines to append to `.husky/pre-commit` (each must be idempotently checked).
 */
const AUDIT_HOOK_LINES = [
  '# webpresso audit hooks (staged mode — fast)',
  'wp audit no-dev-vars',
  'wp audit absolute-path-policy --root .',
  'wp audit secret-provider-quarantine',
] as const

const SHEBANG = '#!/bin/sh\n'

function hasEquivalentLine(existingContent: string, line: string): boolean {
  if (existingContent.includes(line)) return true

  if (line === '# webpresso audit hooks (staged mode — fast)') {
    return (
      existingContent.includes('wp audit no-dev-vars') &&
      (existingContent.includes('wp audit absolute-path-policy --root .') ||
        existingContent.includes('"$WP" audit absolute-path-policy --root .')) &&
      existingContent.includes('wp audit secret-provider-quarantine')
    )
  }

  if (line === 'wp audit absolute-path-policy --root .') {
    return existingContent.includes('"$WP" audit absolute-path-policy --root .')
  }

  return false
}

/**
 * Append audit hook lines to `.husky/pre-commit` if not already present.
 * Creates the file with a shebang if it does not exist.
 * Idempotent: re-running produces no change when lines are present.
 */
export function scaffoldAuditHooks(input: ScaffoldAuditHooksInput): ScaffoldAuditHooksResult {
  const preCommitPath = path.join(input.repoRoot, '.husky', 'pre-commit')

  if (input.options.dryRun) {
    return { preCommitPath, action: 'skipped-dry' }
  }

  const huskyDir = path.dirname(preCommitPath)
  mkdirSync(huskyDir, { recursive: true })

  const existingContent = existsSync(preCommitPath) ? readFileSync(preCommitPath, 'utf8') : null

  if (existingContent === null) {
    // Create fresh file
    const newContent = [SHEBANG, ...AUDIT_HOOK_LINES].join('\n') + '\n'
    writeFileSync(preCommitPath, newContent, 'utf8')
    return { preCommitPath, action: 'created' }
  }

  // Determine which lines are missing
  const missingLines = AUDIT_HOOK_LINES.filter((line) => !hasEquivalentLine(existingContent, line))

  if (missingLines.length === 0) {
    return { preCommitPath, action: 'identical' }
  }

  // Append missing lines
  const separator = existingContent.endsWith('\n') ? '' : '\n'
  const appended = existingContent + separator + missingLines.join('\n') + '\n'
  writeFileSync(preCommitPath, appended, 'utf8')
  return { preCommitPath, action: 'appended' }
}
