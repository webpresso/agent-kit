/**
 * Hook group merge utilities — deduplication and merge logic for HooksMap.
 *
 * Extracted from index.ts to allow emitters and other consumers to import
 * merge logic without pulling in the full scaffolder surface.
 */

import type { HookEntry, HookGroup, HooksMap } from './ir.js'
import {
  DIRECT_CLAUDE_NODE_MODULES_BIN_PATTERN,
  DIRECT_MANAGED_HOOK_LAUNCHER_PATTERN,
  DIRECT_NODE_MODULES_BIN_PATTERN,
  GUARDED_CLAUDE_NODE_MODULES_BIN_PATTERN,
  GUARDED_MANAGED_HOOK_LAUNCHER_PATTERN,
  GUARDED_NODE_MODULES_BIN_PATTERN,
  IF_GUARDED_CLAUDE_NODE_MODULES_BIN_PATTERN,
  IF_GUARDED_MANAGED_HOOK_LAUNCHER_PATTERN,
  IF_GUARDED_NODE_MODULES_BIN_PATTERN,
  stripSingleShellQuotePair,
} from './shell-identity.js'

function findHookIndexByCommand(hooks: HookEntry[], command: string): number {
  return hooks.findIndex((hook) => commandMatches(hook.command, command))
}

const SCRIPT_EXTENSIONS = ['sh', 'ts', 'js', 'mjs', 'cjs', 'py'] as const
const SCRIPT_BASENAME_PATTERN = new RegExp(
  String.raw`([\w-]+\.(?:${SCRIPT_EXTENSIONS.join('|')}))(?=$|["'\s])`,
  'u',
)

function extractAgentKitBinName(command: string): string | null {
  const normalizedCommand = stripSingleShellQuotePair(command.trim())
  const directBinMatch = DIRECT_NODE_MODULES_BIN_PATTERN.exec(normalizedCommand)
  if (directBinMatch !== null) return directBinMatch[1] ?? null
  const directManagedLauncherMatch = DIRECT_MANAGED_HOOK_LAUNCHER_PATTERN.exec(normalizedCommand)
  if (directManagedLauncherMatch !== null) return directManagedLauncherMatch[2] ?? null
  const guardedBinMatch = GUARDED_NODE_MODULES_BIN_PATTERN.exec(command.trim())
  if (guardedBinMatch !== null) return guardedBinMatch[3] ?? null
  const ifGuardedBinMatch = IF_GUARDED_NODE_MODULES_BIN_PATTERN.exec(command.trim())
  if (ifGuardedBinMatch !== null) return ifGuardedBinMatch[3] ?? null
  const directClaudeBinMatch = DIRECT_CLAUDE_NODE_MODULES_BIN_PATTERN.exec(normalizedCommand)
  if (directClaudeBinMatch !== null) return directClaudeBinMatch[1] ?? null
  const guardedClaudeBinMatch = GUARDED_CLAUDE_NODE_MODULES_BIN_PATTERN.exec(command.trim())
  if (guardedClaudeBinMatch !== null) return guardedClaudeBinMatch[2] ?? null
  const ifGuardedClaudeBinMatch = IF_GUARDED_CLAUDE_NODE_MODULES_BIN_PATTERN.exec(command.trim())
  if (ifGuardedClaudeBinMatch !== null) return ifGuardedClaudeBinMatch[2] ?? null
  const guardedManagedLauncherMatch = GUARDED_MANAGED_HOOK_LAUNCHER_PATTERN.exec(command.trim())
  if (guardedManagedLauncherMatch !== null) return guardedManagedLauncherMatch[3] ?? null
  const ifGuardedManagedLauncherMatch = IF_GUARDED_MANAGED_HOOK_LAUNCHER_PATTERN.exec(
    command.trim(),
  )
  if (ifGuardedManagedLauncherMatch !== null) return ifGuardedManagedLauncherMatch[3] ?? null
  return null
}

/**
 * Return a stable identifier for the script that `command` invokes, or null
 * when none can be extracted (e.g. an opaque shell expression). Used by
 * `commandMatches` for dedup across wrapped/raw invocation forms.
 */
function extractCommandTarget(command: string): string | null {
  const binName = extractAgentKitBinName(command)
  if (binName !== null) return `bin:${binName}`
  const scriptMatch = SCRIPT_BASENAME_PATTERN.exec(command)
  if (scriptMatch !== null) return `script:${scriptMatch[1]}`
  return null
}

/**
 * Detect whether two commands invoke the same target, regardless of
 * shell-wrapping form (e.g. `[ -x X ] && X || true` vs raw `X`).
 */
function commandMatches(left: string, right: string): boolean {
  if (left === right) return true
  const leftTarget = extractCommandTarget(left)
  return leftTarget !== null && extractCommandTarget(right) === leftTarget
}

/**
 * Ensure `group` is present in `groups`. If a group already contains a hook
 * with the same command target, update its metadata (matcher, timeout) but
 * preserve the consumer's materialized command form. If no matching hook is
 * found, append the group.
 */
export function ensureGroup(groups: HookGroup[], group: HookGroup): HookGroup[] {
  const incomingHook = group.hooks[0]
  if (!incomingHook) return groups

  let changed = false
  const nextGroups = groups.map((existingGroup) => {
    const hookIndex = findHookIndexByCommand(existingGroup.hooks, incomingHook.command)
    if (hookIndex === -1) return existingGroup

    changed = true
    const hooks = existingGroup.hooks.map((hook, index) =>
      index === hookIndex
        ? {
            ...hook,
            ...incomingHook,
            // Preserve the consumer's already-materialized command form when
            // only the matcher/timeout changed. Codex command path migration is
            // handled by normalizeCodexAgentKitCommands before this merge.
            command: hook.command,
          }
        : hook,
    )
    return {
      ...existingGroup,
      ...(group.matcher !== undefined ? { matcher: group.matcher } : {}),
      hooks,
    }
  })

  if (changed) return nextGroups
  return [...groups, group]
}

/**
 * Merge `addition` hook groups into `existing`, deduplicating via
 * `ensureGroup`. Returns a new HooksMap; does not mutate inputs.
 */
export function mergeAgentKitGroups(existing: HooksMap, addition: HooksMap): HooksMap {
  const result: HooksMap = { ...existing }
  for (const [event, groups] of Object.entries(addition)) {
    let target = result[event] ?? []
    for (const group of groups) {
      target = ensureGroup(target, group)
    }
    result[event] = target
  }
  return result
}
