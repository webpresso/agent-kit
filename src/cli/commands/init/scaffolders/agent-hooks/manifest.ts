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

import type { HooksMap } from '#cli/commands/init/scaffolders/agent-hooks/ir.js'

export type HooksManifest = {
  readonly version: 1
  readonly generatedAt: string // ISO timestamp
  readonly claude: HooksMap
  readonly codex: HooksMap
}

export const MANIFEST_PATH = '.webpresso/hooks-manifest.json'

/**
 * Write the hooks manifest to disk at `<repoRoot>/.webpresso/hooks-manifest.json`.
 * Creates the `.webpresso/` directory if it does not exist.
 */
export function writeHooksManifest(
  repoRoot: string,
  claude: HooksMap,
  codex: HooksMap,
): void {
  const manifestPath = join(repoRoot, MANIFEST_PATH)
  mkdirSync(dirname(manifestPath), { recursive: true })
  const manifest: HooksManifest = {
    version: 1,
    generatedAt: new Date().toISOString(),
    claude,
    codex,
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
    const parsed: unknown = JSON.parse(raw)
    if (
      parsed !== null &&
      typeof parsed === 'object' &&
      'version' in parsed &&
      (parsed as { version: unknown }).version === 1
    ) {
      return parsed as HooksManifest
    }
    return null
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
          currentCommands.add(`${event}:${hook.command}`)
        }
      }
    }

    // Collect all manifest commands keyed by event:command
    const manifestCommands = new Set<string>()
    for (const [event, groups] of Object.entries(manifestMap)) {
      for (const group of groups) {
        for (const hook of group.hooks) {
          manifestCommands.add(`${event}:${hook.command}`)
        }
      }
    }

    // Find 'ok' and 'missing' — iterate manifest entries
    for (const [event, groups] of Object.entries(manifestMap)) {
      for (const group of groups) {
        for (const hook of group.hooks) {
          const key = `${event}:${hook.command}`
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
          const key = `${event}:${hook.command}`
          if (!manifestCommands.has(key)) {
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
