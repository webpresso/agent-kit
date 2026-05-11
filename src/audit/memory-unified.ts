import { existsSync, readFileSync } from 'node:fs'
import { join } from 'node:path'

import type { RepoAuditResult, RepoAuditViolation } from './repo-guardrails.js'

const AGENTS_MD_IMPORT = '@AGENTS.md'

export async function auditMemoryUnified(cwd: string): Promise<RepoAuditResult> {
  const claudeMdPath = join(cwd, 'CLAUDE.md')
  const violations: RepoAuditViolation[] = []

  if (!existsSync(claudeMdPath)) {
    // No CLAUDE.md at all — warn but don't fail
    return {
      ok: true,
      title: 'memory unified',
      checked: 0,
      violations: [],
    }
  }

  let content: string
  try {
    content = readFileSync(claudeMdPath, 'utf-8')
  } catch {
    violations.push({
      file: 'CLAUDE.md',
      message: `[warn] failed to read CLAUDE.md`,
    })
    return {
      ok: true,
      title: 'memory unified',
      checked: 1,
      violations,
    }
  }

  if (!content.includes(AGENTS_MD_IMPORT)) {
    violations.push({
      file: 'CLAUDE.md',
      message: `[warn] CLAUDE.md does not contain \`${AGENTS_MD_IMPORT}\` import — add \`@AGENTS.md\` to unify agent memory across IDEs`,
    })
  }

  // Warns only — always ok:true so this never gates CI alone
  return {
    ok: true,
    title: 'memory unified',
    checked: 1,
    violations,
  }
}
