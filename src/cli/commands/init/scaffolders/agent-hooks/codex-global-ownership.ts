import { normalize } from 'node:path'

import type { CommandHookMetadata } from '#codex/app-server/types.js'
import {
  MANAGED_OMX_GLOBAL_HOOK_BASENAME,
  extractManagedLauncherBasename,
} from './codex-global-normalize.js'

interface CodexGlobalHookOwnershipMetadata {
  readonly isManaged?: unknown
  readonly handlerType?: unknown
  readonly pluginId?: unknown
  readonly sourcePath?: unknown
  readonly command?: unknown
}

export function isPresetOwnedGlobalCodexHook(
  metadata: unknown,
  expectedSourcePaths: readonly string[],
): metadata is CommandHookMetadata {
  if (!isObject(metadata)) return false

  const candidate = metadata as CodexGlobalHookOwnershipMetadata
  if (candidate.isManaged !== false) return false
  if (candidate.handlerType !== 'command') return false
  if (candidate.pluginId !== null) return false
  if (typeof candidate.sourcePath !== 'string') return false
  if (typeof candidate.command !== 'string' || candidate.command.trim() === '') return false
  if (!isExpectedSourcePath(candidate.sourcePath, expectedSourcePaths)) return false

  return isOmxCodexCommand(candidate.command)
}

function isObject(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null
}

function isExpectedSourcePath(sourcePath: string, expectedSourcePaths: readonly string[]): boolean {
  if (expectedSourcePaths.length === 0) return false
  const normalizedSourcePath = normalize(sourcePath)
  return expectedSourcePaths.some(
    (expectedPath) => normalize(expectedPath) === normalizedSourcePath,
  )
}

function isOmxCodexCommand(command: string): boolean {
  const launcherBasename = extractManagedLauncherBasename(command)
  if (launcherBasename === MANAGED_OMX_GLOBAL_HOOK_BASENAME) return true
  return false
}
