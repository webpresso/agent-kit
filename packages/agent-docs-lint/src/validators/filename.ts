import type { ValidationError } from '#types'

import { basename } from 'node:path'

/**
 * Valid filename pattern: lowercase letters, numbers, and hyphens only.
 * Special exceptions:
 * - _overview.md (allowed for implementation plan indexes)
 * - Files starting with a date pattern like 2026-01-07
 */
const KEBAB_CASE_PATTERN = /^[a-z0-9]+(?:-[a-z0-9]+)*\.md$/
const DATE_PREFIX_PATTERN = /^\d{4}-\d{2}-\d{2}/
const OVERVIEW_FILENAME = '_overview.md'
const SPECIAL_ALLOWED = new Set([OVERVIEW_FILENAME])

/**
 * Conventional uppercase documentation files that are allowed.
 * README.md is standard across the industry.
 * Product docs (VISION, STATUS, etc.) follow a convention of uppercase for core docs.
 */
const CONVENTIONAL_UPPERCASE = new Set([
  'README.md',
  'CHANGELOG.md',
  'CONTRIBUTING.md',
  'LICENSE.md',
])

/**
 * Paths where uppercase filenames are allowed (historical/completed docs).
 */
const UPPERCASE_ALLOWED_PATHS = ['docs/research/product/', 'webpresso/blueprints/_completed/']

/**
 * Check if file is in an allowed path for uppercase filenames
 */
function isAllowedUppercasePath(filePath: string): boolean {
  return UPPERCASE_ALLOWED_PATHS.some((path) => filePath.startsWith(path))
}

/**
 * Check if date-prefixed file follows naming conventions
 */
function isValidDatePrefixedFile(fileName: string): boolean {
  if (!DATE_PREFIX_PATTERN.test(fileName)) return false
  const afterDate = fileName.replace(/^\d{4}-\d{2}-\d{2}-?/, '')
  return afterDate === '' || KEBAB_CASE_PATTERN.test(afterDate)
}

/**
 * Check if file is exempt from kebab-case validation
 */
function isExemptFile(filePath: string, fileName: string): boolean {
  // Only validate files in the docs/ folder
  if (!filePath.startsWith('docs/')) return true

  // Allow special files
  if (SPECIAL_ALLOWED.has(fileName)) return true

  // Allow conventional uppercase files (README.md, etc.)
  if (CONVENTIONAL_UPPERCASE.has(fileName)) return true

  // Allow uppercase files in specific paths (product docs, completed plans, research)
  if (isAllowedUppercasePath(filePath)) return true

  // Allow date-prefixed files that follow kebab-case after the date
  if (isValidDatePrefixedFile(fileName)) return true

  // Already valid kebab-case
  if (KEBAB_CASE_PATTERN.test(fileName)) return true

  return false
}

/**
 * Detect specific naming issues for helpful error messages
 */
function detectFilenameIssues(fileName: string): string[] {
  const issues: string[] = []

  if (/[A-Z]/.test(fileName)) {
    issues.push('contains uppercase letters')
  }

  if (/_/.test(fileName) && fileName !== OVERVIEW_FILENAME) {
    issues.push('contains underscores (use hyphens instead)')
  }

  return issues
}

/**
 * Validate that a documentation filename follows lowercase kebab-case convention.
 *
 * Rules:
 * - Filenames must be all lowercase
 * - Words must be separated by hyphens (not underscores)
 * - Special files like `_overview.md` are allowed
 * - Date-prefixed files are allowed (e.g., 2026-01-07-audit.md)
 */
export function validateFilename(filePath: string): ValidationError[] {
  const fileName = basename(filePath)
  const isAudit = filePath.includes('docs/research/quality-audits/')

  // Strict check for audit files
  if (isAudit) {
    const strictAuditPattern = /^\d{4}-\d{2}-\d{2}-[a-z0-9]+(?:-[a-z0-9]+)*\.md$/
    if (!strictAuditPattern.test(fileName)) {
      return [
        {
          file: filePath,
          severity: 'error',
          source: 'structure',
          message: `Audit files must follow strict naming: YYYY-MM-DD-kebab-case.md (e.g., 2026-01-07-security-audit.md)`,
          ruleId: 'audit-filename-strict',
        },
      ]
    }
    return []
  }

  if (isExemptFile(filePath, fileName)) {
    return []
  }

  const issues = detectFilenameIssues(fileName)
  const issueText = issues.length > 0 ? `: ${issues.join(', ')}` : ''

  return [
    {
      file: filePath,
      severity: 'error',
      source: 'structure',
      message: `Filename must be lowercase kebab-case${issueText}. Rename to: ${toKebabCase(fileName)}`,
      ruleId: 'filename-kebab-case',
    },
  ]
}

/**
 * Convert a filename to kebab-case.
 */
function toKebabCase(fileName: string): string {
  return fileName.toLowerCase().replace(/_/g, '-')
}
