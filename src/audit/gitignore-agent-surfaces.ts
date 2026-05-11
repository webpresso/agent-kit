import { existsSync, readFileSync } from 'node:fs'
import { join } from 'node:path'

import type { RepoAuditResult, RepoAuditViolation } from './repo-guardrails.js'

const EXPECTED_PATHS = [
  '.claude/skills/',
  '.codex/skills/',
  '.cursor/rules/',
  '.windsurf/rules/',
  '.gemini/commands/',
  '.opencode/agents/',
  '.opencode/commands/',
  '.agents/skills/',
  '.agent/.merged.provenance.json',
  '.agent/.compile-manifest.json',
  '.agent/.rotation-log.jsonl',
] as const

export async function auditGitignoreAgentSurfaces(cwd: string): Promise<RepoAuditResult> {
  const gitignorePath = join(cwd, '.gitignore')
  const violations: RepoAuditViolation[] = []

  if (!existsSync(gitignorePath)) {
    return {
      ok: false,
      title: 'gitignore agent surfaces',
      checked: EXPECTED_PATHS.length,
      violations: [{ file: '.gitignore', message: '.gitignore not found — run `ak setup` to scaffold it' }],
    }
  }

  let content: string
  try {
    content = readFileSync(gitignorePath, 'utf-8')
  } catch {
    return {
      ok: false,
      title: 'gitignore agent surfaces',
      checked: EXPECTED_PATHS.length,
      violations: [{ file: '.gitignore', message: 'failed to read .gitignore' }],
    }
  }

  const lines = new Set(content.split('\n').map((l) => l.trim()).filter(Boolean))

  for (const expected of EXPECTED_PATHS) {
    if (!lines.has(expected)) {
      violations.push({
        file: '.gitignore',
        message: `Missing gitignore entry: ${expected} — run \`ak setup\` to add generated agent surface paths`,
      })
    }
  }

  return {
    ok: violations.length === 0,
    title: 'gitignore agent surfaces',
    checked: EXPECTED_PATHS.length,
    violations,
  }
}
