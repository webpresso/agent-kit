import type { ToolInput, ValidationResult } from '#hooks/shared/types'

import { readConfig } from '#cli/commands/init/config'
import { getCommand, isBashInput } from '#hooks/shared/types'
import { createSkipResult } from './skip-result.js'
import { buildRedirectMessage, type MCPRedirectConfig } from './mcp-redirect.js'

export type CommandCategory = 'test' | 'lint' | 'typecheck' | 'blueprint' | 'unknown'

export interface CommandRule {
  pattern: RegExp
  category: CommandCategory
  suggestion: string
}

export interface SuggestionModifier {
  pattern: RegExp
  category: CommandCategory
  suggestion: string
}

export interface BlockedCommandResult extends ValidationResult {
  command: string
  suggestion: string
  category: CommandCategory
  docsRef: string
  matchedPattern: string
}

interface BlockedToolSpec {
  tool: string
  category: CommandCategory
  suggestion: string
  runners: ('exec' | 'direct' | 'bare')[]
}

interface BlockedScriptSpec {
  script: string
  category: CommandCategory
  suggestion: string
}

interface RedirectOptions {
  mcpReady?: boolean
  mcp?: MCPRedirectConfig
}

export const VALIDATOR_NAME = 'forbidden-commands'
export const SKIP_ENV_VAR = 'FORBIDDEN_COMMANDS_SKIP'
export const AUDIT_MODE_ENV = 'FORBIDDEN_COMMANDS_AUDIT'
export const DOCS_REF = 'AGENTS.md "Forbidden Commands (CRITICAL)" section'

const DB_HINT = 'just db-push (or just db-migrate, just db-generate)'
const BLUEPRINT_HINT = 'ak blueprint new|list|audit — use ak_blueprint MCP tool for lifecycle transitions'
const BLUEPRINT_LIFECYCLE_DIRS = '(draft|planned|in-progress|completed|archived)'
const LINT_BASE = 'just lint --package <name> (or --file <path>)'
const LINT_HINT = `${LINT_BASE} [--fix] [--fix-unsafe]`
const FORMAT_HINT = 'just format (or just format-check)'
const TEST_HINT = 'just test --package <name> (or --file <path>)'
const MUTATION_HINT = 'just test --mutation --package <name>'
const TYPECHECK_HINT = 'just typecheck --package <name> (or --file <path>)'
const ENV_HINT = 'just run <cmd> (injects secrets/env automatically)'
const JUST_TASK_TARGET_HINT =
  'just <task> [target] — check justfile for existing recipes, or add a new one'

const EXEC_RUNNERS = ['pnpm exec', 'pnpx', 'bunx'] as const
const DIRECT_RUNNERS = ['pnpm', 'bun run', 'bun'] as const
const SCRIPT_RUNNERS = ['pnpm run', 'pnpm', 'npm run', 'npm', 'bun run', 'bun'] as const

export const BLOCKED_TOOLS: BlockedToolSpec[] = [
  {
    tool: 'drizzle-kit',
    category: 'unknown',
    suggestion: DB_HINT,
    runners: ['exec', 'direct', 'bare'],
  },
  { tool: 'vitest', category: 'test', suggestion: TEST_HINT, runners: ['exec', 'direct', 'bare'] },
  { tool: 'oxlint', category: 'lint', suggestion: LINT_HINT, runners: ['exec', 'direct', 'bare'] },
  { tool: 'oxfmt', category: 'lint', suggestion: FORMAT_HINT, runners: ['exec', 'direct', 'bare'] },
  { tool: 'stryker', category: 'test', suggestion: MUTATION_HINT, runners: ['exec', 'bare'] },
  {
    tool: 'tsc',
    category: 'typecheck',
    suggestion: TYPECHECK_HINT,
    runners: ['exec', 'direct', 'bare'],
  },
  {
    tool: 'tsgo',
    category: 'typecheck',
    suggestion: TYPECHECK_HINT,
    runners: ['exec', 'direct', 'bare'],
  },
]

export const BLOCKED_SCRIPTS: BlockedScriptSpec[] = [
  { script: 'test', category: 'test', suggestion: TEST_HINT },
  { script: 'lint', category: 'lint', suggestion: LINT_HINT },
  { script: 'typecheck', category: 'typecheck', suggestion: TYPECHECK_HINT },
]

function escapeRegex(s: string): string {
  return s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
}

function buildToolPattern(prefix: string, tool: string): RegExp {
  const escaped = prefix ? `${escapeRegex(prefix)} ${escapeRegex(tool)}` : escapeRegex(tool)
  return new RegExp(`^${escaped}(\\s|$)`)
}

export function generateRules(): CommandRule[] {
  const rules: CommandRule[] = []

  for (const spec of BLOCKED_TOOLS) {
    if (spec.runners.includes('exec')) {
      for (const runner of EXEC_RUNNERS) {
        rules.push({
          pattern: buildToolPattern(runner, spec.tool),
          category: spec.category,
          suggestion: spec.suggestion,
        })
      }
    }
    if (spec.runners.includes('direct')) {
      for (const runner of DIRECT_RUNNERS) {
        rules.push({
          pattern: buildToolPattern(runner, spec.tool),
          category: spec.category,
          suggestion: spec.suggestion,
        })
      }
    }
    if (spec.runners.includes('bare')) {
      rules.push({
        pattern: buildToolPattern('', spec.tool),
        category: spec.category,
        suggestion: spec.suggestion,
      })
    }
  }

  for (const spec of BLOCKED_SCRIPTS) {
    for (const runner of SCRIPT_RUNNERS) {
      rules.push({
        pattern: buildToolPattern(runner, spec.script),
        category: spec.category,
        suggestion: spec.suggestion,
      })
    }
  }

  rules.push(
    {
      pattern: new RegExp(`^mv\\b.*blueprints\\/${BLUEPRINT_LIFECYCLE_DIRS}`),
      category: 'blueprint',
      suggestion: BLUEPRINT_HINT,
    },
    {
      pattern: new RegExp(`^mkdir\\b.*blueprints\\/${BLUEPRINT_LIFECYCLE_DIRS}`),
      category: 'blueprint',
      suggestion: BLUEPRINT_HINT,
    },
    {
      // git mv is an alternative to bare mv for tracked files — same bypass vector.
      pattern: new RegExp(`^git\\s+mv\\b.*blueprints\\/${BLUEPRINT_LIFECYCLE_DIRS}`),
      category: 'blueprint',
      suggestion: BLUEPRINT_HINT,
    },
    { pattern: /^doppler run/, category: 'unknown', suggestion: ENV_HINT },
    { pattern: /^DATABASE_URL=/, category: 'unknown', suggestion: ENV_HINT },
    { pattern: /^pnpm exec\b/, category: 'unknown', suggestion: JUST_TASK_TARGET_HINT },
    { pattern: /^pnpm run\b/, category: 'unknown', suggestion: JUST_TASK_TARGET_HINT },
    { pattern: /^npm exec\b/, category: 'unknown', suggestion: JUST_TASK_TARGET_HINT },
    { pattern: /^npm run\b/, category: 'unknown', suggestion: JUST_TASK_TARGET_HINT },
    { pattern: /^bun run\b/, category: 'unknown', suggestion: JUST_TASK_TARGET_HINT },
    { pattern: /^npx\b/, category: 'unknown', suggestion: JUST_TASK_TARGET_HINT },
    { pattern: /^pnpx\b/, category: 'unknown', suggestion: JUST_TASK_TARGET_HINT },
    { pattern: /^bunx\b/, category: 'unknown', suggestion: JUST_TASK_TARGET_HINT },
  )

  return rules
}

export const COMMAND_RULES: CommandRule[] = generateRules()

export const SUGGESTION_MODIFIERS: SuggestionModifier[] = [
  {
    pattern: /--fix-dangerous|--write.*--unsafe|--unsafe.*--write/,
    category: 'lint',
    suggestion: `${LINT_BASE} --fix-unsafe`,
  },
  { pattern: /--fix|--write/, category: 'lint', suggestion: `${LINT_BASE} --fix` },
]

const LOGICAL_OPERATOR_REGEX = /(?:&&|\|\||;)/

/**
 * Split a shell command string on top-level operators (&&, ||, |, ;) while
 * correctly skipping operators that appear inside:
 *   - single-quoted strings:  '...'
 *   - double-quoted strings:  "..."
 *   - $(...) command substitutions (handles nesting)
 *   - backtick subshells: `...`
 *
 * This prevents heredoc or subshell content from being mistaken for real
 * command segments (e.g. git commit -m "$(cat <<'EOF'\n...&&...\nEOF\n)").
 */
export function splitTopLevelCommands(command: string): string[] {
  const segments: string[] = []
  let current = ''
  let depth = 0
  let inSingleQuote = false
  let inDoubleQuote = false
  let inBacktick = false
  let i = 0

  while (i < command.length) {
    const ch = command[i]
    const next = i + 1 < command.length ? command[i + 1] : ''

    if (inSingleQuote) {
      current += ch
      if (ch === "'") inSingleQuote = false
      i++
      continue
    }

    if (inBacktick) {
      current += ch
      if (ch === '`') inBacktick = false
      i++
      continue
    }

    if (depth > 0) {
      if (ch === '$' && next === '(') {
        depth++
        current += ch + next
        i += 2
      } else if (ch === ')') {
        depth--
        current += ch
        i++
      } else if (ch === "'") {
        inSingleQuote = true
        current += ch
        i++
      } else if (ch === '`') {
        inBacktick = true
        current += ch
        i++
      } else {
        current += ch
        i++
      }
      continue
    }

    if (inDoubleQuote) {
      if (ch === '"') {
        inDoubleQuote = false
        current += ch
        i++
      } else if (ch === '$' && next === '(') {
        depth++
        current += ch + next
        i += 2
      } else if (ch === '\\') {
        current += ch + next
        i += 2
      } else {
        current += ch
        i++
      }
      continue
    }

    // Top-level context — check for operators before recording the character.
    if (ch === "'") {
      inSingleQuote = true
      current += ch
      i++
    } else if (ch === '"') {
      inDoubleQuote = true
      current += ch
      i++
    } else if (ch === '`') {
      inBacktick = true
      current += ch
      i++
    } else if (ch === '$' && next === '(') {
      depth++
      current += ch + next
      i += 2
    } else if (ch === '&' && next === '&') {
      const seg = current.trim()
      if (seg) segments.push(seg)
      current = ''
      i += 2
    } else if (ch === '|' && next === '|') {
      const seg = current.trim()
      if (seg) segments.push(seg)
      current = ''
      i += 2
    } else if (ch === '|') {
      const seg = current.trim()
      if (seg) segments.push(seg)
      current = ''
      i++
    } else if (ch === ';') {
      const seg = current.trim()
      if (seg) segments.push(seg)
      current = ''
      i++
    } else {
      current += ch
      i++
    }
  }

  const last = current.trim()
  if (last) segments.push(last)
  return segments
}

export function findMatchingRule(command: string): CommandRule | undefined {
  for (const variant of getCommandVariants(command)) {
    const rule = COMMAND_RULES.find((r) => r.pattern.test(variant))
    if (rule) return rule
  }
  return undefined
}

export function applySuggestionModifiers(command: string, rule: CommandRule): string {
  for (const modifier of SUGGESTION_MODIFIERS) {
    if (modifier.category === rule.category && modifier.pattern.test(command))
      return modifier.suggestion
  }
  return rule.suggestion
}

export function getJustEquivalent(command: string): string {
  const rule = findMatchingRule(command)
  if (!rule) return 'just <appropriate-recipe>'
  return applySuggestionModifiers(command, rule)
}

export function getCommandVariants(command: string): string[] {
  const normalized = command.trim()
  const variants = normalized ? [normalized] : []

  if (normalized.startsWith('just ')) {
    const logicalSegments = normalized
      .split(LOGICAL_OPERATOR_REGEX)
      .map((s) => s.trim())
      .filter(Boolean)
    for (const segment of logicalSegments) {
      const beforePipe = segment.split(/\s*\|\s*/)[0]?.trim()
      if (beforePipe && beforePipe !== segment && !variants.includes(beforePipe))
        variants.push(beforePipe)
      if (segment !== normalized && !variants.includes(segment)) variants.push(segment)
    }
  } else {
    for (const segment of splitTopLevelCommands(normalized)) {
      if (!variants.includes(segment)) variants.push(segment)
    }
  }

  return variants
}

export function getCommandCategory(command: string): CommandCategory {
  return findMatchingRule(command)?.category ?? 'unknown'
}

function loadRedirectConfig(): MCPRedirectConfig | undefined {
  const repoRoot = process.env.CLAUDE_PROJECT_DIR ?? process.cwd()
  return readConfig(repoRoot)?.mcp
}

export function createBlockedResult(
  command: string,
  rule: CommandRule,
  options: RedirectOptions = {},
): BlockedCommandResult {
  const suggestion = applySuggestionModifiers(command, rule)
  return {
    validator: VALIDATOR_NAME,
    passed: false,
    message: buildRedirectMessage({
      category: rule.category,
      command,
      fallbackHint: suggestion,
      ...(options.mcpReady !== undefined ? { mcpReady: options.mcpReady } : {}),
      mcp: options.mcp ?? loadRedirectConfig(),
    }),
    command,
    suggestion,
    category: rule.category,
    docsRef: DOCS_REF,
    matchedPattern: rule.pattern.source,
  }
}

export function createAuditResult(
  command: string,
  rule: CommandRule,
  options: RedirectOptions = {},
): BlockedCommandResult {
  const suggestion = applySuggestionModifiers(command, rule)
  return {
    validator: VALIDATOR_NAME,
    passed: true,
    message: `[AUDIT] Would block:\n${buildRedirectMessage({
      category: rule.category,
      command,
      fallbackHint: suggestion,
      ...(options.mcpReady !== undefined ? { mcpReady: options.mcpReady } : {}),
      mcp: options.mcp ?? loadRedirectConfig(),
    })}`,
    command,
    suggestion,
    category: rule.category,
    docsRef: DOCS_REF,
    matchedPattern: rule.pattern.source,
  }
}

export function validateForbiddenCommands(
  input: ToolInput,
): ValidationResult | BlockedCommandResult {
  if (process.env[SKIP_ENV_VAR] === '1') return createSkipResult(VALIDATOR_NAME)
  if (!isBashInput(input)) return createSkipResult(VALIDATOR_NAME, 'Not a Bash command')

  const command = getCommand(input)
  if (!command) return createSkipResult(VALIDATOR_NAME, 'No command found')

  const rule = findMatchingRule(command)
  if (rule) {
    if (process.env[AUDIT_MODE_ENV] === '1') return createAuditResult(command, rule)
    return createBlockedResult(command, rule)
  }

  return { validator: VALIDATOR_NAME, passed: true }
}
