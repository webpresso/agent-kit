import { existsSync, readdirSync, readFileSync, statSync } from 'node:fs'
import { basename, extname, join, relative, resolve } from 'node:path'

import type { RepoAuditResult, RepoAuditViolation } from './repo-guardrails.js'

const CTX_RS = ['ctx', 'rs'].join('-')
const BANNED_STRINGS = [
  CTX_RS,
  `@webpresso/${CTX_RS}`,
  `vendor/${CTX_RS}`,
  `webpresso/${CTX_RS}`,
] as const

const INCLUDED_PATHS = [
  'bin',
  'src',
  'native/session-memory-engine',
  'docs/guides',
  'blueprints/planned',
  'blueprints/in-progress',
  'package.json',
  '.github/workflows',
  'package.contract.test.ts',
  'scripts/public-readiness.ts',
] as const

const EXCLUDED_SUBSTRINGS = [
  '/docs/research/',
  '/blueprints/parked/',
  '/blueprints/archived/',
] as const

const TEXT_EXTENSIONS = new Set([
  '.json',
  '.js',
  '.md',
  '.mts',
  '.mjs',
  '.rs',
  '.sh',
  '.sql',
  '.toml',
  '.ts',
  '.tsx',
  '.yaml',
  '.yml',
])

export function auditSessionMemoryHardcut(rootDirectory: string = process.cwd()): RepoAuditResult {
  const root = resolve(rootDirectory)
  const violations: RepoAuditViolation[] = []
  let checked = 0

  for (const included of INCLUDED_PATHS) {
    const target = join(root, included)
    if (!existsSync(target)) continue
    const stats = statSync(target)
    if (stats.isDirectory()) {
      for (const file of walkFiles(target)) {
        if (shouldSkip(file)) continue
        checked += 1
        collectViolations(root, file, violations)
      }
    } else {
      if (shouldSkip(target)) continue
      checked += 1
      collectViolations(root, target, violations)
    }
  }

  return {
    ok: violations.length === 0,
    title: 'Session-memory hard-cut live-surface audit',
    checked,
    violations,
  }
}

function walkFiles(dir: string): string[] {
  const files: string[] = []
  for (const entry of readdirSync(dir, { withFileTypes: true })) {
    const path = join(dir, entry.name)
    if (entry.isDirectory()) {
      files.push(...walkFiles(path))
    } else {
      files.push(path)
    }
  }
  return files
}

function shouldSkip(path: string): boolean {
  const normalized = path.replaceAll('\\', '/')
  if (EXCLUDED_SUBSTRINGS.some((segment) => normalized.includes(segment))) return true
  const lower = path.toLowerCase()
  if (lower.endsWith('.png') || lower.endsWith('.jpg') || lower.endsWith('.jpeg')) return true
  const fileBase = basename(path)
  const extension = extname(fileBase)
  if (extension.length === 0) return false
  return !TEXT_EXTENSIONS.has(extension)
}

function collectViolations(root: string, file: string, violations: RepoAuditViolation[]): void {
  const text = readFileSync(file, 'utf8')
  for (const banned of BANNED_STRINGS) {
    if (!text.includes(banned)) continue
    violations.push({
      file: relative(root, file),
      message: `Live operational surface still contains banned legacy session-memory string ${JSON.stringify(
        banned,
      )}`,
    })
  }
}
