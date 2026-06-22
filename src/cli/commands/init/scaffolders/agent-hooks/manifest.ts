/**
 * Hooks manifest writer — records what wp-* hooks are installed per vendor so
 * the doctor and status command can compare against it.
 *
 * The manifest is written to `.webpresso/hooks-manifest.json` after every
 * `wp setup`. It is intentionally gitignored — it is a local install record,
 * not a source-of-truth document.
 */

import { mkdirSync, readFileSync, writeFileSync } from 'node:fs'
import { dirname, join } from 'node:path'

import { type HooksMap, WP_HOOK_BIN_NAMES } from '#cli/commands/init/scaffolders/agent-hooks/ir.js'

export const HOOK_MANIFEST_VENDORS = ['claude', 'codex'] as const
export type HookManifestVendor = (typeof HOOK_MANIFEST_VENDORS)[number]
export type HookVendorState = 'enabled' | 'disabled'
export type HookVendorStateMap = Record<HookManifestVendor, HookVendorState>

export type HooksManifest = {
  readonly version: 1
  readonly generatedAt: string // ISO timestamp
  readonly claude: HooksMap
  readonly codex: HooksMap
  readonly vendorState: HookVendorStateMap
}

export const MANIFEST_PATH = '.webpresso/hooks-manifest.json'

function defaultVendorState(): HookVendorStateMap {
  return { claude: 'enabled', codex: 'enabled' }
}

function normalizeHooksManifest(parsed: unknown): HooksManifest | null {
  if (
    parsed === null ||
    typeof parsed !== 'object' ||
    !('version' in parsed) ||
    (parsed as { version: unknown }).version !== 1
  ) {
    return null
  }

  const manifest = parsed as {
    version: 1
    generatedAt?: unknown
    claude?: HooksMap
    codex?: HooksMap
    vendorState?: Partial<Record<HookManifestVendor, HookVendorState>>
  }

  const vendorState = {
    ...defaultVendorState(),
    ...(manifest.vendorState === undefined ? {} : manifest.vendorState),
  } satisfies HookVendorStateMap

  return {
    version: 1,
    generatedAt:
      typeof manifest.generatedAt === 'string' ? manifest.generatedAt : new Date().toISOString(),
    claude: manifest.claude ?? {},
    codex: manifest.codex ?? {},
    vendorState,
  }
}

/**
 * Write the hooks manifest to disk at `<repoRoot>/.webpresso/hooks-manifest.json`.
 * Creates the `.webpresso/` directory if it does not exist.
 */
export function writeHooksManifest(
  repoRoot: string,
  claude: HooksMap,
  codex: HooksMap,
  vendorState: HookVendorStateMap = defaultVendorState(),
): void {
  const manifestPath = join(repoRoot, MANIFEST_PATH)
  mkdirSync(dirname(manifestPath), { recursive: true })
  const manifest: HooksManifest = {
    version: 1,
    generatedAt: new Date().toISOString(),
    claude,
    codex,
    vendorState,
  }
  writeFileSync(manifestPath, JSON.stringify(manifest, null, 2) + '\n', 'utf-8')
}

/**
 * Read the hooks manifest from disk.
 * Returns null if the file does not exist or cannot be parsed.
 */
export function readHooksManifest(repoRoot: string): HooksManifest | null {
  const manifestPath = join(repoRoot, MANIFEST_PATH)
  try {
    const raw = readFileSync(manifestPath, 'utf-8')
    return normalizeHooksManifest(JSON.parse(raw))
  } catch {
    return null
  }
}

export type HookVerdict = 'ok' | 'missing' | 'unknown'

export type HookDiff = {
  readonly event: string
  readonly command: string
  readonly verdict: HookVerdict
  readonly vendor: 'claude' | 'codex'
}

const VITE_PLUS_PATH_PREFIX = /^export PATH="\$HOME\/\.vite-plus\/bin:\$PATH";\s*/u
const WP_HOOK_SUBCOMMANDS = new Set(WP_HOOK_BIN_NAMES.map((bin) => bin.replace(/^wp-/u, '')))

function normalizeHookCommandForManifest(command: string): string {
  return command.replace(VITE_PLUS_PATH_PREFIX, '')
}

function shellWords(command: string): string[] {
  return command.match(/[A-Za-z0-9_.@/:$'"-]+/gu) ?? []
}

function isWebpressoManagedHookCommand(command: string): boolean {
  const normalized = normalizeHookCommandForManifest(command)
  if (WP_HOOK_BIN_NAMES.some((bin) => normalized.includes(bin))) return true

  const words = shellWords(normalized).map((word) => word.replace(/^['"]|['"]$/gu, ''))
  for (let index = 0; index < words.length - 2; index += 1) {
    if (
      words[index] === 'wp' &&
      words[index + 1] === 'hook' &&
      WP_HOOK_SUBCOMMANDS.has(words[index + 2] ?? '')
    ) {
      return true
    }
  }
  return false
}

/**
 * Compare installed hooks (from disk) against the manifest.
 * Returns per-hook 3-way verdicts:
 *   'ok'      — in manifest and installed
 *   'missing' — in manifest but not installed
 *   'unknown' — installed but not in manifest (hand-edited?)
 */
export function diffHooksManifest(
  manifest: HooksManifest,
  current: { claude: HooksMap; codex: HooksMap },
): readonly HookDiff[] {
  const diffs: HookDiff[] = []

  for (const vendor of ['claude', 'codex'] as const) {
    const manifestMap = manifest[vendor]
    const currentMap = current[vendor]

    // Collect all currently installed commands keyed by event:command
    const currentCommands = new Set<string>()
    for (const [event, groups] of Object.entries(currentMap)) {
      for (const group of groups) {
        for (const hook of group.hooks) {
          currentCommands.add(`${event}:${normalizeHookCommandForManifest(hook.command)}`)
        }
      }
    }

    // Collect all manifest commands keyed by event:command
    const manifestCommands = new Set<string>()
    for (const [event, groups] of Object.entries(manifestMap)) {
      for (const group of groups) {
        for (const hook of group.hooks) {
          manifestCommands.add(`${event}:${normalizeHookCommandForManifest(hook.command)}`)
        }
      }
    }

    // Find 'ok' and 'missing' — iterate manifest entries
    for (const [event, groups] of Object.entries(manifestMap)) {
      for (const group of groups) {
        for (const hook of group.hooks) {
          const key = `${event}:${normalizeHookCommandForManifest(hook.command)}`
          if (manifest.vendorState[vendor] === 'disabled' && !currentCommands.has(key)) {
            continue
          }
          diffs.push({
            event,
            command: hook.command,
            verdict: currentCommands.has(key) ? 'ok' : 'missing',
            vendor,
          })
        }
      }
    }

    // Find 'unknown' — installed but not in manifest
    for (const [event, groups] of Object.entries(currentMap)) {
      for (const group of groups) {
        for (const hook of group.hooks) {
          const key = `${event}:${normalizeHookCommandForManifest(hook.command)}`
          if (!manifestCommands.has(key) && isWebpressoManagedHookCommand(hook.command)) {
            diffs.push({
              event,
              command: hook.command,
              verdict: 'unknown',
              vendor,
            })
          }
        }
      }
    }
  }

  return diffs
}

export function withHookVendorState(
  manifest: HooksManifest,
  vendors: readonly HookManifestVendor[],
  state: HookVendorState,
): HooksManifest {
  const vendorState: HookVendorStateMap = { ...manifest.vendorState }
  for (const vendor of vendors) {
    vendorState[vendor] = state
  }

  return {
    ...manifest,
    vendorState,
  }
}
