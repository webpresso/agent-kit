/**
 * `wp audit skill-sizes` — checks .agent/skills/<name>/SKILL.md file sizes
 * against the configured budgets.
 *
 * Checks:
 * - Per-skill description bytes (from `description` frontmatter field)
 * - Per-skill total file bytes
 * - Codex listing total = sum of all skill description bytes
 */
import { execSync } from 'node:child_process'
import { existsSync, readdirSync, readFileSync, statSync } from 'node:fs'
import path from 'node:path'

import matter from 'gray-matter'

import { loadBudgets } from './_budgets.js'
import type { RepoAuditResult, RepoAuditViolation } from './repo-guardrails.js'

export interface SkillSizeViolation extends RepoAuditViolation {
  file: string
  kind: 'description-too-large' | 'file-too-large' | 'codex-listing-total-too-large'
  bytes: number
  maxBytes: number
}

export interface SkillSizesResult {
  violations: SkillSizeViolation[]
  codexListingTotal: number
  codexListingMaxBytes: number
  pass: boolean
}

export interface SkillSizesOptions {
  staged?: boolean
}

/**
 * Return the set of staged files when running in staged mode.
 * Returns null if not staged (meaning: check all files).
 */
function getStagedFiles(cwd: string): Set<string> | null {
  try {
    const output = execSync('git diff --staged --name-only', { cwd, encoding: 'utf8' })
    const files = new Set(
      output
        .split('\n')
        .map((f) => f.trim())
        .filter((f) => f.length > 0)
        .map((f) => path.resolve(cwd, f)),
    )
    return files
  } catch {
    return null
  }
}

function walkSkillDirs(agentSkillsDir: string): string[] {
  if (!existsSync(agentSkillsDir)) return []
  const dirs: string[] = []
  try {
    for (const entry of readdirSync(agentSkillsDir, { withFileTypes: true })) {
      if (entry.isDirectory()) {
        dirs.push(path.join(agentSkillsDir, entry.name))
      }
    }
  } catch {
    // ignore unreadable dirs
  }
  return dirs.sort()
}

/**
 * Audit skill SKILL.md sizes in `.agent/skills/<name>/SKILL.md`.
 */
export function auditSkillSizes(cwd: string, options: SkillSizesOptions = {}): SkillSizesResult {
  const budgets = loadBudgets(cwd)
  const descMaxBytes = budgets['claude-skill-description-each'].max_bytes
  const fileMaxBytes = budgets['skill-md-total-each'].max_bytes
  const codexListingMaxBytes = budgets['codex-skill-listing-total'].max_bytes

  const agentSkillsDir = path.join(cwd, '.agent', 'skills')
  const skillDirs = walkSkillDirs(agentSkillsDir)

  let stagedFiles: Set<string> | null = null
  if (options.staged) {
    stagedFiles = getStagedFiles(cwd)
    // If we can't determine staged files, fall back to checking all
  }

  const violations: SkillSizeViolation[] = []
  let codexListingTotal = 0

  for (const skillDir of skillDirs) {
    const skillMdPath = path.join(skillDir, 'SKILL.md')
    if (!existsSync(skillMdPath)) continue

    const relPath = path.relative(cwd, skillMdPath)

    // In staged mode, skip files not in the staged set
    if (stagedFiles !== null && !stagedFiles.has(path.resolve(cwd, relPath))) {
      continue
    }

    let raw: string
    try {
      raw = readFileSync(skillMdPath, 'utf8')
    } catch {
      continue
    }

    // Total file bytes (using stat for accuracy)
    let totalBytes: number
    try {
      totalBytes = statSync(skillMdPath).size
    } catch {
      totalBytes = Buffer.byteLength(raw, 'utf8')
    }

    // Description bytes from frontmatter
    let descriptionBytes = 0
    try {
      const parsed = matter(raw)
      const desc = parsed.data?.['description']
      if (typeof desc === 'string') {
        descriptionBytes = Buffer.byteLength(desc, 'utf8')
        codexListingTotal += descriptionBytes
      }
    } catch {
      // skip frontmatter parse error
    }

    // Check description size
    if (descriptionBytes > descMaxBytes) {
      violations.push({
        file: relPath,
        kind: 'description-too-large',
        message: `Skill description is ${descriptionBytes}B (max ${descMaxBytes}B). Shorten the description frontmatter field.`,
        bytes: descriptionBytes,
        maxBytes: descMaxBytes,
      })
    }

    // Check total file size
    if (totalBytes > fileMaxBytes) {
      violations.push({
        file: relPath,
        kind: 'file-too-large',
        message: `SKILL.md is ${totalBytes}B (max ${fileMaxBytes}B). Split the skill or compact its content.`,
        bytes: totalBytes,
        maxBytes: fileMaxBytes,
      })
    }
  }

  // Check codex listing total
  if (codexListingTotal > codexListingMaxBytes) {
    violations.push({
      file: '.agent/skills',
      kind: 'codex-listing-total-too-large',
      message: `Codex listing total is ${codexListingTotal}B (max ${codexListingMaxBytes}B). Reduce skill description lengths.`,
      bytes: codexListingTotal,
      maxBytes: codexListingMaxBytes,
    })
  }

  return {
    violations,
    codexListingTotal,
    codexListingMaxBytes,
    pass: violations.length === 0,
  }
}

/**
 * Adapter to return a RepoAuditResult shape for registry integration.
 */
export function auditSkillSizesAsRepoResult(
  cwd: string,
  options: SkillSizesOptions = {},
): RepoAuditResult {
  const result = auditSkillSizes(cwd, options)
  return {
    ok: result.pass,
    title: 'Skill sizes audit',
    checked: result.violations.length,
    violations: result.violations,
  }
}
