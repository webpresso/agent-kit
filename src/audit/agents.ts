import { existsSync, lstatSync, readFileSync, readdirSync, readlinkSync } from 'node:fs'
import { basename, dirname, join, relative, resolve } from 'node:path'

import { readConfig } from '#cli/commands/init/config'

import type { RepoAuditResult, RepoAuditViolation } from './repo-guardrails.js'

type HookEntry = { type?: string; command?: string; timeout?: number }
type HookGroup = { matcher?: string; hooks?: HookEntry[] }
type HooksMap = Record<string, HookGroup[]>

const REQUIRED_HOOKS = [
  { event: 'SessionStart', bin: 'wp-sessionstart-routing' },
  { event: 'PreToolUse', bin: 'wp-pretool-guard' },
  { event: 'PostToolUse', bin: 'wp-post-tool' },
  { event: 'UserPromptSubmit', bin: 'wp-guard-switch' },
  { event: 'Stop', bin: 'wp-stop-qa' },
  { event: 'PreCompact', bin: 'wp-precompact-snapshot' },
] as const

const CLAUDE_SETTINGS_PATH = '.claude/settings.json'
const CODEX_HOOKS_PATH = '.codex/hooks.json'
const REQUIRED_SUBAGENTS = [
  'code-reviewer.md',
  'security-auditor.md',
  'doc-writer.md',
  'explorer.md',
] as const

export function auditAgents(rootDirectory: string = process.cwd()): RepoAuditResult {
  const root = resolve(rootDirectory)
  const violations: RepoAuditViolation[] = []
  let checked = 0

  const packageJson = readJsonFile<Record<string, unknown>>(join(root, 'package.json'))
  const packageName = typeof packageJson.name === 'string' ? packageJson.name : undefined
  const isSelfHost = packageName === '@webpresso/agent-kit'
  const config = readConfig(root)

  checked += 1
  checkNonEmptyFile(
    root,
    'AGENTS.md',
    violations,
    'AGENTS.md is required at repo root and must be non-empty.',
  )

  if (isSelfHost) {
    // Agent surfaces (.agent/.claude/.codex/etc.) are generated and gitignored
    // in the source repo. For self-host, audit the canonical catalog sources
    // instead of requiring generated projections to exist in a clean checkout.
    checked += 1
    checkCatalogRules(root, violations)

    checked += 1
    checkCatalogAgents(root, violations)
  } else {
    checked += 1
    checkHookFile(root, CLAUDE_SETTINGS_PATH, 'claude', violations)

    checked += 1
    checkClaudeWorktree(root, violations)

    checked += 1
    checkHookFile(root, CODEX_HOOKS_PATH, 'codex', violations)

    checked += 1
    checkClaudeRules(root, config?.rules.overrides ?? [], violations)

    checked += 1
    checkClaudeAgents(root, violations)

    checked += 1
    checkSetupAgentScript(root, packageJson, config?.scripts['setup-agent'], violations)

    checked += 1
    checkAgentKitDevDependency(root, packageJson, violations)
  }

  return {
    ok: violations.length === 0,
    title: 'Agent surfaces',
    checked,
    violations,
  }
}

function checkCatalogRules(root: string, violations: RepoAuditViolation[]): void {
  const rulesSource = join(root, 'catalog', 'agent', 'rules')
  if (!existsSync(rulesSource)) {
    violations.push({
      file: 'catalog/agent/rules',
      message: 'Missing catalog/agent/rules source directory.',
    })
    return
  }

  const sourceEntries = readdirSync(rulesSource).filter(
    (file) => file.endsWith('.md') && file !== 'README.md' && file !== '.markdownlint.json',
  )
  if (sourceEntries.length === 0) {
    violations.push({
      file: 'catalog/agent/rules',
      message: 'catalog/agent/rules must contain canonical rule markdown files.',
    })
  }
}

function checkCatalogAgents(root: string, violations: RepoAuditViolation[]): void {
  const agentsSource = join(root, 'catalog', 'agent', 'agents')
  if (!existsSync(agentsSource)) {
    violations.push({
      file: 'catalog/agent/agents',
      message: 'Missing catalog/agent/agents source directory.',
    })
    return
  }

  for (const file of REQUIRED_SUBAGENTS) {
    const sourcePath = join(agentsSource, file)
    if (!existsSync(sourcePath)) {
      violations.push({
        file: relative(root, sourcePath),
        message: `Missing canonical subagent ${file} in catalog/agent/agents.`,
      })
    }
  }
}

function checkClaudeAgents(root: string, violations: RepoAuditViolation[]): void {
  const agentsTarget = join(root, '.claude', 'agents')

  if (!existsSync(agentsTarget)) {
    violations.push({
      file: '.claude/agents',
      message: 'Missing .claude/agents directory — run `wp setup` to scaffold canonical subagents.',
    })
    return
  }

  for (const file of REQUIRED_SUBAGENTS) {
    const targetPath = join(agentsTarget, file)
    if (!existsSync(targetPath)) {
      violations.push({
        file: relative(root, targetPath),
        message: `Missing Claude subagent ${file}. Run \`wp setup\` to re-sync canonical subagents.`,
      })
      continue
    }

    const stat = lstatSync(targetPath)
    if (!stat.isSymbolicLink()) {
      violations.push({
        file: relative(root, targetPath),
        message: `Canonical subagent ${file} must remain a symlink to catalog/agent/agents/${file}.`,
      })
      continue
    }

    const linkTarget = readlinkSync(targetPath).replace(/\\/gu, '/')
    const resolvedTarget = resolve(dirname(targetPath), linkTarget)
    const expectedSuffix = `/catalog/agent/agents/${file}`
    const looksLikeCanonicalTarget =
      linkTarget.endsWith(expectedSuffix) || basename(resolvedTarget) === file

    if (!looksLikeCanonicalTarget) {
      violations.push({
        file: relative(root, targetPath),
        message: `Canonical subagent ${file} points to ${JSON.stringify(linkTarget)} instead of a recognized catalog target.`,
      })
      continue
    }

    if (!existsSync(resolvedTarget)) {
      violations.push({
        file: relative(root, targetPath),
        message: `Canonical subagent ${file} symlink is dangling. Run \`wp setup\` to repair it.`,
      })
    }
  }
}

function checkNonEmptyFile(
  root: string,
  relativePath: string,
  violations: RepoAuditViolation[],
  message: string,
): void {
  const filePath = join(root, relativePath)
  if (!existsSync(filePath)) {
    violations.push({ file: relativePath, message })
    return
  }
  const content = readFileSync(filePath, 'utf8').trim()
  if (content.length === 0) {
    violations.push({ file: relativePath, message })
  }
}

function checkHookFile(
  root: string,
  relativePath: string,
  host: 'claude' | 'codex',
  violations: RepoAuditViolation[],
): void {
  const filePath = join(root, relativePath)
  if (!existsSync(filePath)) {
    violations.push({
      file: relativePath,
      message:
        host === 'claude'
          ? 'Missing .claude/settings.json — run `wp setup` to scaffold Claude hooks.'
          : 'Missing .codex/hooks.json — run `wp setup` to scaffold Codex hooks.',
    })
    return
  }

  const hooks = parseHooks(readFileSync(filePath, 'utf8'), host)
  for (const requirement of REQUIRED_HOOKS) {
    const groups = hooks[requirement.event] ?? []
    const found = groups.some((group) =>
      (group.hooks ?? []).some((hook) => hook.command?.includes(requirement.bin)),
    )
    if (!found) {
      const supportDetail =
        requirement.event === 'PreCompact'
          ? ' This is a managed internal hook surface; degraded hosts: claude, codex, opencode; unsupported hosts: cursor.'
          : ''
      violations.push({
        file: relativePath,
        message: `Missing ${requirement.event} hook for ${requirement.bin}.${supportDetail} Re-run \`wp setup\` to repair agent hooks.`,
      })
    }
  }
}

function checkClaudeWorktree(root: string, violations: RepoAuditViolation[]): void {
  const settingsPath = join(root, CLAUDE_SETTINGS_PATH)
  if (!existsSync(settingsPath)) return

  const parsed = readJsonFile<Record<string, unknown>>(settingsPath)
  const worktree = parsed.worktree as Record<string, unknown> | undefined
  const symlinkDirectories = Array.isArray(worktree?.symlinkDirectories)
    ? worktree?.symlinkDirectories
    : []

  if (!symlinkDirectories.includes('.claude')) {
    violations.push({
      file: CLAUDE_SETTINGS_PATH,
      message:
        'worktree.symlinkDirectories must include `.claude` so worktrees inherit agent surfaces.',
    })
  }
}

function checkClaudeRules(
  root: string,
  overrides: readonly string[],
  violations: RepoAuditViolation[],
): void {
  const rulesSource = join(root, '.agent', 'rules')
  const rulesTarget = join(root, '.claude', 'rules')
  const overrideSet = new Set(overrides)

  if (!existsSync(rulesSource)) {
    violations.push({
      file: '.agent/rules',
      message: 'Missing .agent/rules source directory.',
    })
    return
  }

  if (!existsSync(rulesTarget)) {
    violations.push({
      file: '.claude/rules',
      message: 'Missing .claude/rules directory — run `wp setup` to scaffold rule symlinks.',
    })
    return
  }

  const sourceEntries = readdirSync(rulesSource).filter(
    (file) => file.endsWith('.md') && file !== 'README.md' && file !== '.markdownlint.json',
  )
  const targetEntries = new Set(readdirSync(rulesTarget).filter((file) => file.endsWith('.md')))

  for (const file of sourceEntries) {
    const ruleName = file.replace(/\.md$/u, '')
    const targetPath = join(rulesTarget, file)
    const isOverride = overrideSet.has(ruleName)

    if (!existsSync(targetPath)) {
      violations.push({
        file: relative(root, targetPath),
        message: isOverride
          ? `Allowlisted override ${ruleName} is missing its .claude/rules entry.`
          : `Missing Claude rule link for ${ruleName}. Run \`wp setup\` to re-sync.`,
      })
      continue
    }

    const stat = lstatSync(targetPath)
    if (isOverride) {
      if (stat.isSymbolicLink()) {
        violations.push({
          file: relative(root, targetPath),
          message: `Rule ${ruleName} is allowlisted as an override but is still a symlink. Replace it with consumer-owned content or remove the override.`,
        })
      }
      continue
    }

    if (!stat.isSymbolicLink()) {
      violations.push({
        file: relative(root, targetPath),
        message: `Rule ${ruleName} is a real file but not allowlisted in .webpressorc.json#rules.overrides.`,
      })
      continue
    }

    const linkTarget = readlinkSync(targetPath).replace(/\\/gu, '/')
    const resolvedTarget = resolve(dirname(targetPath), linkTarget)
    const expectedLegacy = join('..', '..', '.agent', 'rules', file).replace(/\\/gu, '/')
    const looksLikeDirectRuleTarget =
      linkTarget.endsWith(`/catalog/agent/rules/${file}`) ||
      linkTarget.endsWith(`/.agent/rules/${file}`) ||
      basename(resolvedTarget) === file

    if (linkTarget !== expectedLegacy && !looksLikeDirectRuleTarget) {
      violations.push({
        file: relative(root, targetPath),
        message: `Rule ${ruleName} points to ${JSON.stringify(linkTarget)} instead of a recognized rule target.`,
      })
      continue
    }

    if (!existsSync(resolvedTarget)) {
      violations.push({
        file: relative(root, targetPath),
        message: `Rule ${ruleName} symlink is dangling. Run \`wp setup\` to repair it.`,
      })
    }
  }

  for (const file of targetEntries) {
    const ruleName = file.replace(/\.md$/u, '')
    if (sourceEntries.includes(file)) continue
    if (overrideSet.has(ruleName)) continue
    violations.push({
      file: relative(root, join(rulesTarget, file)),
      message: `Unexpected Claude rule ${file}. Remove it or add ${ruleName} to .webpressorc.json#rules.overrides.`,
    })
  }
}

function checkSetupAgentScript(
  root: string,
  packageJson: Record<string, unknown>,
  overrideCommand: string | undefined,
  violations: RepoAuditViolation[],
): void {
  const scripts = (packageJson.scripts ?? {}) as Record<string, unknown>
  const actual = typeof scripts['setup:agent'] === 'string' ? scripts['setup:agent'] : undefined
  const expected = overrideCommand ?? 'wp setup'

  if (actual !== expected) {
    violations.push({
      file: 'package.json',
      message:
        actual === undefined
          ? `Missing scripts.setup:agent. Expected ${JSON.stringify(expected)}.`
          : `scripts.setup:agent must be ${JSON.stringify(expected)} (got ${JSON.stringify(actual)}).`,
    })
  }
}

function checkAgentKitDevDependency(
  root: string,
  packageJson: Record<string, unknown>,
  violations: RepoAuditViolation[],
): void {
  const devDependencies = (packageJson.devDependencies ?? {}) as Record<string, unknown>
  const packageName = typeof packageJson.name === 'string' ? packageJson.name : ''
  const version = devDependencies['@webpresso/agent-kit']
  if (packageName === '@webpresso/agent-kit') {
    return
  }

  if (typeof version !== 'string' || version.trim().length === 0) {
    violations.push({
      file: 'package.json',
      message:
        'Missing devDependency `@webpresso/agent-kit`. Pin a published semver range, run `vp install`, then use global `wp setup`.',
    })
  }
}

function parseHooks(raw: string, host: 'claude' | 'codex'): HooksMap {
  const parsed = readJsonContent<Record<string, unknown> | null>(raw)
  if (!parsed || typeof parsed !== 'object') return {}
  // Both Claude and Codex use the wrapped form `{ "hooks": { Event: [...] } }`
  // per their canonical docs (https://developers.openai.com/codex/hooks).
  // The agent-hooks scaffolder writes wrapped via `hoistTopLevelEvents`; the
  // audit must read it the same way or it will report false negatives.
  // For Codex, fall back to the parsed root if `hooks` is absent so legacy
  // pre-migration flat-form files still audit cleanly.
  const hooks = parsed.hooks
  if (hooks && typeof hooks === 'object') return hooks as HooksMap
  return host === 'codex' ? (parsed as HooksMap) : {}
}

function readJsonFile<T>(path: string): T {
  return JSON.parse(readFileSync(path, 'utf8')) as T
}

function readJsonContent<T>(source: string): T {
  return JSON.parse(source) as T
}
