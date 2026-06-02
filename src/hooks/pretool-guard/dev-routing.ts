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

interface SourceEntrypointRule {
  scriptSuffixes: string[]
  tool: string
  guidance: string
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
      'wrangler tail',
      'with-secrets -- wrangler tail',
      'with-secrets wrangler tail',
      'vp exec wrangler tail',
      'pnpm exec wrangler tail',
      'doppler run -- wrangler tail',
      'doppler run wrangler tail',
      'infisical run -- wrangler tail',
    ],
    guidanceType: 'qa',
    guidance:
      'Use wp_worker_tail MCP tool instead — Worker tail output is bounded, redacted, and routed through the canonical `with-secrets -- wrangler tail ...` secret-gate contract',
    tool: 'wp_worker_tail',
  },
  {
    prefixes: [
      'act',
      'with-secrets -- act',
      'with-secrets act',
      'vp exec act',
      'pnpm exec act',
      'doppler run -- act',
      'infisical run -- act',
    ],
    guidanceType: 'qa',
    guidance:
      'Use wp_ci_act MCP tool instead — CI act execution is bounded and routed through the canonical `with-secrets -- act ...` secret-gate contract',
    tool: 'wp_ci_act',
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

const SOURCE_ENTRYPOINT_RULES: SourceEntrypointRule[] = [
  {
    scriptSuffixes: ['src/cli/run-e2e.ts'],
    tool: 'wp_e2e',
    guidance:
      'Use wp_e2e MCP tool instead — repo E2E entrypoints should not be run through package-manager/runtime source execution',
  },
  {
    scriptSuffixes: ['apps/scripts/src/ci/act.ts'],
    tool: 'wp_ci_act',
    guidance:
      'Use wp_ci_act MCP tool instead — raw source execution bypasses MCP output bounds and the canonical `with-secrets -- act ...` secret-gate contract',
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
const COREPACK_PACKAGE_MANAGER_PREFIX =
  /^corepack\s+(?<manager>pnpm|pnpx|yarn|yarnpkg|npm|npx)(?:@[^\s]+)?(?<rest>\s+[\s\S]+)?$/u
const ENV_ASSIGNMENT_VALUE_PATTERN = String.raw`(?:"(?:\\.|[^"\\])*"|'(?:\\.|[^'\\])*'|\S*)`
const ENV_ASSIGNMENT_PREFIX_PATTERN = String.raw`(?:[A-Za-z_][A-Za-z0-9_]*=${ENV_ASSIGNMENT_VALUE_PATTERN}\s+)+`
const ENV_ASSIGNMENT_PREFIX = new RegExp(`^(?:${ENV_ASSIGNMENT_PREFIX_PATTERN})`, 'u')
const ENV_COMMAND_ASSIGNMENT_PREFIX = new RegExp(
  `^env\\s+(?:${ENV_ASSIGNMENT_PREFIX_PATTERN})`,
  'u',
)
const PACKAGE_MANAGER_PREFIXES = new Set(['vp', 'pnpm', 'just'])
const TOOL_SHIM_EXTENSION = /\.(?:cmd|ps1|bat)$/iu
const SOURCE_RUNTIME_BINS = new Set(['tsx', 'ts-node', 'node', 'bun'])
const PACKAGE_MANAGER_BINS = new Set([
  'vp',
  'pnpm',
  'pnpx',
  'npm',
  'npx',
  'yarn',
  'yarnpkg',
  'bun',
  'bunx',
])
const PACKAGE_MANAGER_EXEC_SUBCOMMANDS = new Set(['exec', 'dlx', 'x'])
const PACKAGE_MANAGER_RUN_SUBCOMMANDS = new Set(['run', 'run-script'])
const PACKAGE_MANAGER_OPTION_VALUE_FLAGS = new Set([
  '--dir',
  '-C',
  '--filter',
  '-F',
  '--workspace',
  '-w',
  '--workspace-root',
  '--cwd',
  '--package',
  '--cache',
  '--config',
])
const PACKAGE_MANAGER_OPTION_VALUE_PREFIXES = [
  '--dir=',
  '--filter=',
  '-F=',
  '--workspace=',
  '--cwd=',
  '--package=',
  '--cache=',
  '--config=',
]
const PACKAGE_MANAGER_FLAG_ONLY = new Set([
  '--recursive',
  '-r',
  '--workspace-root',
  '-w',
  '--parallel',
  '--silent',
  '--if-present',
  '--ignore-scripts',
])
const TOOL_PROXY_BINS = new Set(['corepack'])
const SECRET_WRAPPER_BINS = new Set(['with-secrets', 'doppler', 'infisical'])
const PNPM_BUILTIN_SUBCOMMANDS = new Set([
  'add',
  'approve-builds',
  'audit',
  'build',
  'config',
  'dedupe',
  'deploy',
  'env',
  'fetch',
  'help',
  'import',
  'init',
  'install',
  'link',
  'list',
  'outdated',
  'pack',
  'patch',
  'publish',
  'rebuild',
  'remove',
  'root',
  'setup',
  'store',
  'unlink',
  'update',
  'why',
])
const YARN_BUILTIN_SUBCOMMANDS = new Set([
  'add',
  'bin',
  'cache',
  'config',
  'constraints',
  'dedupe',
  'explain',
  'help',
  'init',
  'install',
  'link',
  'node',
  'npm',
  'pack',
  'patch',
  'plugin',
  'rebuild',
  'remove',
  'set',
  'unplug',
  'up',
  'why',
  'workspace',
  'workspaces',
])
const BUN_BUILTIN_SUBCOMMANDS = new Set([
  'add',
  'build',
  'create',
  'fig',
  'help',
  'init',
  'install',
  'link',
  'outdated',
  'pm',
  'publish',
  'remove',
  'repl',
  'run',
  'test',
  'update',
  'upgrade',
  'x',
])

function stripCorepackPackageManagerProxy(command: string): string {
  const match = COREPACK_PACKAGE_MANAGER_PREFIX.exec(command)
  if (!match?.groups?.manager) return command

  const rest = match.groups.rest ?? ''
  if (match.groups.manager === 'pnpx') return `pnpm exec${rest}`.trim()
  if (match.groups.manager === 'npx') return `npm exec${rest}`.trim()
  return `${match.groups.manager}${rest}`.trim()
}

function stripLeadingEnvironmentAssignments(command: string): string {
  let next = command.trim()
  while (next) {
    const updated = next
      .replace(ENV_COMMAND_ASSIGNMENT_PREFIX, '')
      .replace(ENV_ASSIGNMENT_PREFIX, '')
      .trim()
    if (updated === next) return next
    next = updated
  }
  return next
}

export function normalizeCommandForRouting(command: string): string {
  const trimmed = stripCorepackPackageManagerProxy(stripLeadingEnvironmentAssignments(command))
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
      return normalizeDirectToolPath(trimmed)
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

function normalizeDirectToolPath(command: string): string {
  const match = /^(?<bin>\S+)(?<rest>\s+[\s\S]*)?$/u.exec(command)
  const bin = match?.groups?.bin
  if (!bin) return command

  const baseName = directToolBasename(bin)
  if (!baseName || !getDirectToolBins().has(baseName)) return command

  return `${baseName}${match.groups?.rest ?? ''}`.replace(/\s+/g, ' ').trim()
}

function directToolBasename(bin: string): string | null {
  const normalizedBin = bin.replace(/\\/gu, '/')
  const rawBaseName = normalizedBin.slice(normalizedBin.lastIndexOf('/') + 1)
  const baseName = rawBaseName.replace(TOOL_SHIM_EXTENSION, '')
  return baseName || null
}

function getDirectToolBins(): Set<string> {
  const bins = new Set<string>()

  for (const { prefixes } of ROUTING_RULES) {
    for (const bin of getRuleDirectToolBins(prefixes)) bins.add(bin)
  }

  return bins
}

function getRuleDirectToolBins(prefixes: string[]): Set<string> {
  const bins = new Set<string>()

  for (const prefix of prefixes) {
    const tokens = prefix.split(/\s+/u)
    const [command, subcommand, bin] = tokens

    if (command === 'vp' || command === 'pnpm') {
      if (subcommand === 'exec' && bin) bins.add(bin)
      continue
    }

    if (command && !PACKAGE_MANAGER_PREFIXES.has(command) && !SECRET_WRAPPER_BINS.has(command)) {
      bins.add(command)
    }
  }

  return bins
}

function matchesDirectToolCommand(command: string, rule: RoutingRule): boolean {
  const firstToken = command.split(/\s+/u)[0]
  return firstToken ? getRuleDirectToolBins(rule.prefixes).has(firstToken) : false
}

function tokenizeCommand(command: string): string[] {
  const tokens: string[] = []
  const regex = /"((?:\\.|[^"\\])*)"|'((?:\\.|[^'\\])*)'|(\S+)/gu
  for (const match of command.matchAll(regex)) {
    const token = match[1] ?? match[2] ?? match[3]
    if (token) tokens.push(token.replace(/\\(['"\\])/gu, '$1'))
  }
  return tokens
}

function unquoteToken(token: string): string {
  return token.replace(/^(['"])([\s\S]*)\1$/u, '$2')
}

function normalizeScriptToken(token: string): string {
  return unquoteToken(token).replace(/\\/gu, '/').replace(/^\.\//u, '')
}

function normalizedPackageManagerBin(token: string): string | null {
  const baseName = directToolBasename(token)
  if (!baseName) return null

  const manager = baseName.replace(/@[^@/]+$/u, '')
  return PACKAGE_MANAGER_BINS.has(manager) ? manager : null
}

function skipPackageManagerOptions(tokens: string[], startIndex: number): number {
  let index = startIndex
  while (index < tokens.length) {
    const token = tokens[index]
    if (!token) break
    if (token === '--') return index + 1
    if (PACKAGE_MANAGER_OPTION_VALUE_PREFIXES.some((prefix) => token.startsWith(prefix))) {
      index += 1
      continue
    }
    if (PACKAGE_MANAGER_OPTION_VALUE_FLAGS.has(token)) {
      index += 2
      continue
    }
    if (PACKAGE_MANAGER_FLAG_ONLY.has(token)) {
      index += 1
      continue
    }
    break
  }
  return index
}

interface PackageManagerInvocation {
  bin: string
  args: string[]
}

function packageManagerInvocation(command: string): PackageManagerInvocation | null {
  const tokens = tokenizeCommand(command)
  const manager = tokens[0] ? normalizedPackageManagerBin(tokens[0]) : null
  if (!manager) return null

  if (manager === 'pnpx' || manager === 'npx' || manager === 'bunx') {
    return tokens[1] ? { bin: tokens[1], args: tokens.slice(2) } : null
  }

  let index = skipPackageManagerOptions(tokens, 1)
  let subcommand = tokens[index]
  if (!subcommand) return null

  if (manager === 'npm' && subcommand === 'x') subcommand = 'exec'

  if (PACKAGE_MANAGER_EXEC_SUBCOMMANDS.has(subcommand)) {
    index = skipPackageManagerOptions(tokens, index + 1)
    if (tokens[index] === '--') index += 1
    const bin = tokens[index]
    return bin ? { bin, args: tokens.slice(index + 1) } : null
  }

  if (manager === 'vp' && subcommand === 'node') {
    return tokens[index + 1] ? { bin: 'node', args: tokens.slice(index + 1) } : null
  }

  if (PACKAGE_MANAGER_RUN_SUBCOMMANDS.has(subcommand)) {
    return tokens[index + 1] ? { bin: subcommand, args: tokens.slice(index + 1) } : null
  }

  if (manager === 'pnpm' && !PNPM_BUILTIN_SUBCOMMANDS.has(subcommand)) {
    return { bin: subcommand, args: tokens.slice(index + 1) }
  }

  if ((manager === 'yarn' || manager === 'yarnpkg') && !YARN_BUILTIN_SUBCOMMANDS.has(subcommand)) {
    return { bin: subcommand, args: tokens.slice(index + 1) }
  }

  if (manager === 'bun' && !BUN_BUILTIN_SUBCOMMANDS.has(subcommand)) {
    return { bin: subcommand, args: tokens.slice(index + 1) }
  }

  return null
}

function matchesPackageManagerDirectToolCommand(command: string, rule: RoutingRule): boolean {
  const invocation = packageManagerInvocation(command)
  if (!invocation) return false

  const bin = directToolBasename(invocation.bin)
  return bin ? getRuleDirectToolBins(rule.prefixes).has(bin) : false
}

function sourceEntrypointScript(command: string): string | null {
  const tokens = tokenizeCommand(command)
  if (tokens.length < 2) return null

  const firstToken = tokens[0]
  if (!firstToken) return null

  const packageInvocation = packageManagerInvocation(command)
  if (packageInvocation) {
    const bin = directToolBasename(packageInvocation.bin)
    if (bin && SOURCE_RUNTIME_BINS.has(bin)) {
      return packageInvocation.args[0] ? normalizeScriptToken(packageInvocation.args[0]) : null
    }
  }

  if (
    (firstToken === 'vp' || firstToken === 'pnpm') &&
    tokens[1] === 'exec' &&
    tokens[2] &&
    SOURCE_RUNTIME_BINS.has(tokens[2])
  ) {
    return tokens[3] ? normalizeScriptToken(tokens[3]) : null
  }

  if (SOURCE_RUNTIME_BINS.has(firstToken)) {
    const scriptIndex = firstToken === 'bun' && tokens[1] === 'run' ? 2 : 1
    return tokens[scriptIndex] ? normalizeScriptToken(tokens[scriptIndex]) : null
  }

  return null
}

function matchSourceEntrypointCommand(command: string): SourceEntrypointRule | null {
  const script = sourceEntrypointScript(command)
  if (!script) return null

  for (const rule of SOURCE_ENTRYPOINT_RULES) {
    if (rule.scriptSuffixes.some((suffix) => script === suffix || script.endsWith(`/${suffix}`))) {
      return rule
    }
  }

  return null
}

function matchesPrefix(command: string, prefix: string): boolean {
  return command === prefix || command.startsWith(prefix + ' ')
}

function escapedRegexToken(value: string): string {
  return value.replace(/[.*+?^${}()|[\]\\]/gu, '\\$&')
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
    /\b(?:execFileSync|spawnSync)\(\s*(['"`])(?<bin>[^\s'"`]+)\1\s*,\s*\[(?<args>[\s\S]*?)\]/gsu
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
  const starters = new Set<string>([
    ...PACKAGE_MANAGER_BINS,
    ...SOURCE_RUNTIME_BINS,
    ...TOOL_PROXY_BINS,
    ...SECRET_WRAPPER_BINS,
  ])
  for (const rule of ROUTING_RULES) {
    for (const prefix of rule.prefixes) {
      const starter = tokenizeCommand(prefix)[0]
      if (starter) starters.add(starter)
    }
  }

  const starterPattern = [...starters]
    .sort((a, b) => b.length - a.length)
    .map(escapedRegexToken)
    .join('|')
  const normalizedCode = code.replace(/\\\r?\n\s*/gu, ' ').replace(/^\s*#.*$/gmu, '')
  const envAssignmentPattern = String.raw`(?:(?:env\s+)?${ENV_ASSIGNMENT_PREFIX_PATTERN})?`
  const regex = new RegExp(
    `(?:^|[;&|]\\s*)(${envAssignmentPattern}(?:${starterPattern})\\b[^\\n;]*)`,
    'gmu',
  )
  for (const match of normalizedCode.matchAll(regex)) {
    const command = `${match[1] ?? ''}`.replace(/\s+/gu, ' ').trim()
    if (command) commands.push(command)
  }
  return commands
}

function isContextModeTool(toolName: unknown): boolean {
  if (typeof toolName !== 'string') return false
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
  if (names.has(toolName)) return true

  // Codex/App/plugin MCP tool names are host-generated and may include plugin
  // prefixes, e.g. `mcp__plugin_context-mode_context-mode__ctx_execute`.
  // Match the stable operation suffix instead of enumerating every provider.
  return /(?:^|[._-]|__)ctx_(?:batch_)?execute$/u.test(toolName)
}

export function extractRoutableCommandsFromToolInput(input: {
  tool_name?: string
  toolName?: string
  tool?: string
  name?: string
  tool_input?: Record<string, unknown>
  toolInput?: Record<string, unknown>
  input?: Record<string, unknown>
  arguments?: Record<string, unknown>
}): string[] {
  const toolName = input.tool_name ?? input.toolName ?? input.tool ?? input.name
  if (!isContextModeTool(toolName)) return []
  const toolInput = input.tool_input ?? input.toolInput ?? input.input ?? input.arguments
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

  const sourceEntrypointRule = matchSourceEntrypointCommand(trimmed)
  if (sourceEntrypointRule) {
    return {
      action: {
        action: 'deny',
        tool: sourceEntrypointRule.tool,
        guidance: sourceEntrypointRule.guidance,
      },
    }
  }

  // Dev-workflow deny rules fire first (priority)
  for (const rule of ROUTING_RULES) {
    for (const prefix of rule.prefixes) {
      if (matchesPrefix(trimmed, prefix) || matchesDirectToolCommand(trimmed, rule)) {
        return {
          action: { action: 'deny', tool: rule.tool, guidance: rule.guidance },
        }
      }
    }
    if (matchesPackageManagerDirectToolCommand(trimmed, rule)) {
      return {
        action: { action: 'deny', tool: rule.tool, guidance: rule.guidance },
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
