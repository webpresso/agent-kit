#!/usr/bin/env bun
/**
 * Audit: Testing Philosophy Helper (TPH) - E2E
 *
 * Detects E2E testing guideline violations:
 * - Internal API/handler calls inside E2E tests
 * - Mocks in E2E tests
 * - Dry-run usage in E2E tests
 * - Missing error/edge/mixed-data coverage heuristics
 *
 * Usage:
 *   just audit-tph-e2e
 *   bun apps/scripts/src/audit/audit-tph-e2e.ts
 */

import { readFileSync } from 'node:fs'
import { join, relative } from 'node:path'

import { findRepoRoot } from '#utils/repo-root'

import { runShell } from './shell.js'

const REPO_ROOT = findRepoRoot()

interface Violation {
  file: string
  severity: 'ERROR' | 'WARNING' | 'INFO'
  rule: string
  message: string
}

interface AuditResult {
  filesChecked: number
  violations: Violation[]
  errorCount: number
  warningCount: number
  infoCount: number
}

const INTERNAL_API_PATTERN = /\b(?:app|router|server|auth|handler)\.(?:handle|fetch|dispatch)\(/g
const INTERNAL_HANDLER_PATTERN = /\b[a-zA-Z0-9_]+\.handler\(/g
const MOCK_PATTERN = /\b(?:vi|jest)\.mock\(|mockResolvedValue|mockReturnValue/g
const DRY_RUN_PATTERN = /dryRun\s*:\s*true|dry-run\s*.*true/g

const ERROR_TITLE_PATTERN = /(error|invalid|reject|fail|unauthorized)/i
const MIXED_TITLE_PATTERN = /(mixed|partial|graceful|degradation)/i

async function findE2eTestFiles(): Promise<string[]> {
  const result = await runShell({
    command: 'find',
    args: [
      '.',
      '-type',
      'f',
      '(',
      '-name',
      '*.e2e.test.ts',
      '-o',
      '-name',
      '*.e2e.test.tsx',
      ')',
      '-not',
      '-path',
      '*/node_modules/*',
      '-not',
      '-path',
      '*/.generated/*',
      '-not',
      '-path',
      '*/dist/*',
      '-not',
      '-path',
      '*/.stryker-tmp/*',
    ],
    cwd: REPO_ROOT,
  })

  return result.stdout
    .trim()
    .split('\n')
    .filter((f) => f.length > 0)
}

function hasTitlePattern(content: string, pattern: RegExp): boolean {
  const titleMatches = content.match(/\b(?:it|test)\s*\(\s*['"`][^'"`]+['"`]/g)
  if (!titleMatches) {
    return false
  }
  return titleMatches.some((title) => pattern.test(title))
}

function auditFile(filePath: string): Violation[] {
  const violations: Violation[] = []
  const fullPath = join(REPO_ROOT, filePath)
  const content = readFileSync(fullPath, 'utf-8')
  const rel = relative(REPO_ROOT, fullPath)

  if (INTERNAL_API_PATTERN.test(content) || INTERNAL_HANDLER_PATTERN.test(content)) {
    violations.push({
      file: rel,
      severity: 'ERROR',
      rule: 'internal-api-call',
      message: 'E2E tests must not call internal handlers or routers. Use real HTTP/browser flow.',
    })
  }

  if (MOCK_PATTERN.test(content)) {
    violations.push({
      file: rel,
      severity: 'ERROR',
      rule: 'e2e-mocking',
      message: 'E2E tests must not mock. Use real dependencies and boundaries.',
    })
  }

  if (DRY_RUN_PATTERN.test(content)) {
    violations.push({
      file: rel,
      severity: 'ERROR',
      rule: 'e2e-dry-run',
      message: 'E2E tests must execute real behavior (no dry-run).',
    })
  }

  if (!hasTitlePattern(content, ERROR_TITLE_PATTERN)) {
    violations.push({
      file: rel,
      severity: 'INFO',
      rule: 'missing-error-coverage',
      message: 'No E2E test title indicates error/invalid/reject coverage.',
    })
  }

  if (!hasTitlePattern(content, MIXED_TITLE_PATTERN)) {
    violations.push({
      file: rel,
      severity: 'INFO',
      rule: 'missing-mixed-coverage',
      message: 'No E2E test title indicates mixed/partial/graceful coverage.',
    })
  }

  return violations
}

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

function printResults(result: AuditResult): void {
  console.log('🧪 Testing Philosophy Audit (TPH) - E2E')
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

async function main(): Promise<void> {
  const files = await findE2eTestFiles()
  const violations: Violation[] = []

  for (const file of files) {
    violations.push(...auditFile(file))
  }

  const result: AuditResult = {
    filesChecked: files.length,
    violations,
    errorCount: violations.filter((v) => v.severity === 'ERROR').length,
    warningCount: violations.filter((v) => v.severity === 'WARNING').length,
    infoCount: violations.filter((v) => v.severity === 'INFO').length,
  }

  printResults(result)

  if (result.errorCount > 0) {
    process.exit(1)
  }
}

await main()
