/**
 * `session-memory` scaffolder — sets up ak_session_* lane-2 memory.
 *
 * Responsibilities:
 *   1. Ensure ~/.webpresso/sessions/ directory exists
 *   2. Detect context-mode entries in .claude-plugin/plugin.json and remove them
 *      (with timestamped backup) — migration from context-mode to ak_session_*
 *   3. Idempotent re-run: detecting existing setup is a no-op
 *   4. Never touches .mcp.json (does not exist in agent-kit)
 *
 * Backup format: <filename>.pre-session-memory-backup.<timestamp>.json
 */
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs'
import { homedir } from 'node:os'
import { join } from 'node:path'

import type { MergeOptions } from '#cli/commands/init/merge'

export const SESSIONS_DIR = join(homedir(), '.webpresso', 'sessions')

export interface ScaffoldSessionMemoryInput {
  readonly repoRoot: string
  readonly options: MergeOptions
  /** Override sessions directory for testing */
  readonly sessionsDir?: string
}

export type ScaffoldSessionMemoryResult =
  | { readonly kind: 'ok'; readonly migrated: boolean; readonly backupPath: string | null }
  | { readonly kind: 'dry-run' }
  | { readonly kind: 'malformed-plugin-json'; readonly path: string }

export interface PluginJson {
  readonly mcpServers?: Record<string, unknown>
  readonly [key: string]: unknown
}

/** Names of known context-mode MCP server keys in .claude-plugin/plugin.json */
const CONTEXT_MODE_KEYS = ['context-mode', 'context_mode'] as const

/**
 * Check whether plugin.json contains context-mode MCP server entries.
 */
export function hasContextModeEntries(plugin: PluginJson): boolean {
  if (!plugin.mcpServers || typeof plugin.mcpServers !== 'object') return false
  return CONTEXT_MODE_KEYS.some((key) => key in plugin.mcpServers!)
}

/**
 * Remove context-mode MCP entries from plugin.json, returning the updated object.
 */
export function removeContextModeEntries(plugin: PluginJson): PluginJson {
  if (!plugin.mcpServers) return plugin
  const next = { ...plugin.mcpServers }
  for (const key of CONTEXT_MODE_KEYS) {
    delete next[key]
  }
  return { ...plugin, mcpServers: next }
}

export function scaffoldSessionMemory(
  input: ScaffoldSessionMemoryInput,
): ScaffoldSessionMemoryResult {
  if (input.options.dryRun) return { kind: 'dry-run' }

  const sessionsDir = input.sessionsDir ?? SESSIONS_DIR

  // Step 1: Ensure sessions directory exists
  mkdirSync(sessionsDir, { recursive: true })

  // Step 2: Detect and migrate context-mode from .claude-plugin/plugin.json
  const pluginJsonPath = join(input.repoRoot, '.claude-plugin', 'plugin.json')

  if (!existsSync(pluginJsonPath)) {
    return { kind: 'ok', migrated: false, backupPath: null }
  }

  let plugin: PluginJson
  let raw: string
  try {
    raw = readFileSync(pluginJsonPath, 'utf8')
    plugin = JSON.parse(raw) as PluginJson
    if (typeof plugin !== 'object' || plugin === null || Array.isArray(plugin)) {
      throw new Error('not an object')
    }
  } catch {
    // Malformed JSON — preserve unchanged + warn
    return { kind: 'malformed-plugin-json', path: pluginJsonPath }
  }

  if (!hasContextModeEntries(plugin)) {
    // Already clean — idempotent no-op
    return { kind: 'ok', migrated: false, backupPath: null }
  }

  // Write timestamped backup before modifying
  const timestamp = Date.now()
  const backupPath = join(
    input.repoRoot,
    '.claude-plugin',
    `plugin.pre-session-memory-backup.${timestamp}.json`,
  )
  writeFileSync(backupPath, raw)

  // Remove context-mode entries and write updated plugin.json
  const updated = removeContextModeEntries(plugin)
  writeFileSync(pluginJsonPath, JSON.stringify(updated, null, 2) + '\n')

  return { kind: 'ok', migrated: true, backupPath }
}
