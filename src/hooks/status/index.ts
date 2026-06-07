/**
 * `wp hooks status` command — derives and prints per-vendor hook status.
 *
 * Reads the installed hooks file for each vendor, compares against
 * WP_HOOK_SPECS, and prints an aligned status table.
 */
import { existsSync, readFileSync } from 'node:fs'
import { homedir } from 'node:os'
import { join, resolve } from 'node:path'

import { formatStatusLine, HOOK_STATUS, type HookStatusDetail, type HookStatus } from '#hooks/shared/vocabulary.js'

// ── Canonical hook spec list ──────────────────────────────────────────────────

type HookSpec = {
  readonly hook: string  // bin name, e.g. 'wp-pretool-guard'
  readonly event: string // e.g. 'PreToolUse'
  readonly isGuard: boolean // true → enforcing status when present
}

/**
 * The canonical set of wp-* hooks that setup writes for each vendor.
 * Single source of truth for status derivation.
 */
export const WP_HOOK_SPECS: readonly HookSpec[] = [
  { hook: 'wp-sessionstart-routing', event: 'SessionStart', isGuard: false },
  { hook: 'wp-check-dev-link', event: 'SessionStart', isGuard: false },
  { hook: 'wp-pretool-guard', event: 'PreToolUse', isGuard: true },
  { hook: 'wp-post-tool', event: 'PostToolUse', isGuard: false },
  { hook: 'wp-guard-switch', event: 'UserPromptSubmit', isGuard: false },
  { hook: 'wp-stop-qa', event: 'Stop', isGuard: false },
] as const

// ── HooksMap types (mirrors scaffolder inline types) ─────────────────────────

type HookEntry = { readonly type: string; readonly command: string; readonly timeout?: number }
type HookGroup = { readonly matcher?: string; readonly hooks: readonly HookEntry[] }
type HooksMap = Record<string, readonly HookGroup[]>

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
  if (!manifestExists) return HOOK_STATUS.generatedInactive
  if (!present) return HOOK_STATUS.disabled
  return spec.isGuard ? HOOK_STATUS.enforcing : HOOK_STATUS.installed
}

type DeriveHookStatusOptions = {
  readonly hooksMap: HooksMap
  readonly vendor: 'claude' | 'codex'
  readonly manifestExists: boolean
}

/**
 * Pure logic: derive status for all hooks for a given vendor from the
 * installed hooks file. Returns one HookStatusDetail per hook spec entry.
 *
 * Sort order: event name then hook name.
 */
export function deriveHookStatus(options: DeriveHookStatusOptions): readonly HookStatusDetail[] {
  const { hooksMap, vendor, manifestExists } = options

  const details = WP_HOOK_SPECS.map((spec): HookStatusDetail => {
    const present = hookAppearsInMap(hooksMap, spec.hook)
    return {
      hook: spec.hook,
      event: spec.event,
      vendor,
      status: specStatus(spec, present, manifestExists),
    }
  })

  return [...details].sort((a, b) => {
    const eventOrder = a.event.localeCompare(b.event)
    return eventOrder !== 0 ? eventOrder : a.hook.localeCompare(b.hook)
  })
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
    const candidate = typeof obj['hooks'] === 'object' && obj['hooks'] !== null && !Array.isArray(obj['hooks'])
      ? obj['hooks'] as Record<string, unknown>
      : obj
    // Flatten to HooksMap: keep only array-valued event keys.
    const result: HooksMap = {}
    for (const [key, value] of Object.entries(candidate)) {
      if (Array.isArray(value)) result[key] = value as readonly HookGroup[]
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

function resolveManifestPath(repoRoot: string): string {
  return join(repoRoot, '.webpresso', 'hooks-manifest.json')
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
  return vendor === 'claude'
    ? resolveClaudeSettingsPath(repoRoot)
    : resolveCodexHooksPath(repoRoot)
}

function printVendorStatus(
  vendor: 'claude' | 'codex',
  repoRoot: string,
  manifestExists: boolean,
): void {
  const filePath = hooksFilePath(vendor, repoRoot)
  const hooksMap = readHooksMap(filePath)
  const details = deriveHookStatus({ hooksMap, vendor, manifestExists })

  process.stdout.write(`\n[${vendor}] hooks status (${filePath})\n`)
  process.stdout.write(`${'─'.repeat(80)}\n`)
  for (const detail of details) {
    process.stdout.write(`${formatStatusLine(detail)}\n`)
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
  const manifestExists = existsSync(resolveManifestPath(repoRoot))

  for (const vendor of vendors) {
    printVendorStatus(vendor, repoRoot, manifestExists)
  }
}
