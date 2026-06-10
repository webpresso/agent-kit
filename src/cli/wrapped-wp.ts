import { execFileSync } from 'node:child_process'

const TOOL_SHIM_EXTENSION = /\.(?:cmd|ps1|bat)$/iu
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
const COREPACK_PACKAGE_MANAGER_PREFIX =
  /^corepack\s+(?<manager>pnpm|pnpx|yarn|yarnpkg|npm|npx)(?:@[^\s]+)?(?<rest>\s+[\s\S]+)?$/u
const ENV_ASSIGNMENT_VALUE_PATTERN = String.raw`(?:"(?:\\.|[^"\\])*"|'(?:\\.|[^'\\])*'|\S*)`
const ENV_ASSIGNMENT_PREFIX_PATTERN = String.raw`(?:[A-Za-z_][A-Za-z0-9_]*=${ENV_ASSIGNMENT_VALUE_PATTERN}\s+)+`
const ENV_ASSIGNMENT_PREFIX = new RegExp(`^(?:${ENV_ASSIGNMENT_PREFIX_PATTERN})`, 'u')
const ENV_COMMAND_ASSIGNMENT_PREFIX = new RegExp(
  `^env\\s+(?:${ENV_ASSIGNMENT_PREFIX_PATTERN})`,
  'u',
)
const WRAPPED_WP_MANAGER_LIST = '`bun run wp`, `pnpm run wp`, `npm run wp`, `yarn wp`, or `vp run wp`'

export interface WrappedWpInvocation {
  readonly manager: string
  readonly wpArgs: string[]
}

export interface WrappedWpGuidance {
  readonly tool: string
  readonly guidance: string
}

export interface RuntimeWrappedWpDetectionOptions {
  readonly argv?: string[]
  readonly env?: NodeJS.ProcessEnv
  readonly platform?: NodeJS.Platform
  readonly ppid?: number
  readonly maxAncestorDepth?: number
  readonly readProcessInfo?: (pid: number) => { ppid: number; command: string } | null
}

function normalizeWpArgs(args: string[]): string[] {
  return args[0] === '--' ? args.slice(1) : args
}

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

export function tokenizeCommand(command: string): string[] {
  const tokens: string[] = []
  const regex = /"((?:\\.|[^"\\])*)"|'((?:\\.|[^'\\])*)'|(\S+)/gu
  for (const match of command.matchAll(regex)) {
    const token = match[1] ?? match[2] ?? match[3]
    if (token) tokens.push(token.replace(/\\(['"\\])/gu, '$1'))
  }
  return tokens
}

function directToolBasename(bin: string): string | null {
  const normalizedBin = bin.replace(/\\/gu, '/')
  const rawBaseName = normalizedBin.slice(normalizedBin.lastIndexOf('/') + 1)
  const baseName = rawBaseName.replace(TOOL_SHIM_EXTENSION, '')
  return baseName || null
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

function isWrappedWpShorthand(manager: string, subcommand: string): boolean {
  if (manager === 'pnpm') return subcommand === 'wp' && !PNPM_BUILTIN_SUBCOMMANDS.has(subcommand)
  if (manager === 'yarn' || manager === 'yarnpkg') {
    return subcommand === 'wp' && !YARN_BUILTIN_SUBCOMMANDS.has(subcommand)
  }
  if (manager === 'bun') return subcommand === 'wp' && !BUN_BUILTIN_SUBCOMMANDS.has(subcommand)
  if (manager === 'vp') return subcommand === 'wp'
  return false
}

export function detectWrappedWpCommand(command: string): WrappedWpInvocation | null {
  const trimmed = stripCorepackPackageManagerProxy(stripLeadingEnvironmentAssignments(command))
  const tokens = tokenizeCommand(trimmed)
  const manager = tokens[0] ? normalizedPackageManagerBin(tokens[0]) : null
  if (!manager) return null

  let index = skipPackageManagerOptions(tokens, 1)
  let subcommand = tokens[index]
  if (!subcommand) return null

  if (manager === 'npm' && subcommand === 'x') subcommand = 'exec'

  if (PACKAGE_MANAGER_RUN_SUBCOMMANDS.has(subcommand)) {
    index = skipPackageManagerOptions(tokens, index + 1)
    if (tokens[index] === '--') index += 1
    if (tokens[index] !== 'wp') return null
    return { manager, wpArgs: normalizeWpArgs(tokens.slice(index + 1)) }
  }

  if (!isWrappedWpShorthand(manager, subcommand)) return null
  return { manager, wpArgs: normalizeWpArgs(tokens.slice(index + 1)) }
}

function detectPackageManagerFromEnv(env: NodeJS.ProcessEnv): string | null {
  if (env.VP_COMMAND === 'run' || env.VP_CLI_BIN) return 'vp'

  const execPath = env.npm_execpath ?? env.npm_config_user_agent ?? ''
  const normalized = execPath.toLowerCase()
  if (normalized.includes('pnpm')) return 'pnpm'
  if (normalized.includes('bun')) return 'bun'
  if (normalized.includes('yarn')) return 'yarn'
  if (normalized.includes('npm')) return 'npm'
  return null
}

function defaultReadProcessInfo(pid: number): { ppid: number; command: string } | null {
  try {
    const output = execFileSync('ps', ['-o', 'ppid=', '-o', 'command=', '-p', String(pid)], {
      encoding: 'utf8',
      stdio: ['ignore', 'pipe', 'ignore'],
    }).trim()
    if (!output) return null
    const match = /^\s*(?<ppid>\d+)\s+(?<command>.+)$/u.exec(output)
    if (!match?.groups?.ppid || !match.groups.command) return null
    return { ppid: Number(match.groups.ppid), command: match.groups.command.trim() }
  } catch {
    return null
  }
}

export function detectWrappedWpRuntimeInvocation(
  options: RuntimeWrappedWpDetectionOptions = {},
): WrappedWpInvocation | null {
  const env = options.env ?? process.env
  const argv = options.argv ?? process.argv

  if (env.npm_lifecycle_event?.trim() === 'wp') {
    return {
      manager: detectPackageManagerFromEnv(env) ?? 'package-manager',
      wpArgs: normalizeWpArgs(argv.slice(2)),
    }
  }

  if ((options.platform ?? process.platform) === 'win32') return null

  const readProcessInfo = options.readProcessInfo ?? defaultReadProcessInfo
  const maxDepth = options.maxAncestorDepth ?? 4
  const seen = new Set<number>()
  let pid = options.ppid ?? process.ppid

  for (let depth = 0; depth < maxDepth && pid > 1 && !seen.has(pid); depth += 1) {
    seen.add(pid)
    const info = readProcessInfo(pid)
    if (!info) break
    const wrapped = detectWrappedWpCommand(info.command)
    if (wrapped) return { manager: wrapped.manager, wpArgs: normalizeWpArgs(argv.slice(2)) }
    pid = info.ppid
  }

  return null
}

function firstWpVerb(wpArgs: readonly string[]): string | null {
  for (const arg of wpArgs) {
    if (!arg.startsWith('-')) return arg
  }
  return null
}

function wrappedWpFallbackCommand(wpArgs: readonly string[]): string {
  return wpArgs.length > 0 ? `wp ${wpArgs.join(' ')}` : 'wp'
}

export function wrappedWpGuidanceForArgs(wpArgs: readonly string[]): WrappedWpGuidance {
  const verb = firstWpVerb(wpArgs)
  const fallbackCommand = wrappedWpFallbackCommand(wpArgs)
  const tool =
    verb === 'test'
      ? 'wp_test'
      : verb === 'lint'
        ? 'wp_lint'
        : verb === 'typecheck'
          ? 'wp_typecheck'
          : verb === 'qa'
            ? 'wp_qa'
            : verb === 'format'
              ? 'wp_format'
              : verb === 'e2e'
                ? 'wp_e2e'
                : verb === 'audit'
                  ? 'wp_audit'
                  : 'wp'

  const guidance =
    tool === 'wp'
      ? `Use the matching wp_* MCP tool when available; otherwise run direct \`${fallbackCommand}\`. Do not use package-manager wrappers such as ${WRAPPED_WP_MANAGER_LIST}.`
      : `Use ${tool} MCP tool when available; otherwise run direct \`${fallbackCommand}\`. Do not use package-manager wrappers such as ${WRAPPED_WP_MANAGER_LIST}.`

  return { tool, guidance }
}

export function formatWrappedWpInvocationError(
  wrapped: WrappedWpInvocation,
  argv: readonly string[],
): string {
  const { tool, guidance } = wrappedWpGuidanceForArgs(argv.slice(2))
  const manager = wrapped.manager === 'package-manager' ? 'package-manager' : wrapped.manager
  return [
    `webpresso package-manager wrapper invocation is forbidden (${manager}).`,
    guidance,
    tool === 'wp'
      ? 'Use direct `wp` as the only public CLI fallback.'
      : 'webpresso is MCP-first; direct `wp` is the only public CLI fallback.',
  ].join(' ')
}
