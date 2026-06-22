import { existsSync, readFileSync, readdirSync, statSync } from 'node:fs'
import path from 'node:path'
import matter from 'gray-matter'
import type { RepoAuditResult, RepoAuditViolation } from './repo-guardrails.js'
import { validateBlueprintTrust } from '../blueprint/trust/validator.js'
import { parseBlueprintDocumentRelativePath } from '#utils/document-paths.js'

const EXECUTABLE_DIRS = ['planned', 'in-progress', 'completed'] as const

export function auditBlueprintTrust(rootDirectory: string = process.cwd()): RepoAuditResult {
  const violations: RepoAuditViolation[] = []
  let checked = 0
  for (const file of findExecutableBlueprints(rootDirectory)) {
    checked += 1
    const markdown = readFileSync(path.join(rootDirectory, file), 'utf8')
    const status = readStatus(markdown)
    const result = validateBlueprintTrust({ repoRoot: rootDirectory, file, status, markdown })
    for (const violation of result.violations) {
      violations.push({ file, message: `${violation.section}: ${violation.message}` })
    }
  }
  return { ok: violations.length === 0, title: 'Blueprint trust', checked, violations }
}

export function findExecutableBlueprints(rootDirectory: string): string[] {
  const root = path.join(rootDirectory, 'blueprints')
  const files: string[] = []
  for (const dir of EXECUTABLE_DIRS) walk(path.join(root, dir), files, rootDirectory)
  return files.sort()
}

function walk(dir: string, files: string[], root: string): void {
  if (!existsSync(dir)) return
  const blueprintRoot = path.join(root, 'blueprints')
  for (const entry of readdirSync(dir)) {
    const full = path.join(dir, entry)
    const stat = statSync(full)
    if (stat.isDirectory()) {
      walk(full, files, root)
      continue
    }
    if (!entry.endsWith('.md')) continue
    const relativeToBlueprintRoot = path.relative(blueprintRoot, full)
    if (parseBlueprintDocumentRelativePath(relativeToBlueprintRoot))
      files.push(path.relative(root, full))
  }
}

function readStatus(markdown: string): string {
  const parsed = matter(markdown)
  return typeof parsed.data['status'] === 'string' ? parsed.data['status'] : 'planned'
}
