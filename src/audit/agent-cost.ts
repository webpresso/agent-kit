import { execSync } from 'node:child_process'
import { existsSync, readFileSync } from 'node:fs'
import { join } from 'node:path'

import type { RepoAuditResult, RepoAuditViolation } from './repo-guardrails.js'

function hasFilesWithExtension(root: string, ext: string): boolean {
  try {
    const out = execSync(
      `find . \\( -path ./node_modules -o -path ./.git -o -path ./dist -o -path ./build \\) -prune -o -name "*.${ext}" -print -quit`,
      { cwd: root, encoding: 'utf-8', timeout: 3000, stdio: ['pipe', 'pipe', 'ignore'] },
    )
    return out.trim().length > 0
  } catch {
    return false
  }
}

function readProjectSettings(cwd: string): Record<string, unknown> | null {
  const path = join(cwd, '.claude', 'settings.json')
  if (!existsSync(path)) return null
  try {
    const parsed: unknown = JSON.parse(readFileSync(path, 'utf-8'))
    return parsed !== null && typeof parsed === 'object' ? (parsed as Record<string, unknown>) : null
  } catch {
    return null
  }
}

export async function auditAgentCost(cwd: string): Promise<RepoAuditResult> {
  const violations: RepoAuditViolation[] = []
  let checked = 0

  // ─── Check 1: .claudeignore present ───────────────────────────────────────
  checked++
  if (!existsSync(join(cwd, '.claudeignore'))) {
    violations.push({
      file: '.claudeignore',
      message:
        'Missing .claudeignore — Claude Code will traverse node_modules, dist, and build ' +
        'artifacts during autonomous exploration. Create .claudeignore (gitignore syntax) ' +
        'with node_modules/, .webpresso/, .wrangler/, packages/*/dist/ etc. ' +
        'Typical savings: 30–40% fewer input tokens per session.',
    })
  }

  // ─── Check 2: effortLevel in project .claude/settings.json ────────────────
  checked++
  const settings = readProjectSettings(cwd)
  if (settings === null) {
    violations.push({
      file: '.claude/settings.json',
      message:
        '.claude/settings.json not found. Consider creating it with "effortLevel": "medium" ' +
        'to cap thinking token spend for this project. ' +
        'The global ~/.claude/settings.json default may be "xhigh" (max thinking tokens). ' +
        'Override per-session with /effort high when planning.',
    })
  } else if (!('effortLevel' in settings)) {
    violations.push({
      file: '.claude/settings.json',
      message:
        'effortLevel not set in project settings — inherits from ~/.claude/settings.json. ' +
        'If the global setting is "xhigh", every request in this project runs max thinking tokens. ' +
        'Add "effortLevel": "medium" here to scope the budget. Override with /effort high per-session.',
    })
  }

  // ─── Check 3: LSP plugins for languages absent from the repo ──────────────
  const lspChecks = [
    { plugin: 'rust-analyzer-lsp', ext: 'rs', lang: 'Rust' },
    { plugin: 'gopls-lsp', ext: 'go', lang: 'Go' },
  ] as const

  for (const { plugin, ext, lang } of lspChecks) {
    checked++
    if (!hasFilesWithExtension(cwd, ext)) {
      violations.push({
        message:
          `No .${ext} (${lang}) files found — ${plugin} is likely unused. ` +
          `Disable it in ~/.claude/settings.json: "${plugin}@claude-plugins-official": false. ` +
          `LSP tool schemas inject into every session system prompt (~1–3K tokens each).`,
      })
    }
  }

  // Advisory audit — violations are warnings, not blocking errors.
  // Cost config is a recommendation, not a hard correctness gate.
  return {
    ok: true,
    title: 'agent cost config',
    checked,
    violations,
  }
}
