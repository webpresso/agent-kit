import { spawnSync } from 'node:child_process'
import { existsSync } from 'node:fs'
import { join } from 'node:path'

import type { MergeOptions } from '#cli/commands/init/merge'

/**
 * Codex consumes agent-kit skills through its native plugin system (verified
 * against codex-cli 0.139.0): `codex plugin marketplace add <local-root>` then
 * `codex plugin add <plugin>@<marketplace>`. The marketplace catalog is read
 * from the legacy-compatible `.claude-plugin/marketplace.json` (name
 * `webpresso`); the plugin folder ships its own `.codex-plugin/plugin.json`.
 *
 * There is no `codex plugin install` verb — `plugin add` is the install verb.
 */
export const CODEX_PLUGIN_ID = 'agent-kit@webpresso'

export interface EnsureCodexPluginInput {
  options: MergeOptions
  packageRoot: string
  commandExists?: (command: string) => boolean
  runCommand?: (command: string, args: readonly string[]) => number
}

export type EnsureCodexPluginResult =
  | { kind: 'codex-plugin-installed'; packageRoot: string; pluginId: string }
  | { kind: 'codex-plugin-skipped-dry-run'; packageRoot: string }
  | { kind: 'codex-plugin-skipped-opt-out'; packageRoot: string }
  | { kind: 'codex-plugin-skipped-no-cli'; packageRoot: string }
  | { kind: 'codex-plugin-unavailable'; packageRoot: string }
  | {
      kind: 'codex-plugin-failed'
      packageRoot: string
      pluginId: string
      step: 'marketplace-add' | 'plugin-add'
      exitCode: number
    }

function defaultCommandExists(command: string): boolean {
  const result = spawnSync('which', [command], { stdio: 'ignore' })
  return result.status === 0
}

function defaultRunCommand(command: string, args: readonly string[]): number {
  const result = spawnSync(command, [...args], {
    stdio: 'inherit',
    env: process.env,
  })

  if (result.error) throw result.error
  return result.status ?? 1
}

export function ensureCodexUserPlugin(input: EnsureCodexPluginInput): EnsureCodexPluginResult {
  const packageRoot = input.packageRoot
  const pluginManifestPath = join(packageRoot, '.codex-plugin', 'plugin.json')
  if (!existsSync(pluginManifestPath)) {
    return { kind: 'codex-plugin-unavailable', packageRoot }
  }

  if (input.options.dryRun) {
    return { kind: 'codex-plugin-skipped-dry-run', packageRoot }
  }

  if (process.env.WP_SKIP_CODEX_PLUGIN === '1') {
    return { kind: 'codex-plugin-skipped-opt-out', packageRoot }
  }

  const commandExists = input.commandExists ?? defaultCommandExists
  if (!commandExists('codex')) {
    return { kind: 'codex-plugin-skipped-no-cli', packageRoot }
  }

  const runCommand = input.runCommand ?? defaultRunCommand
  const steps = [
    {
      step: 'marketplace-add' as const,
      args: ['plugin', 'marketplace', 'add', packageRoot],
    },
    {
      step: 'plugin-add' as const,
      args: ['plugin', 'add', CODEX_PLUGIN_ID],
    },
  ]

  for (const { step, args } of steps) {
    const exitCode = runCommand('codex', args)
    if (exitCode !== 0) {
      return {
        kind: 'codex-plugin-failed',
        packageRoot,
        pluginId: CODEX_PLUGIN_ID,
        step,
        exitCode,
      }
    }
  }

  return {
    kind: 'codex-plugin-installed',
    packageRoot,
    pluginId: CODEX_PLUGIN_ID,
  }
}
