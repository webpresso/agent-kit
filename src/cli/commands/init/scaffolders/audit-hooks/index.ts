/**
 * `audit-hooks` scaffolder preset.
 *
 * Extends `.husky/pre-commit` to ensure formatting and shared policy checks
 * are present.
 *
 * Additive: appends the managed audit block only when the audits are not
 * already present (idempotent). Does not remove existing content.
 *
 * Formatting is scoped to staged formattable files and re-stages formatter
 * rewrites before audits run. The audits are still gated on staged
 * source/config so doc/blueprint-only commits skip them — pre-commit must stay
 * fast and scoped to changed things. The whole-repo guardrails suite is
 * CI-owned and is intentionally NOT run here.
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

const AUDIT_HOOK_HEADER = '# webpresso audit hooks (staged mode — fast)'

/**
 * The managed audit block. Formatting runs over staged formattable files and
 * re-stages rewrites. Audits run only when staged files include source/config —
 * never on doc/blueprint-only commits, never whole-repo on every commit.
 */
const AUDIT_HOOK_BLOCK = [
  AUDIT_HOOK_HEADER,
  'STAGED="$(git diff --cached --name-only --diff-filter=ACMR)"',
  'FORMAT_FILES="$(printf \'%s\\n\' "$STAGED" | grep -E \'\\.(ts|tsx|js|jsx|cjs|mjs|json|ya?ml|sh|tmpl|md|mdx)$\' || true)"',
  'if [ -n "$FORMAT_FILES" ]; then',
  '  wp format || exit 1',
  '  printf \'%s\\n\' "$FORMAT_FILES" | while IFS= read -r file; do',
  '    [ -n "$file" ] || continue',
  '    git add -- "$file" || exit 1',
  '  done',
  '  STAGED="$(git diff --cached --name-only --diff-filter=ACMR)"',
  'fi',
  "if printf '%s\\n' \"$STAGED\" | grep -Eq '\\.(ts|tsx|js|jsx|cjs|mjs|json|ya?ml|sh|tmpl)$|(^|/)\\.env|\\.dev\\.vars$'; then",
  '  wp audit no-dev-vars',
  '  wp audit absolute-path-policy --root .',
  '  wp audit secret-provider-quarantine',
  'fi',
].join('\n')

const SHEBANG = '#!/bin/sh\n'

/**
 * True when the managed fast audits already run in the hook, in any form
 * (bare `wp`, `"$WP"`, `"$ROOT/bin/wp"`, or the legacy `*.ts` script paths).
 * Keyed on the audit invocations themselves — not the header comment — so a
 * stale header without the real audits still gets the block appended.
 */
function hasAuditBlock(existingContent: string): boolean {
  return (
    existingContent.includes('wp format') &&
    existingContent.includes('git add -- "$file"') &&
    existingContent.includes('md|mdx') &&
    existingContent.includes('|| exit 1') &&
    (existingContent.includes('audit no-dev-vars') ||
      existingContent.includes('check-no-dev-vars.ts')) &&
    existingContent.includes('audit absolute-path-policy --root .') &&
    (existingContent.includes('audit secret-provider-quarantine') ||
      existingContent.includes('audit-secret-provider-quarantine.ts'))
  )
}

/**
 * Append the managed audit block to `.husky/pre-commit` if the audits are not
 * already present. Creates the file with a shebang if it does not exist.
 * Idempotent: re-running produces no change when the audits are present.
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
    writeFileSync(preCommitPath, SHEBANG + AUDIT_HOOK_BLOCK + '\n', 'utf8')
    return { preCommitPath, action: 'created' }
  }

  if (hasAuditBlock(existingContent)) {
    return { preCommitPath, action: 'identical' }
  }

  const separator = existingContent.endsWith('\n') ? '' : '\n'
  writeFileSync(preCommitPath, existingContent + separator + AUDIT_HOOK_BLOCK + '\n', 'utf8')
  return { preCommitPath, action: 'appended' }
}
