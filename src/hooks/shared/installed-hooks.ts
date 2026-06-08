import { existsSync, readFileSync } from 'node:fs'
import { join } from 'node:path'

import type { HooksMap } from '#cli/commands/init/scaffolders/agent-hooks/ir.js'

export type InstalledHookVendor = 'claude' | 'codex'

export function resolveInstalledHooksPath(repoRoot: string, vendor: InstalledHookVendor): string {
  return vendor === 'claude'
    ? join(repoRoot, '.claude', 'settings.json')
    : join(repoRoot, '.codex', 'hooks.json')
}

export function readInstalledHooksMap(repoRoot: string, vendor: InstalledHookVendor): HooksMap {
  const configPath = resolveInstalledHooksPath(repoRoot, vendor)
  if (!existsSync(configPath)) {
    return {}
  }

  const raw: unknown = JSON.parse(readFileSync(configPath, 'utf8'))

  if (typeof raw !== 'object' || raw === null) {
    return {}
  }

  const withHooks = raw as Record<string, unknown>
  const hookSource =
    typeof withHooks['hooks'] === 'object' && withHooks['hooks'] !== null
      ? (withHooks['hooks'] as Record<string, unknown>)
      : withHooks

  const result: HooksMap = {}
  for (const [key, value] of Object.entries(hookSource)) {
    if (!Array.isArray(value)) continue
    result[key] = value as HooksMap[string]
  }
  return result
}
