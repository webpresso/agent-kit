export type GuidanceType = 'test' | 'lint' | 'typecheck' | 'qa' | 'format' | 'e2e'

export type RouteAction =
  | { action: 'deny'; tool: string; guidance: string }
  | { action: 'sandbox'; guidance: string }
  | { action: 'passthrough' }

export interface RouteDecision {
  action: RouteAction
}

interface RoutingRule {
  prefixes: string[]
  guidanceType: GuidanceType
  guidance: string
  tool: string
}

const ROUTING_RULES: RoutingRule[] = [
  {
    prefixes: ['vp exec markdownlint-cli2', 'markdownlint-cli2', 'pnpm exec markdownlint-cli2'],
    guidanceType: 'qa',
    guidance:
      'Use wp_qa MCP tool instead — QA is the blessed MCP quality entrypoint; avoid ad hoc markdown-only lint endpoints',
    tool: 'wp_qa',
  },
  {
    prefixes: [
      'vp exec vitest',
      'vitest',
      'vp run test',
      'vp test',
      'pnpm test',
      'pnpm run test',
      'pnpm exec vitest',
      'just test',
    ],
    guidanceType: 'test',
    guidance: 'Use wp_test MCP tool instead — returns {passed, summary} not raw logs',
    tool: 'wp_test',
  },
  {
    prefixes: [
      'vp exec oxlint',
      'oxlint',
      'pnpm exec oxlint',
      'vp run lint',
      'vp lint',
      'pnpm lint',
      'pnpm run lint',
      'just lint',
    ],
    guidanceType: 'lint',
    guidance: 'Use wp_lint MCP tool instead — returns {passed, violations[]}',
    tool: 'wp_lint',
  },
  {
    prefixes: ['vp exec tsc', 'tsc', 'pnpm exec tsc', 'vp run typecheck', 'pnpm run typecheck'],
    guidanceType: 'typecheck',
    guidance: 'Use wp_typecheck MCP tool instead — returns {passed, errors[]}',
    tool: 'wp_typecheck',
  },
  {
    prefixes: ['vp exec prettier', 'prettier', 'pnpm exec prettier'],
    guidanceType: 'format',
    guidance: 'Use wp_format MCP tool instead — routes through the repo formatter, not Prettier',
    tool: 'wp_format',
  },
  {
    prefixes: [
      'vp run e2e',
      'vp e2e',
      'pnpm run e2e',
      'pnpm e2e',
      'pnpm exec playwright',
      'pnpm exec playwright test',
    ],
    guidanceType: 'e2e',
    guidance: 'Use wp_e2e MCP tool instead — returns {passed, summary} for e2e workflow execution',
    tool: 'wp_e2e',
  },
  {
    prefixes: [
      'just qa',
      'pnpm run qa',
      'vp run qa',
      'pnpm qa',
      'vp run lint-md',
      'pnpm run lint-md',
      'just lint-md',
      'pnpm exec markdownlint-cli2',
    ],
    guidanceType: 'qa',
    guidance:
      'Use wp_qa MCP tool instead — QA is the blessed MCP quality entrypoint; avoid ad hoc markdown-only lint endpoints',
    tool: 'wp_qa',
  },
]

const PASSTHROUGH_PREFIXES = ['wp audit']

const SAFE_PASSTHROUGH_PREFIXES = [
  'git status',
  'git add',
  'git commit',
  'git push',
  'ls',
  'mkdir',
  'mv',
  'rm ',
  'echo',
]

const SANDBOX_PREFIXES: Array<{ prefix: string; guidance: string }> = [
  { prefix: 'grep', guidance: 'Use ctx_batch_execute for large outputs' },
  { prefix: 'find', guidance: 'Use ctx_batch_execute for large outputs' },
  { prefix: 'cat', guidance: 'Use ctx_execute or ctx_batch_execute for large outputs' },
  { prefix: 'tail', guidance: 'Use ctx_execute or ctx_batch_execute for large outputs' },
  { prefix: 'head', guidance: 'Use ctx_execute or ctx_batch_execute for large outputs' },
  { prefix: 'curl', guidance: 'Use ctx_execute or ctx_fetch_and_index' },
  { prefix: 'wget', guidance: 'Use ctx_execute or ctx_fetch_and_index' },
  { prefix: 'git log', guidance: 'Use ctx_execute_file or ctx_execute' },
  { prefix: 'git diff', guidance: 'Use ctx_execute_file or ctx_execute' },
  { prefix: 'git show', guidance: 'Use ctx_execute_file or ctx_execute' },
  { prefix: 'vp run build', guidance: 'Use ctx_execute for build output' },
]

const VP_SCOPE_FLAG_PREFIX =
  /(?:(?:--filter|-F|--dir|-C)(?:=|\s+)(?:"[^"]+"|'[^']+'|\S+)|(?:--workspace-root|-w)(?=\s|$))/u
const PNPM_SCOPE_FLAG_PREFIX =
  /(?:(?:--filter|-F|--dir|-C)(?:=|\s+)(?:"[^"]+"|'[^']+'|\S+)|--workspace-root|-w|--recursive|-r|--workspace)(?=\s|$)/u

const VP_COMMAND_PREFIX = /^vp\s+(?<rest>.+)$/u
const PNPM_COMMAND_PREFIX = /^pnpm\s+(?<rest>.+)$/u

export function normalizeCommandForRouting(command: string): string {
  const trimmed = command.trim()
  let match = VP_COMMAND_PREFIX.exec(trimmed)
  let next = trimmed
  let prefix = 'vp'

  if (match?.groups?.rest) {
    next = match.groups.rest.trim()
  } else {
    match = PNPM_COMMAND_PREFIX.exec(trimmed)
    if (match?.groups?.rest) {
      next = match.groups.rest.trim()
      prefix = 'pnpm'
    } else {
      return trimmed
    }
  }

  const scopePrefix = prefix === 'pnpm' ? PNPM_SCOPE_FLAG_PREFIX : VP_SCOPE_FLAG_PREFIX
  while (scopePrefix.test(next)) {
    const updated = next.replace(scopePrefix, '').trim()
    if (updated === next) break
    next = updated
  }

  return `${prefix} ${next.replace(/\s+/g, ' ').trim()}`
}

function matchesPrefix(command: string, prefix: string): boolean {
  return command === prefix || command.startsWith(prefix + ' ')
}

function parseStringLiterals(input: string): string[] {
  const values: string[] = []
  const regex = /(['"`])((?:\\.|(?!\1).)*)\1/gsu
  for (const match of input.matchAll(regex)) {
    const value = match[2]
    if (value) values.push(value.replace(/\\(['"`\\])/gu, '$1'))
  }
  return values
}

function extractProcessCallCommands(code: string): string[] {
  const commands: string[] = []
  const execString = /\bexecSync\(\s*(['"`])((?:\\.|(?!\1).)*)\1/gsu
  for (const match of code.matchAll(execString)) {
    const command = match[2]?.replace(/\\(['"`\\])/gu, '$1').trim()
    if (command) commands.push(command)
  }

  const argvCall =
    /\b(?:execFileSync|spawnSync)\(\s*(['"`])(?<bin>vp|pnpm|vitest|tsc|oxlint|prettier|markdownlint-cli2)\1\s*,\s*\[(?<args>[\s\S]*?)\]/gsu
  for (const match of code.matchAll(argvCall)) {
    const bin = match.groups?.bin
    const args = match.groups?.args
    if (!bin || !args) continue
    commands.push([bin, ...parseStringLiterals(args)].join(' ').trim())
  }

  return commands
}

function extractInlineCommands(code: string): string[] {
  const commands: string[] = []
  const regex = /(?:^|[;&|]\s*)(vp|pnpm|vitest|tsc|oxlint|prettier|markdownlint-cli2)\b([^\n;]*)/gmu
  for (const match of code.matchAll(regex)) {
    const command = `${match[1] ?? ''}${match[2] ?? ''}`.trim()
    if (command) commands.push(command)
  }
  return commands
}

function isContextModeTool(toolName: unknown): boolean {
  const names = new Set([
    'mcp__context_mode__ctx_execute',
    'mcp__context_mode__ctx_batch_execute',
    'mcp__context_mode__.ctx_execute',
    'mcp__context_mode__.ctx_batch_execute',
    'context-mode.ctx_execute',
    'context-mode.ctx_batch_execute',
    'ctx_execute',
    'ctx_batch_execute',
  ])
  return typeof toolName === 'string' && names.has(toolName)
}

export function extractRoutableCommandsFromToolInput(input: {
  tool_name?: string
  tool_input?: Record<string, unknown>
}): string[] {
  if (!isContextModeTool(input.tool_name)) return []
  const toolInput = input.tool_input
  if (!toolInput || typeof toolInput !== 'object') return []

  const commands: string[] = []
  const directCommands = toolInput.commands
  if (Array.isArray(directCommands)) {
    for (const entry of directCommands) {
      if (!entry || typeof entry !== 'object') continue
      const command = (entry as Record<string, unknown>).command
      if (typeof command === 'string') commands.push(command)
    }
  }

  const code = toolInput.code
  if (typeof code === 'string') {
    commands.push(...extractProcessCallCommands(code))
    commands.push(...extractInlineCommands(code))
  }

  return [...new Set(commands)]
}

export function routeCommand(command: string, _sessionId?: string): RouteDecision | null {
  const trimmed = normalizeCommandForRouting(command)
  if (!trimmed) return null

  // Explicit passthroughs (audits, safe git/nav commands)
  for (const prefix of PASSTHROUGH_PREFIXES) {
    if (matchesPrefix(trimmed, prefix)) return { action: { action: 'passthrough' } }
  }

  for (const prefix of SAFE_PASSTHROUGH_PREFIXES) {
    if (matchesPrefix(trimmed, prefix)) return { action: { action: 'passthrough' } }
  }

  // Dev-workflow deny rules fire first (priority)
  for (const rule of ROUTING_RULES) {
    for (const prefix of rule.prefixes) {
      if (matchesPrefix(trimmed, prefix)) {
        return {
          action: { action: 'deny', tool: rule.tool, guidance: rule.guidance },
        }
      }
    }
  }

  // Sandbox rules (data-heavy commands → context-mode)
  for (const { prefix, guidance } of SANDBOX_PREFIXES) {
    if (matchesPrefix(trimmed, prefix)) {
      return { action: { action: 'sandbox', guidance } }
    }
  }

  // Unknown — null (let callers decide)
  return null
}
