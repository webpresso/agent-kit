/**
 * Runner for the TPH audit — thin I/O layer.
 * Finds test files, reads contents, calls detectTphViolations, prints + exits.
 */

import { readFileSync } from 'node:fs'
import { join } from 'node:path'

import { type AuditResult, type Violation, detectTphViolations } from './audit-tph-detect.js'
import { runShell } from './shell.js'

const SEVERITY_ICONS: Record<string, string> = {
  ERROR: '❌',
  WARNING: '⚠️ ',
  INFO: 'ℹ️ ',
}

function groupBySeverity(violations: Violation[]): Map<string, Violation[]> {
  const grouped = new Map<string, Violation[]>()
  for (const v of violations) {
    const existing = grouped.get(v.severity) ?? []
    existing.push(v)
    grouped.set(v.severity, existing)
  }
  return grouped
}

function printSeverityGroup(severity: string, items: Violation[]): void {
  const icon = SEVERITY_ICONS[severity] ?? '?'
  console.log(`${icon} ${severity} (${items.length}):`)
  for (const v of items) {
    console.log(`  ${v.file}`)
    console.log(`    [${v.rule}] ${v.message}`)
  }
  console.log()
}

export function printResults(result: AuditResult): void {
  console.log('🧪 Testing Philosophy Audit (TPH)')
  console.log('═'.repeat(60))
  console.log(`Files checked: ${result.filesChecked}`)
  console.log()

  if (!result.violations.length) {
    console.log('✅ No violations found!')
    return
  }

  const grouped = groupBySeverity(result.violations)
  for (const severity of ['ERROR', 'WARNING', 'INFO'] as const) {
    const items = grouped.get(severity)
    if (items && items.length > 0) {
      printSeverityGroup(severity, items)
    }
  }

  console.log('─'.repeat(60))
  console.log(
    `Summary: ${result.errorCount} errors, ${result.warningCount} warnings, ${result.infoCount} info`,
  )

  if (result.errorCount > 0) {
    console.log('\n❌ Fix ERROR violations before merging.')
  }
}

async function findTestFiles(root: string): Promise<string[]> {
  const result = await runShell({
    command: 'find',
    args: [
      '.',
      '-type',
      'f',
      '(',
      '-name',
      '*.test.ts',
      '-o',
      '-name',
      '*.test.tsx',
      '-o',
      '-name',
      '*.integration.test.ts',
      '-o',
      '-name',
      '*.integration.test.tsx',
      ')',
      '-not',
      '-path',
      '*/node_modules/*',
      '-not',
      '-path',
      './.claude/worktrees/*',
      '-not',
      '-path',
      './.tmp/*',
      '-not',
      '-path',
      '*/.generated/*',
      '-not',
      '-path',
      '*/dist/*',
      '-not',
      '-path',
      '*/.stryker-tmp/*',
      '-not',
      '-name',
      'audit-tph-detect.test.ts',
    ],
    cwd: root,
  })

  return result.stdout
    .trim()
    .split('\n')
    .filter((f) => f.length > 0)
}

export async function runTphAudit(
  root: string,
  options?: { maxMocks?: number },
): Promise<AuditResult> {
  const relativePaths = await findTestFiles(root)

  const files = relativePaths.map((relPath) => ({
    path: relPath,
    contents: readFileSync(join(root, relPath), 'utf-8'),
  }))

  return detectTphViolations(files, options)
}
