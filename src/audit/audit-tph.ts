#!/usr/bin/env bun
/**
 * Audit: Testing Philosophy Helper (TPH)
 *
 * Detects testing philosophy violations that GritQL patterns cannot express:
 * - Files with >3 vi.mock() calls (over-mocking)
 * - .test.ts files that mock internal @myorg/* packages (should be .integration.test.ts)
 *
 * GritQL handles: toBeTruthy/toBeFalsy, toBeDefined/toBeUndefined, bare toHaveBeenCalled,
 *                 vi.mock('@myorg/*') detection.
 *
 * Usage:
 *   just audit-tph
 *   bun apps/scripts/src/audit/audit-tph.ts [--max-mocks N]
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
  details?: string
}

interface MockInfo {
  path: string
  hasBehavior: boolean
}

interface AuditResult {
  filesChecked: number
  violations: Violation[]
  errorCount: number
  warningCount: number
  infoCount: number
}

const DEFAULT_MAX_MOCKS = 3

/**
 * Infrastructure/leaf packages that are OK to mock in unit tests.
 * Mocking these is INFO (advisory), not ERROR.
 * Service/business logic mocks remain ERROR.
 */
const INFRA_MOCK_ALLOWLIST = new Set([
  '@myorg/types',
  '@myorg/utils',
  '@myorg/urls',
  '@myorg/i18n',
  '@myorg/ui',
  '@myorg/ui/icons', // Icon component subpath — pure UI primitives, same infra tier as @myorg/ui
  '@myorg/observability',
  '@myorg/config',
  '@myorg/config/browser-env',
  '@myorg/graphql-subscriptions/react',
  '@myorg/platform-web/graphql-client',
  '@myorg/neon', // External API client (Neon DB) — boundary mock is OK
  '@myorg/ai-agent', // External AI service boundary (needs API keys for real calls)
  '@myorg/git-storage', // External file storage service boundary
  '@myorg/git-storage/git-core', // Git operations boundary
  '@myorg/blueprint/local', // File-based service (integration tests available for some)
  '@myorg/blueprint', // Blueprint utilities
  // Cloudflare Workers runtime infrastructure (not available in unit tests)
  '@sentry/cloudflare', // Sentry error tracking for Workers
  'cloudflare:workers', // Cloudflare Workers runtime (DurableObject, etc.)
  '@cloudflare/containers', // Cloudflare Container API
  // FullCalendar ecosystem (calendar component tests, heavy DOM APIs unavoidable in JSDOM)
  '@fullcalendar/react',
  '@fullcalendar/core',
  '@fullcalendar/daygrid',
  '@fullcalendar/timegrid',
  '@fullcalendar/interaction',
  // Remix/React SSR framework (entry.server, root tests, SSR context unavailable in unit tests)
  'isbot', // User agent detection for SSR
  '@react-router/node', // React Router SSR node APIs
  'react-dom/server', // React SSR rendering
  'react-router', // React Router core (when mocked for SSR entry.server tests)
  // GraphiQL ecosystem (GraphiQL modal tests, heavy Editor/CodeMirror unavoidable in JSDOM)
  'graphiql',
  '@graphiql/toolkit',
])

/**
 * Package prefixes where all subpaths are treated as infrastructure.
 * Matches any import starting with these prefixes.
 */
const INFRA_MOCK_PREFIXES = [
  '@myorg/worker-api/', // Worker infrastructure (auth, database middleware)
  '@myorg/schema-engine/', // Build-time tooling (commands, runtime, loaders)
  '@myorg/app-core/', // App-core subpath exports (graphql-client, etc.)
  '@myorg/cli-utils/', // CLI infrastructure utilities (port management, wrangler, repo root)
  '@codemirror/', // CodeMirror ecosystem - unavoidable in JSDOM (document as 1 mock when consolidated)
  '@dnd-kit/', // Drag and drop library (sprint component tests, DOM APIs unavoidable in JSDOM)
]

/**
 * External dependencies that must be mocked due to environment constraints.
 * These are treated as infrastructure when properly documented/consolidated.
 */
const EXTERNAL_INFRA_DEPS = new Set([
  'rainbowbrackets', // CodeMirror plugin (JSDOM incompatible)
  '@replit/codemirror-minimap', // CodeMirror plugin (JSDOM incompatible)
  '@uiw/codemirror-theme-vscode', // CodeMirror theme (JSDOM incompatible)
])

/**
 * External package prefixes treated as infrastructure.
 * Matches any import starting with these prefixes.
 */
const EXTERNAL_INFRA_PREFIXES = [
  '@opentelemetry/', // OpenTelemetry SDK - external observability boundary
  '@modelcontextprotocol/', // MCP SDK - external protocol boundary
  '@tanstack/', // TanStack ecosystem (react-query, etc.) - framework boundary
  'nuqs/', // URL state management - framework boundary
]

function isInfraMock(mockPath: string): boolean {
  // [TPH-INFRA] tagged mocks are always infrastructure
  if (mockPath.startsWith('[INFRA]')) {
    return true
  }
  if (INFRA_MOCK_ALLOWLIST.has(mockPath)) {
    return true
  }
  if (EXTERNAL_INFRA_DEPS.has(mockPath)) {
    return true
  }
  if (INFRA_MOCK_PREFIXES.some((prefix) => mockPath.startsWith(prefix))) {
    return true
  }
  if (EXTERNAL_INFRA_PREFIXES.some((prefix) => mockPath.startsWith(prefix))) {
    return true
  }
  // Generated code (hooks, frontend nav) is infrastructure
  return mockPath.includes('/generated/')
}

function parseArgs(): { maxMocks: number } {
  const args = process.argv.slice(2)
  let maxMocks = DEFAULT_MAX_MOCKS

  for (let i = 0; i < args.length; i++) {
    const arg = args[i] as string
    const next = args[i + 1] as string | undefined
    if (arg === '--max-mocks' && next) {
      maxMocks = Number.parseInt(next, 10)
      i++
    }
  }

  return { maxMocks }
}

async function findTestFiles(): Promise<string[]> {
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
    ],
    cwd: REPO_ROOT,
  })

  return result.stdout
    .trim()
    .split('\n')
    .filter((f) => f.length > 0)
}

/**
 * Check if a mock has [TPH-INFRA] tag in comment above it.
 * This allows marking relative-path mocks as infrastructure.
 */
function hasInfraTag(content: string, matchIndex: number): boolean {
  // Look at previous 300 chars for [TPH-INFRA] tag (allows for longer JSDoc comments)
  const before = content.slice(Math.max(0, matchIndex - 300), matchIndex)
  return /\[TPH-INFRA\]/.test(before)
}

/**
 * Check if a mock factory replaces behavior (vi.fn, class, spy patterns)
 * vs. returning only pure data/constants.
 */
function mockHasBehavior(content: string, matchIndex: number): boolean {
  const rest = content.slice(matchIndex)
  const factoryMatch = rest.match(/vi\.mock\([^,]+,\s*(?:async\s*)?\(\)\s*=>\s*/)
  if (!factoryMatch) {
    return true // No factory = auto-mock, replaces everything
  }

  const bodyStart = (factoryMatch.index ?? 0) + factoryMatch[0].length
  const bodySlice = rest.slice(bodyStart, bodyStart + 500)
  return /vi\.fn|mockResolvedValue|mockReturnValue|mockImplementation|\bclass\b/.test(bodySlice)
}

/**
 * Check if a mock path is a local/relative path (same-package mock).
 * Local mocks (./  ../  #) are excluded from over-mocking counts
 * because they mock within the same package, not across boundaries.
 */
function isLocalMock(mockPath: string): boolean {
  return (
    mockPath.startsWith('./') ||
    mockPath.startsWith('../') ||
    mockPath.startsWith('#') ||
    mockPath.endsWith('?url') // CSS/asset imports (e.g., './globals.css?url')
  )
}

interface MockClassification {
  internalMocks: MockInfo[]
  externalMocks: MockInfo[]
  localMocks: MockInfo[]
}

function classifyMockPath(
  mockPath: string,
  hasBehavior: boolean,
  isTaggedInfra: boolean,
  result: MockClassification,
): void {
  if (isTaggedInfra) {
    result.externalMocks.push({ path: `[INFRA] ${mockPath}`, hasBehavior })
  } else if (isLocalMock(mockPath)) {
    result.localMocks.push({ path: mockPath, hasBehavior })
  } else if (mockPath.startsWith('@myorg/')) {
    result.internalMocks.push({ path: mockPath, hasBehavior })
  } else {
    result.externalMocks.push({ path: mockPath, hasBehavior })
  }
}

function countMocks(content: string): MockClassification & { total: number } {
  const matches = [...content.matchAll(/vi\.mock\(\s*['"`]([^'"`]+)['"`]/g)]
  const result: MockClassification = { internalMocks: [], externalMocks: [], localMocks: [] }

  for (const m of matches) {
    const path = m[1] as string
    const matchIndex = m.index ?? 0
    classifyMockPath(
      path,
      mockHasBehavior(content, matchIndex),
      hasInfraTag(content, matchIndex),
      result,
    )
  }

  return { total: matches.length, ...result }
}

function isUnitTestFile(filePath: string): boolean {
  return (
    (filePath.endsWith('.test.ts') || filePath.endsWith('.test.tsx')) &&
    !filePath.includes('.integration.') &&
    !filePath.includes('.workers.') &&
    !filePath.includes('.e2e.')
  )
}

function addMockViolation(
  violations: Violation[],
  rel: string,
  severity: Violation['severity'],
  rule: string,
  mocks: MockInfo[],
  suffix: string,
): void {
  if (!mocks.length) {
    return
  }
  const paths = mocks.map((m) => m.path).join(', ')
  violations.push({ file: rel, severity, rule, message: `${paths}. ${suffix}` })
}

function classifyMocks(internalMocks: MockInfo[]): {
  serviceBehavior: MockInfo[]
  serviceData: MockInfo[]
  infra: MockInfo[]
} {
  return {
    serviceBehavior: internalMocks.filter((m) => !isInfraMock(m.path) && m.hasBehavior),
    serviceData: internalMocks.filter((m) => !isInfraMock(m.path) && !m.hasBehavior),
    infra: internalMocks.filter((m) => isInfraMock(m.path)),
  }
}

function detectInlineYaml(content: string, rel: string): Violation | undefined {
  const inlineYamlMatches = [
    ...content.matchAll(/(?:writeFileSync|writeFile)\s*\([^,]+\.yaml['"`]\s*,\s*[`'"]/g),
  ]
  for (const match of inlineYamlMatches) {
    const matchIndex = match.index ?? 0
    const rest = content.slice(matchIndex, matchIndex + 500)
    // Skip 1-line strings (intentionally malformed YAML for error tests)
    const hasNewlines =
      rest.includes('\\n') ||
      (rest.includes('`') && rest.indexOf('\n') < rest.indexOf('`', rest.indexOf('`') + 1))
    if (hasNewlines) {
      return {
        file: rel,
        severity: 'ERROR',
        rule: 'inline-yaml',
        message:
          'Inline YAML string literal detected. Use __fixtures__/*.yaml files with cpSync instead.',
      }
    }
  }
  return undefined
}

function auditFile(filePath: string, maxMocks: number): Violation[] {
  const violations: Violation[] = []
  const fullPath = join(REPO_ROOT, filePath)
  const content = readFileSync(fullPath, 'utf-8')
  const rel = relative(REPO_ROOT, fullPath)
  const { total, internalMocks, externalMocks, localMocks } = countMocks(content)

  // Classify mocks to distinguish infra from service/external mocks
  const { serviceBehavior, serviceData } = classifyMocks(internalMocks)

  // Also classify external mocks (e.g., @sentry/cloudflare, cloudflare:workers are infra)
  const externalInfra = externalMocks.filter((m) => isInfraMock(m.path))
  const externalNonInfra = externalMocks.filter((m) => !isInfraMock(m.path))

  // Local mocks (./  ../  #) and infra mocks are excluded from over-mocking count
  const problematicCount = serviceBehavior.length + serviceData.length + externalNonInfra.length

  // Count only non-infra, non-local mocks for the over-mocking threshold
  if (problematicCount > maxMocks) {
    const excluded = localMocks.length + externalInfra.length
    violations.push({
      file: rel,
      severity: 'WARNING',
      rule: 'over-mocking',
      message: `${problematicCount} non-infra mocks (${total} total, ${excluded} local/infra excluded). Reduce service/external mocking.`,
    })
  }

  const inlineYamlViolation = detectInlineYaml(content, rel)
  if (inlineYamlViolation) {
    violations.push(inlineYamlViolation)
  }

  if (isUnitTestFile(filePath) && internalMocks.length > 0) {
    addMockViolation(
      violations,
      rel,
      'ERROR',
      'service-mock-in-unit-test',
      serviceBehavior,
      'Rename to .integration.test.ts or use real dependencies.',
    )
    addMockViolation(
      violations,
      rel,
      'WARNING',
      'service-data-mock-in-unit-test',
      serviceData,
      'Consider importing real constants.',
    )
    // Infra mocks in unit tests are acknowledged as OK — no need to report
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

async function main(): Promise<void> {
  const { maxMocks } = parseArgs()
  const files = await findTestFiles()
  const violations: Violation[] = []

  for (const file of files) {
    violations.push(...auditFile(file, maxMocks))
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

if (import.meta.main) {
  main().catch((error) => {
    console.error('Fatal error:', error)
    process.exit(1)
  })
}
