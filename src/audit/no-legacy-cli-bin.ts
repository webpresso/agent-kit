import { existsSync, readdirSync, readFileSync } from 'node:fs'
import { join, relative, resolve } from 'node:path'

import type { RepoAuditResult, RepoAuditViolation } from './repo-guardrails.js'

// `wp` remains the canonical public CLI in AGENTS.md. This audit only guards
// retired compatibility aliases from leaking into active user-facing surfaces.
const LEGACY_COMMAND_PATTERN = /\b(?:ak|cli2|wk)\s+[a-z][\w:-]*(?:\s+[a-z][\w:-]*)*/giu
const INTERNAL_HELPER_PATTERN =
  /\bwp-(?:pretool-guard|post-tool|stop-qa|guard-switch|sessionstart-routing)\b/u
const REPLACEMENT_PATTERN = /\bwebpresso agent [a-z][\w:-]*(?: [a-z][\w:-]*)*/iu
const MIGRATION_MARKER_PATTERN = /\b(?:current-state|migration-only|replacement|future)\b/iu
// Scan current user-facing/documentation inputs only. Source tests and completed/parked
// blueprints intentionally preserve historical command names as regression fixtures
// and audit evidence; blocking them would make this guardrail non-adoptable.
const SCAN_DIRS = [
  'catalog',
  'commands',
  'scripts',
  'test-fixtures',
  'blueprints/planned',
  'blueprints/in-progress',
] as const
const SKIP_DIRS = new Set(['node_modules', '.git', 'dist', 'build', '.agent', '.omx', '.codex'])
const TEXT_EXTENSIONS = new Set([
  '.md',
  '.mdx',
  '.txt',
  '.json',
  '.yaml',
  '.yml',
  '.ts',
  '.tsx',
  '.js',
  '.jsx',
  '.sh',
])

export function auditNoLegacyCliBin(rootDirectory: string = process.cwd()): RepoAuditResult {
  const root = resolve(rootDirectory)
  const violations: RepoAuditViolation[] = []
  let checked = 0

  for (const dir of SCAN_DIRS) {
    const absoluteDir = join(root, dir)
    if (!existsSync(absoluteDir)) continue
    for (const absolutePath of walkTextFiles(absoluteDir)) {
      checked += 1
      const relativePath = relative(root, absolutePath)
      const content = readFileSync(absolutePath, 'utf8')
      const lines = content.split('\n')

      for (const [index, line] of lines.entries()) {
        const matches = line.matchAll(LEGACY_COMMAND_PATTERN)
        for (const match of matches) {
          const snippet = match[0]?.trim()
          if (!snippet) continue
          if (isAllowedLegacyLine(line)) continue
          violations.push({
            file: relativePath,
            message: `Line ${index + 1} exposes legacy command ${JSON.stringify(snippet)} without current-state/migration context and an exact \`webpresso agent ...\` replacement.`,
          })
        }
      }
    }
  }

  return {
    ok: violations.length === 0,
    title: 'No retired CLI aliases in active docs/scripts',
    checked,
    violations,
  }
}

function walkTextFiles(directory: string): string[] {
  const entries = readdirSync(directory, { withFileTypes: true })
  const files: string[] = []
  for (const entry of entries) {
    if (SKIP_DIRS.has(entry.name)) continue
    const absolutePath = join(directory, entry.name)
    if (entry.isDirectory()) {
      files.push(...walkTextFiles(absolutePath))
      continue
    }
    if (!entry.isFile()) continue
    const extension = entry.name.includes('.') ? `.${entry.name.split('.').pop()}` : ''
    if (TEXT_EXTENSIONS.has(extension)) files.push(absolutePath)
  }
  return files
}

function isAllowedLegacyLine(line: string): boolean {
  LEGACY_COMMAND_PATTERN.lastIndex = 0
  if (!LEGACY_COMMAND_PATTERN.test(line)) return true
  LEGACY_COMMAND_PATTERN.lastIndex = 0

  if (INTERNAL_HELPER_PATTERN.test(line)) return true
  if (!MIGRATION_MARKER_PATTERN.test(line)) return false
  return REPLACEMENT_PATTERN.test(line)
}
