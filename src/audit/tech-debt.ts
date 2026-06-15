/**
 * `wp audit tech-debt` — validates tech-debt files against the schema.
 *
 * Checks:
 * - Each file parses against the Zod schema (all required fields, valid enums)
 * - Each file lives in the directory matching its `status` frontmatter
 * - Critical severity items have weekly cadence (schema refinement)
 */
import { existsSync } from 'node:fs'
import { readFileSync } from 'node:fs'
import path from 'node:path'

import matter from 'gray-matter'

import { walkDirectory } from '#shared-utils/walk-directory.js'
import { techDebtFrontmatterSchema } from '#tech-debt/schema'
import type { RepoAuditResult, RepoAuditViolation } from './repo-guardrails.js'

const STATUS_DIRS = ['accepted', 'needs-remediation', 'monitoring', 'resolved'] as const

function relativePath(root: string, filePath: string): string {
  return path.relative(root, filePath)
}

function listMarkdownFiles(dir: string): string[] {
  if (!existsSync(dir)) return []
  try {
    return walkDirectory(dir, { extensions: ['.md'] })
  } catch {
    return []
  }
}

/**
 * Audit all tech-debt markdown files under `root`.
 *
 * The root should be the directory that contains the status subdirectories
 * (accepted/, needs-remediation/, monitoring/, resolved/).
 */
export function auditTechDebt(root: string): RepoAuditResult {
  const violations: RepoAuditViolation[] = []
  let checked = 0

  for (const statusDir of STATUS_DIRS) {
    const dir = path.join(root, statusDir)
    if (!existsSync(dir)) continue

    const files = listMarkdownFiles(dir)
    for (const filePath of files) {
      checked++
      const rel = relativePath(root, filePath)

      let raw: string
      try {
        raw = readFileSync(filePath, 'utf8')
      } catch (err) {
        violations.push({
          file: rel,
          message: `Cannot read file: ${err instanceof Error ? err.message : String(err)}`,
        })
        continue
      }

      let data: Record<string, unknown>
      try {
        const parsed = matter(raw)
        data = parsed.data as Record<string, unknown>
      } catch (err) {
        violations.push({
          file: rel,
          message: `Cannot parse frontmatter: ${err instanceof Error ? err.message : String(err)}`,
        })
        continue
      }

      // Validate against the Zod schema
      const result = techDebtFrontmatterSchema.safeParse(data)
      if (!result.success) {
        for (const issue of result.error.issues) {
          const fieldPath = issue.path.length > 0 ? ` (${issue.path.join('.')})` : ''
          violations.push({
            file: rel,
            message: `Schema validation failed${fieldPath}: ${issue.message}`,
          })
        }
        continue
      }

      // Check: file lives in the directory matching its `status` field
      const fileStatus = result.data.status
      if (fileStatus !== statusDir) {
        violations.push({
          file: rel,
          message: `Status mismatch: frontmatter says '${fileStatus}' but file is in '${statusDir}/' directory`,
        })
      }
    }
  }

  return {
    ok: violations.length === 0,
    title: 'Tech-debt audit',
    checked,
    violations,
  }
}
