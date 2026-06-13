/**
 * `wp hooks status` command — derives and prints per-vendor hook status.
 *
 * Reads the installed hooks file for each vendor, compares against
 * WP_HOOK_SPECS, and prints an aligned status table.
 */
import { existsSync, readFileSync } from 'node:fs'
import { join } from 'node:path'

import {
  formatStatusLine,
  HOOK_STATUS,
  type HookStatusDetail,
  type HookStatus,
} from '#hooks/shared/vocabulary.js'
import {
  readHooksManifest,
  type HookVendorState,
} from '#cli/commands/init/scaffolders/agent-hooks/manifest.js'
import {
  CAPABILITY_MATRIX,
  type CapabilityMatrixHost,
  type SupportLevel,
} from '#cli/commands/init/scaffolders/agent-hooks/capability-matrix.js'
import type { HookGroup, HooksMap } from '#cli/commands/init/scaffolders/agent-hooks/ir.js'
import { WP_HOOK_SPECS as IR_HOOK_SPECS } from '#cli/commands/init/scaffolders/agent-hooks/ir.js'

// ── Canonical hook spec list ──────────────────────────────────────────────────

type HookSpec = {
  readonly hook: string
  readonly event: string
  readonly isGuard: boolean
}

// Hooks that actively deny tool calls when present (guard-class).
const GUARD_BINS = new Set(['wp-pretool-guard'])

/**
 * Derived from the IR's WP_HOOK_SPECS — the single source of truth for
 * hook bin names, events, and timeouts. `isGuard` is a status-display
 * concern derived here rather than duplicated in ir.ts.
 */
export const WP_HOOK_SPECS: readonly HookSpec[] = IR_HOOK_SPECS.map((spec) => ({
  hook: spec.bin,
  event: spec.event,
  isGuard: GUARD_BINS.has(spec.bin),
}))

// ── Status derivation ─────────────────────────────────────────────────────────

function hookAppearsInMap(hooksMap: HooksMap, hookName: string): boolean {
  for (const groups of Object.values(hooksMap)) {
    for (const group of groups) {
      for (const entry of group.hooks) {
        if (entry.command.includes(hookName)) return true
      }
    }
  }
  return false
}

function specStatus(spec: HookSpec, present: boolean, manifestExists: boolean): HookStatus {
  if (!manifestExists) return HOOK_STATUS.disabled
  if (!present) return HOOK_STATUS.disabled
  return spec.isGuard ? HOOK_STATUS.enforcing : HOOK_STATUS.installed
}

export type HostPackagedArtifactStatus = 'installed' | 'missing' | 'deferred'
export type HostActiveHookStatus = 'managed' | 'plugin-bridge' | 'not-installed'
export type HostLifecycleStatus = 'full' | 'degraded' | 'unsupported'

export interface HostSurfaceStatus {
  readonly host: CapabilityMatrixHost
  readonly packagedArtifact: HostPackagedArtifactStatus
  readonly activeHooks: HostActiveHookStatus
  readonly lifecycle: HostLifecycleStatus
  readonly required: boolean
  readonly ownership: string
}

type DeriveHookStatusOptions = {
  readonly hooksMap: HooksMap
  readonly vendor: 'claude' | 'codex'
  readonly manifestExists: boolean
  readonly vendorState?: HookVendorState
}

/**
 * Pure logic: derive status for all hooks for a given vendor from the
 * installed hooks file. Returns one HookStatusDetail per hook spec entry.
 *
 * Sort order: event name then hook name.
 */
export function deriveHookStatus(options: DeriveHookStatusOptions): readonly HookStatusDetail[] {
  const { hooksMap, vendor, manifestExists, vendorState = 'enabled' } = options

  const details = WP_HOOK_SPECS.map((spec): HookStatusDetail => {
    const present = hookAppearsInMap(hooksMap, spec.hook)
    return {
      hook: spec.hook,
      event: spec.event,
      vendor,
      status:
        vendorState === 'disabled'
          ? HOOK_STATUS.disabled
          : specStatus(spec, present, manifestExists),
    }
  })

  return [...details].sort((a, b) => {
    const eventOrder = a.event.localeCompare(b.event)
    return eventOrder !== 0 ? eventOrder : a.hook.localeCompare(b.hook)
  })
}

function readJsonRecord(filePath: string): Record<string, unknown> | null {
  try {
    const raw = readFileSync(filePath, 'utf8')
    const parsed = JSON.parse(raw) as unknown
    return parsed && typeof parsed === 'object' && !Array.isArray(parsed)
      ? (parsed as Record<string, unknown>)
      : null
  } catch {
    return null
  }
}

function stringArrayEquals(value: unknown, expected: readonly string[]): boolean {
  return (
    Array.isArray(value) &&
    value.length === expected.length &&
    value.every((item, index) => item === expected[index])
  )
}

function hasValidCodexPluginArtifacts(repoRoot: string): boolean {
  const pluginPath = join(repoRoot, '.codex-plugin', 'plugin.json')
  const mcpPath = join(repoRoot, '.codex-plugin', 'mcp.json')
  const hooksPath = join(repoRoot, '.codex-plugin', 'hooks.json')
  if (!existsSync(pluginPath) || !existsSync(mcpPath) || !existsSync(hooksPath)) return false

  const plugin = readJsonRecord(pluginPath)
  const mcp = readJsonRecord(mcpPath)
  const hooks = readJsonRecord(hooksPath)
  const servers = mcp?.mcpServers
  const serversRecord =
    servers && typeof servers === 'object' && !Array.isArray(servers)
      ? (servers as Record<string, unknown>)
      : null
  const server = serversRecord?.webpresso
  const serverRecord =
    server && typeof server === 'object' && !Array.isArray(server)
      ? (server as Record<string, unknown>)
      : null
  const hookMap = hooks?.hooks

  return (
    plugin?.mcpServers === './.codex-plugin/mcp.json' &&
    plugin.hooks === './.codex-plugin/hooks.json' &&
    serverRecord?.command === '${PLUGIN_ROOT}/bin/wp' &&
    stringArrayEquals(serverRecord.args, ['mcp']) &&
    hookMap !== null &&
    typeof hookMap === 'object' &&
    !Array.isArray(hookMap) &&
    Object.keys(hookMap).length === 0
  )
}

function supportLevelForHost(host: CapabilityMatrixHost): HostLifecycleStatus {
  const emittedEvents = new Set(WP_HOOK_SPECS.map((spec) => spec.event))
  const levels = CAPABILITY_MATRIX.filter((entry) => emittedEvents.has(entry.event)).map(
    (entry) => entry[host] as SupportLevel,
  )
  if (levels.length === 0) return 'unsupported'
  if (levels.every((level) => level === 'full')) return 'full'
  if (levels.every((level) => level === 'unsupported' || level === 'unmapped')) {
    return 'unsupported'
  }
  return 'degraded'
}

export function deriveHostSurfaceStatus(repoRoot: string): readonly HostSurfaceStatus[] {
  return [
    {
      host: 'claude',
      packagedArtifact: existsSync(join(repoRoot, '.claude-plugin', 'plugin.json'))
        ? 'installed'
        : 'missing',
      activeHooks: existsSync(join(repoRoot, '.claude', 'settings.json'))
        ? 'managed'
        : 'not-installed',
      lifecycle: supportLevelForHost('claude'),
      required: true,
      ownership:
        'plugin artifact owns MCP; active hooks stay setup-managed in .claude/settings.json',
    },
    {
      host: 'codex',
      packagedArtifact: hasValidCodexPluginArtifacts(repoRoot) ? 'installed' : 'missing',
      activeHooks: existsSync(join(repoRoot, '.codex', 'hooks.json')) ? 'managed' : 'not-installed',
      lifecycle: supportLevelForHost('codex'),
      required: true,
      ownership:
        '.codex-plugin/hooks.json is package metadata only; active hooks stay in .codex/hooks.json',
    },
    {
      host: 'cursor',
      packagedArtifact: 'deferred',
      activeHooks: existsSync(join(repoRoot, '.cursor', 'hooks.json'))
        ? 'managed'
        : 'not-installed',
      lifecycle: supportLevelForHost('cursor'),
      required: false,
      ownership: 'project hooks config only; no packaged plugin artifact is shipped',
    },
    {
      host: 'opencode',
      packagedArtifact: existsSync(join(repoRoot, '.opencode', 'plugins', 'webpresso-hooks.js'))
        ? 'installed'
        : 'deferred',
      activeHooks: existsSync(join(repoRoot, '.opencode', 'plugins', 'webpresso-hooks.js'))
        ? 'plugin-bridge'
        : 'not-installed',
      lifecycle: supportLevelForHost('opencode'),
      required: false,
      ownership:
        'plugin bridge owns OpenCode integration; unsupported lifecycle events remain explicit',
    },
  ]
}

function bounded(value: string, maxLength: number): string {
  return value.length <= maxLength ? value : `${value.slice(0, maxLength - 1)}…`
}

export function formatHostSurfaceStatusLine(surface: HostSurfaceStatus): string {
  return (
    `${surface.host}: artifact=${surface.packagedArtifact} active=${surface.activeHooks} ` +
    `lifecycle=${surface.lifecycle} required=${surface.required ? 'yes' : 'no'} — ` +
    bounded(surface.ownership, 120)
  )
}

// ── File readers ──────────────────────────────────────────────────────────────

function readHooksMap(filePath: string): HooksMap {
  if (!existsSync(filePath)) return {}
  try {
    const raw = readFileSync(filePath, 'utf8')
    const parsed: unknown = JSON.parse(raw)
    if (parsed === null || typeof parsed !== 'object' || Array.isArray(parsed)) return {}
    const obj = parsed as Record<string, unknown>
    // Codex wraps events under a top-level `hooks` key.
    const candidate =
      typeof obj['hooks'] === 'object' && obj['hooks'] !== null && !Array.isArray(obj['hooks'])
        ? (obj['hooks'] as Record<string, unknown>)
        : obj
    // Flatten to HooksMap: keep only array-valued event keys.
    const result: HooksMap = {}
    for (const [key, value] of Object.entries(candidate)) {
      if (Array.isArray(value)) result[key] = value as HookGroup[]
    }
    return result
  } catch {
    return {}
  }
}

function resolveClaudeSettingsPath(repoRoot: string): string {
  return join(repoRoot, '.claude', 'settings.json')
}

function resolveCodexHooksPath(repoRoot: string): string {
  return join(repoRoot, '.codex', 'hooks.json')
}

// ── Command entry point ───────────────────────────────────────────────────────

function parseVendorFlag(argv: readonly string[]): Array<'claude' | 'codex'> {
  const idx = argv.indexOf('--vendor')
  if (idx === -1 || idx + 1 >= argv.length) return ['claude', 'codex']
  const value = argv[idx + 1]
  if (value === 'claude' || value === 'codex') return [value]
  return ['claude', 'codex']
}

function resolveRepoRoot(): string {
  return process.env['CLAUDE_PROJECT_DIR'] ?? process.cwd()
}

function hooksFilePath(vendor: 'claude' | 'codex', repoRoot: string): string {
  return vendor === 'claude' ? resolveClaudeSettingsPath(repoRoot) : resolveCodexHooksPath(repoRoot)
}

function printVendorStatus(
  vendor: 'claude' | 'codex',
  repoRoot: string,
  manifestExists: boolean,
  vendorState: HookVendorState,
): void {
  const filePath = hooksFilePath(vendor, repoRoot)
  const hooksMap = readHooksMap(filePath)
  const details = deriveHookStatus({ hooksMap, vendor, manifestExists, vendorState })

  process.stdout.write(`\n[${vendor}] hooks status (${filePath})\n`)
  process.stdout.write(`${'─'.repeat(80)}\n`)
  for (const detail of details) {
    process.stdout.write(`${formatStatusLine(detail)}\n`)
  }
}

function printHostSurfaceStatus(repoRoot: string): void {
  process.stdout.write('\n[host surfaces]\n')
  process.stdout.write(`${'─'.repeat(80)}\n`)
  for (const surface of deriveHostSurfaceStatus(repoRoot)) {
    process.stdout.write(`${formatHostSurfaceStatusLine(surface)}\n`)
  }
}

/**
 * Entry point called from src/cli/commands/hooks.ts case 'status':
 *
 *   case 'status':
 *     await import('#hooks/status/index.js').then(m => m.statusCommand(rest))
 */
export async function statusCommand(argv: readonly string[]): Promise<void> {
  const vendors = parseVendorFlag(argv)
  const repoRoot = resolveRepoRoot()
  const manifest = readHooksManifest(repoRoot)
  const manifestExists = manifest !== null

  if (!manifestExists) {
    process.stdout.write(
      'No hooks manifest found. Run `wp setup` to regenerate managed hook state.\n',
    )
  }

  printHostSurfaceStatus(repoRoot)

  for (const vendor of vendors) {
    printVendorStatus(vendor, repoRoot, manifestExists, manifest?.vendorState[vendor] ?? 'enabled')
  }
}
