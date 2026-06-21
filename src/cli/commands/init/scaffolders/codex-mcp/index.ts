/**
 * `codex-mcp` scaffolder preset.
 *
 * Codex and OMX both resolve persistent MCP servers from Codex's config home
 * (`$CODEX_HOME/config.toml`, falling back to `~/.codex/config.toml`).  Keep
 * the patch tiny and deterministic: per-server upserts, no TOML parser
 * dependency, no edits to unrelated user config.
 *
 * Three managed blocks today:
 *   1. `[mcp_servers.playwright]` — points at the npm-published Playwright
 *      MCP server through Vite+'s `vp dlx` facade.
 *   2. `[mcp_servers.webpresso]` — points at webpresso's own MCP server.
 *      Path-stability requires discovery: webpresso lives in different
 *      locations depending on how the user installed it (Claude plugin
 *      install, bun global, pnpm/npm global). Discovery happens at scaffold
 *      time; the resolved absolute path is written into the codex config.
 *      When the unified-cli sibling cutover lands (`webpresso mcp serve`
 *      from a path-stable bin), this block collapses to a fixed `command`.
 *   3. `[mcp_servers.context7]` plus `.mcp.json#mcpServers.context7` — point at
 *      Context7's hosted MCP endpoint with the required static `Accept` header
 *      plus an env-backed `CONTEXT7_API_KEY` header. The value is supplied by
 *      agent-kit's selected secret provider through the agent launch environment;
 *      setup never reads or persists the raw key.
 */
import { execFileSync } from 'node:child_process'
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs'
import { homedir } from 'node:os'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'

import type { MergeOptions, MergeResult } from '#cli/commands/init/merge'

export const PLAYWRIGHT_MCP_SERVER_NAME = 'playwright'

/**
 * Single source of truth for how the Playwright MCP server is launched. Both
 * the Codex TOML block and the Claude Code `.mcp.json` block render from these.
 * The portable `vp dlx` facade fetches the npm-published server on demand, so
 * there is no machine-specific bin path to rot — the failure mode a hand-
 * authored `~/.bun/bin/playwright-mcp` entry hits the moment that global bin
 * disappears (ENOENT on spawn).
 */
const PLAYWRIGHT_MCP_COMMAND = 'vp'
const PLAYWRIGHT_MCP_ARGS: readonly string[] = [
  'dlx',
  '@playwright/mcp@latest',
  '--caps=testing,storage,network,devtools',
]

function tomlStringArray(values: readonly string[]): string {
  return `[${values.map((value) => `"${value}"`).join(', ')}]`
}

export const PLAYWRIGHT_MCP_HEADER = `[mcp_servers.${PLAYWRIGHT_MCP_SERVER_NAME}]`
export const PLAYWRIGHT_MCP_BLOCK = `${PLAYWRIGHT_MCP_HEADER}
command = "${PLAYWRIGHT_MCP_COMMAND}"
args = ${tomlStringArray(PLAYWRIGHT_MCP_ARGS)}
enabled = true
startup_timeout_sec = 30
`

export const WEBPRESSO_MCP_SERVER_NAME = 'webpresso'
export const WEBPRESSO_MCP_HEADER = `[mcp_servers.${WEBPRESSO_MCP_SERVER_NAME}]`

export interface EnsureCodexPlaywrightMcpInput {
  options: MergeOptions
  /** Test seam. Defaults to `$CODEX_HOME/config.toml` or `~/.codex/config.toml`. */
  configPath?: string
}

export type EnsureCodexPlaywrightMcpResult =
  | { kind: 'codex-playwright-mcp-written'; path: string }
  | { kind: 'codex-playwright-mcp-unchanged'; path: string }
  | { kind: 'codex-playwright-mcp-skipped-dry-run'; path: string }

function defaultConfigPath(): string {
  const codexHome = process.env.CODEX_HOME || join(process.env.HOME || homedir(), '.codex')
  return join(codexHome, 'config.toml')
}

export function upsertPlaywrightMcpServer(raw: string): string {
  const lines = raw.trimEnd().split(/\r?\n/)
  const hasContent = raw.trim().length > 0
  const start = lines.findIndex((line) => line.trim() === PLAYWRIGHT_MCP_HEADER)

  if (start === -1) {
    const prefix = hasContent ? `${raw.trimEnd()}\n\n` : ''
    return `${prefix}${PLAYWRIGHT_MCP_BLOCK}`
  }

  let end = lines.length
  for (let i = start + 1; i < lines.length; i += 1) {
    if (lines[i]!.trim().startsWith('[')) {
      end = i
      break
    }
  }

  return (
    [
      ...lines.slice(0, start),
      ...PLAYWRIGHT_MCP_BLOCK.trimEnd().split('\n'),
      ...lines.slice(end),
    ].join('\n') + '\n'
  )
}

export function ensureCodexPlaywrightMcp(
  input: EnsureCodexPlaywrightMcpInput,
): EnsureCodexPlaywrightMcpResult {
  const configPath = input.configPath ?? defaultConfigPath()
  if (input.options.dryRun) {
    return { kind: 'codex-playwright-mcp-skipped-dry-run', path: configPath }
  }

  const existing = existsSync(configPath) ? readFileSync(configPath, 'utf8') : ''
  const next = upsertPlaywrightMcpServer(existing)
  if (next === existing) {
    return { kind: 'codex-playwright-mcp-unchanged', path: configPath }
  }

  mkdirSync(dirname(configPath), { recursive: true })
  writeFileSync(configPath, next, 'utf8')
  return { kind: 'codex-playwright-mcp-written', path: configPath }
}

// ────────────────────────────────────────────────────────────────────────────
// Claude Code `.mcp.json` Playwright registration
//
// Claude Code reads MCP servers from a project-root `.mcp.json` (JSON, not the
// Codex TOML). `ak setup` previously scaffolded Playwright for Codex only, so
// the Claude Code entry was hand-authored — and a hardcoded `~/.bun/bin/
// playwright-mcp` path rots to ENOENT once that global bin disappears. Mirror
// the Codex upsert here with the same portable `vp dlx` launch: every consumer
// gets a self-resolving entry and a re-run repairs a broken one in place.
// ────────────────────────────────────────────────────────────────────────────

type ClaudeMcpServer = {
  command: string
  args: string[]
}

function claudePlaywrightServer(): ClaudeMcpServer {
  return { command: PLAYWRIGHT_MCP_COMMAND, args: [...PLAYWRIGHT_MCP_ARGS] }
}

function isJsonRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
}

type ParsedJson = { ok: true; value: unknown } | { ok: false }

function parseJson(raw: string): ParsedJson {
  try {
    return { ok: true, value: JSON.parse(raw) as unknown }
  } catch {
    return { ok: false }
  }
}

/**
 * Upsert the `playwright` server into a `.mcp.json` document, preserving every
 * other server (e.g. `context7`, `exa`) and any non-server top-level keys.
 * Output is normalized to 2-space JSON with a trailing newline so repeated runs
 * converge — idempotent after the first write.
 */
export function upsertClaudePlaywrightMcpServer(raw: string): string {
  const parsed = raw.trim().length > 0 ? parseJson(raw) : { ok: true as const, value: {} }
  if (!parsed.ok) {
    throw new Error('cannot upsert playwright into .mcp.json: existing file is not valid JSON')
  }
  const root = isJsonRecord(parsed.value) ? parsed.value : {}
  const servers = isJsonRecord(root.mcpServers) ? root.mcpServers : {}
  const next = {
    ...root,
    mcpServers: {
      ...servers,
      [PLAYWRIGHT_MCP_SERVER_NAME]: claudePlaywrightServer(),
    },
  }
  return `${JSON.stringify(next, null, 2)}\n`
}

export interface EnsureClaudePlaywrightMcpInput {
  options: MergeOptions
  /** Project root whose `.mcp.json` is managed. */
  repoRoot: string
  /** Test seam. Defaults to `<repoRoot>/.mcp.json`. */
  configPath?: string
}

export type EnsureClaudePlaywrightMcpResult =
  | { kind: 'claude-playwright-mcp-written'; path: string }
  | { kind: 'claude-playwright-mcp-unchanged'; path: string }
  | { kind: 'claude-playwright-mcp-skipped-dry-run'; path: string }
  | { kind: 'claude-playwright-mcp-invalid-json'; path: string }

export function ensureClaudePlaywrightMcp(
  input: EnsureClaudePlaywrightMcpInput,
): EnsureClaudePlaywrightMcpResult {
  const configPath = input.configPath ?? join(input.repoRoot, '.mcp.json')
  if (input.options.dryRun) {
    return { kind: 'claude-playwright-mcp-skipped-dry-run', path: configPath }
  }

  const existing = existsSync(configPath) ? readFileSync(configPath, 'utf8') : ''
  if (existing.trim().length > 0 && !parseJson(existing).ok) {
    return { kind: 'claude-playwright-mcp-invalid-json', path: configPath }
  }

  const next = upsertClaudePlaywrightMcpServer(existing)
  if (next === existing) {
    return { kind: 'claude-playwright-mcp-unchanged', path: configPath }
  }

  mkdirSync(dirname(configPath), { recursive: true })
  writeFileSync(configPath, next, 'utf8')
  return { kind: 'claude-playwright-mcp-written', path: configPath }
}

// ────────────────────────────────────────────────────────────────────────────
// Agent-kit MCP server registration
// ────────────────────────────────────────────────────────────────────────────

const WP_BIN_RELATIVE = join('bin', process.platform === 'win32' ? 'wp.cmd' : 'wp')

export interface WebpressoInstallProbe {
  /** Test seam — override the candidate roots. Default: probe in fixed order. */
  candidates?: readonly string[]
  /** Test seam — return value for `pnpm root -g`. Default: shell out. */
  pnpmGlobalRoot?: () => string | null
  /** Test seam — return value for `npm root -g`. Default: shell out. */
  npmGlobalRoot?: () => string | null
}

/**
 * Resolve the absolute path to webpresso's global `bin/wp` launcher on this machine. Probes
 * the locations consumers use to install webpresso, in order of stability:
 *
 *   1. the currently executing `@webpresso/agent-kit` package
 *   2. Claude plugin install — `~/.claude/plugins/cache/.../agent-kit/`
 *      (path-stable; updated by Claude Code's plugin manager)
 *   3. bun global — `~/.bun/install/global/node_modules/@webpresso/agent-kit/`
 *   4. pnpm global — `$(pnpm root -g)/@webpresso/agent-kit/`
 *   5. npm global — `$(npm root -g)/@webpresso/agent-kit/`
 *
 * Returns `null` when none of the candidates contain `bin/wp`. The caller
 * surfaces a clear error rather than writing a broken codex config.
 */
export function findWebpressoMcpEntry(probe: WebpressoInstallProbe = {}): string | null {
  const candidates = probe.candidates ?? defaultCandidates(probe)
  for (const root of candidates) {
    if (!root) continue
    const wpBin = join(root, WP_BIN_RELATIVE)
    if (existsSync(wpBin)) return wpBin
  }
  return null
}

function defaultCandidates(probe: WebpressoInstallProbe): readonly string[] {
  const home = process.env.HOME || homedir()
  const packageRoot = currentAgentKitPackageRoot()
  const claudePlugin = join(home, '.claude', 'plugins', 'cache', 'webpresso', 'agent-kit')
  const bunGlobal = join(
    home,
    '.bun',
    'install',
    'global',
    'node_modules',
    '@webpresso',
    'agent-kit',
  )
  const pnpmRoot = (probe.pnpmGlobalRoot ?? probePnpmGlobalRoot)()
  const npmRoot = (probe.npmGlobalRoot ?? probeNpmGlobalRoot)()
  return [
    packageRoot ?? '',
    claudePlugin,
    bunGlobal,
    pnpmRoot ? join(pnpmRoot, '@webpresso', 'agent-kit') : '',
    npmRoot ? join(npmRoot, '@webpresso', 'agent-kit') : '',
  ]
}

function currentAgentKitPackageRoot(): string | null {
  let current = dirname(fileURLToPath(import.meta.url))
  for (let depth = 0; depth < 12; depth += 1) {
    const packagePath = join(current, 'package.json')
    if (existsSync(packagePath)) {
      try {
        const pkg = JSON.parse(readFileSync(packagePath, 'utf8')) as { name?: unknown }
        if (pkg.name === '@webpresso/agent-kit') return current
      } catch {
        return null
      }
    }
    const parent = dirname(current)
    if (parent === current) break
    current = parent
  }
  return null
}

function probePnpmGlobalRoot(): string | null {
  return runQuiet('pnpm', ['root', '-g'])
}

function probeNpmGlobalRoot(): string | null {
  return runQuiet('npm', ['root', '-g'])
}

function runQuiet(cmd: string, args: readonly string[]): string | null {
  try {
    const output = execFileSync(cmd, [...args], {
      encoding: 'utf8',
      stdio: ['ignore', 'pipe', 'ignore'],
    })
    const trimmed = output.trim()
    return trimmed.length > 0 ? trimmed : null
  } catch {
    return null
  }
}

export function agentKitMcpLaunchCommand(entryPath: string): {
  command: string
  args: string[]
} {
  return { command: entryPath, args: ['mcp'] }
}

export function agentKitMcpBlock(entryPath: string): string {
  const launch = agentKitMcpLaunchCommand(entryPath)
  return `${WEBPRESSO_MCP_HEADER}
command = "${launch.command}"
args = [${launch.args.map((arg) => `"${arg}"`).join(', ')}]
enabled = true
`
}

export function upsertWebpressoMcpServer(raw: string, entryPath: string): string {
  const block = agentKitMcpBlock(entryPath)
  const lines = raw.trimEnd().split(/\r?\n/)
  const hasContent = raw.trim().length > 0
  const start = lines.findIndex((line) => line.trim() === WEBPRESSO_MCP_HEADER)

  if (start === -1) {
    const prefix = hasContent ? `${raw.trimEnd()}\n\n` : ''
    return `${prefix}${block}`
  }

  let end = lines.length
  for (let i = start + 1; i < lines.length; i += 1) {
    if (lines[i]!.trim().startsWith('[')) {
      end = i
      break
    }
  }

  return (
    [...lines.slice(0, start), ...block.trimEnd().split('\n'), ...lines.slice(end)].join('\n') +
    '\n'
  )
}

export interface EnsureCodexWebpressoMcpInput {
  options: MergeOptions
  /** Test seam — override the resolved MCP entry path. */
  entryPath?: string
  /** Test seam — override `$CODEX_HOME/config.toml`. */
  configPath?: string
  /** Test seam — override the install-discovery probe. */
  probe?: WebpressoInstallProbe
}

export type EnsureCodexWebpressoMcpResult =
  | { kind: 'codex-webpresso-mcp-written'; path: string; entryPath: string }
  | { kind: 'codex-webpresso-mcp-unchanged'; path: string; entryPath: string }
  | { kind: 'codex-webpresso-mcp-skipped-dry-run'; path: string }
  | { kind: 'codex-webpresso-mcp-not-installed'; path: string; checked: readonly string[] }

export function ensureCodexWebpressoMcp(
  input: EnsureCodexWebpressoMcpInput,
): EnsureCodexWebpressoMcpResult {
  const configPath = input.configPath ?? defaultConfigPath()
  if (input.options.dryRun) {
    return { kind: 'codex-webpresso-mcp-skipped-dry-run', path: configPath }
  }

  const entryPath = input.entryPath ?? findWebpressoMcpEntry(input.probe)
  if (!entryPath) {
    const checked = (input.probe?.candidates ?? defaultCandidates(input.probe ?? {})).filter(
      (p): p is string => Boolean(p),
    )
    return { kind: 'codex-webpresso-mcp-not-installed', path: configPath, checked }
  }

  const existing = existsSync(configPath) ? readFileSync(configPath, 'utf8') : ''
  const next = upsertWebpressoMcpServer(existing, entryPath)
  if (next === existing) {
    return { kind: 'codex-webpresso-mcp-unchanged', path: configPath, entryPath }
  }

  mkdirSync(dirname(configPath), { recursive: true })
  writeFileSync(configPath, next, 'utf8')
  return { kind: 'codex-webpresso-mcp-written', path: configPath, entryPath }
}

// ────────────────────────────────────────────────────────────────────────────
// Context7 hosted MCP server registration
//
// Context7's API key belongs to the configured agent-kit secret provider
// (Doppler, Infisical, etc.). Codex can populate HTTP headers from environment
// variables, so setup writes only the variable mapping and relies on
// the provider-backed Codex launch environment to inject the value at runtime.
// ────────────────────────────────────────────────────────────────────────────

export const CONTEXT7_MCP_SERVER_NAME = 'context7'
export const CONTEXT7_API_KEY_ENV = 'CONTEXT7_API_KEY'
export const CONTEXT7_MCP_URL = 'https://mcp.context7.com/mcp'
export const CONTEXT7_MCP_ACCEPT_HEADER = 'application/json, text/event-stream'
export const CONTEXT7_MCP_HEADER = `[mcp_servers.${CONTEXT7_MCP_SERVER_NAME}]`
export const CONTEXT7_MCP_BLOCK = `${CONTEXT7_MCP_HEADER}
url = "${CONTEXT7_MCP_URL}"
http_headers = { "Accept" = "${CONTEXT7_MCP_ACCEPT_HEADER}" }
env_http_headers = { "${CONTEXT7_API_KEY_ENV}" = "${CONTEXT7_API_KEY_ENV}" }
enabled = true
`

export function upsertContext7McpServer(raw: string): string {
  const lines = raw.trimEnd().split(/\r?\n/)
  const hasContent = raw.trim().length > 0
  const start = lines.findIndex((line) => line.trim() === CONTEXT7_MCP_HEADER)

  if (start === -1) {
    const prefix = hasContent ? `${raw.trimEnd()}\n\n` : ''
    return `${prefix}${CONTEXT7_MCP_BLOCK}`
  }

  let end = lines.length
  for (let i = start + 1; i < lines.length; i += 1) {
    if (lines[i]!.trim().startsWith('[')) {
      end = i
      break
    }
  }

  return (
    [
      ...lines.slice(0, start),
      ...CONTEXT7_MCP_BLOCK.trimEnd().split('\n'),
      ...lines.slice(end),
    ].join('\n') + '\n'
  )
}

export interface EnsureCodexContext7McpInput {
  options: MergeOptions
  /** Test seam. Defaults to `$CODEX_HOME/config.toml` or `~/.codex/config.toml`. */
  configPath?: string
}

export function ensureCodexContext7Mcp(input: EnsureCodexContext7McpInput): MergeResult {
  const configPath = input.configPath ?? defaultConfigPath()
  if (input.options.dryRun) return { targetPath: configPath, action: 'skipped-dry' }

  const existed = existsSync(configPath)
  const existing = existed ? readFileSync(configPath, 'utf8') : ''
  const next = upsertContext7McpServer(existing)
  if (next === existing) return { targetPath: configPath, action: 'identical' }

  mkdirSync(dirname(configPath), { recursive: true })
  writeFileSync(configPath, next, 'utf8')
  return { targetPath: configPath, action: existed ? 'overwritten' : 'created' }
}

// ────────────────────────────────────────────────────────────────────────────
// Claude Code `.mcp.json` Context7 registration
//
// Claude Code supports environment variable expansion inside `.mcp.json`
// `headers`, so project config can name `${CONTEXT7_API_KEY}` without embedding
// the secret. Launch Claude from a provider-backed shell to populate it.
// ────────────────────────────────────────────────────────────────────────────

export const CLAUDE_CONTEXT7_API_KEY_REF = `\${${CONTEXT7_API_KEY_ENV}}`

function claudeContext7Server(): Record<string, unknown> {
  return {
    type: 'http',
    url: CONTEXT7_MCP_URL,
    headers: {
      [CONTEXT7_API_KEY_ENV]: CLAUDE_CONTEXT7_API_KEY_REF,
    },
  }
}

export function upsertClaudeContext7McpServer(raw: string): string {
  const parsed = raw.trim().length > 0 ? parseJson(raw) : { ok: true as const, value: {} }
  if (!parsed.ok) {
    throw new Error('cannot upsert context7 into .mcp.json: existing file is not valid JSON')
  }
  const root = isJsonRecord(parsed.value) ? parsed.value : {}
  const servers = isJsonRecord(root.mcpServers) ? root.mcpServers : {}
  const next = {
    ...root,
    mcpServers: {
      ...servers,
      [CONTEXT7_MCP_SERVER_NAME]: claudeContext7Server(),
    },
  }
  return `${JSON.stringify(next, null, 2)}\n`
}

export interface EnsureClaudeContext7McpInput {
  options: MergeOptions
  /** Project root whose `.mcp.json` is managed. */
  repoRoot: string
  /** Test seam. Defaults to `<repoRoot>/.mcp.json`. */
  configPath?: string
}

export type EnsureClaudeContext7McpResult =
  | { kind: 'claude-context7-mcp-written'; path: string }
  | { kind: 'claude-context7-mcp-unchanged'; path: string }
  | { kind: 'claude-context7-mcp-skipped-dry-run'; path: string }
  | { kind: 'claude-context7-mcp-invalid-json'; path: string }

export function ensureClaudeContext7Mcp(
  input: EnsureClaudeContext7McpInput,
): EnsureClaudeContext7McpResult {
  const configPath = input.configPath ?? join(input.repoRoot, '.mcp.json')
  if (input.options.dryRun) {
    return { kind: 'claude-context7-mcp-skipped-dry-run', path: configPath }
  }

  const existing = existsSync(configPath) ? readFileSync(configPath, 'utf8') : ''
  if (existing.trim().length > 0 && !parseJson(existing).ok) {
    return { kind: 'claude-context7-mcp-invalid-json', path: configPath }
  }

  const next = upsertClaudeContext7McpServer(existing)
  if (next === existing) {
    return { kind: 'claude-context7-mcp-unchanged', path: configPath }
  }

  mkdirSync(dirname(configPath), { recursive: true })
  writeFileSync(configPath, next, 'utf8')
  return { kind: 'claude-context7-mcp-written', path: configPath }
}
