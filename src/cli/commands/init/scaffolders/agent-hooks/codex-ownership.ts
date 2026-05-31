import { normalize } from 'node:path'

import type { CommandHookMetadata } from '#codex/app-server/types.js'

export const KNOWN_WEBPRESSO_CODEX_BINS = [
  'wp-sessionstart-routing',
  'wp-check-dev-link',
  'wp-pretool-guard',
  'wp-post-tool',
  'wp-guard-switch',
  'wp-stop-qa',
] as const

type KnownWebpressoCodexBin = (typeof KNOWN_WEBPRESSO_CODEX_BINS)[number]

const KNOWN_WEBPRESSO_CODEX_BIN_SET = new Set<string>(KNOWN_WEBPRESSO_CODEX_BINS)
const NODE_MODULES_BIN_PATTERN = /^(?:\.\/|\/.*\/)?node_modules\/\.bin\/([\w-]+)$/u
const GUARDED_NODE_MODULES_BIN_PATTERN =
  /^\[ -x (["']?)((?:\.\/|\/.*\/)?node_modules\/\.bin\/([\w-]+))\1 \] && \1\2\1 \|\| (?:true|printf .+)$/u
const MANAGED_LAUNCHER_PATTERN =
  /^(?:["']?)((?:\.\/|\/.*\/)?\.codex\/managed-hooks\/((?:wp|ak)-[\w-]+)\.sh)(?:["']?)$/u
const GUARDED_MANAGED_LAUNCHER_PATTERN =
  /^\[ -x (["']?)((?:\.\/|\/.*\/)?\.codex\/managed-hooks\/((?:wp|ak)-[\w-]+)\.sh)\1 \] && \1\2\1 \|\| (?:true|printf .+)$/u

export interface CodexHookOwnershipMetadata {
  readonly isManaged?: unknown
  readonly handlerType?: unknown
  readonly pluginId?: unknown
  readonly sourcePath?: unknown
  readonly command?: unknown
}

export function isWebpressoOwnedCodexHook(
  metadata: unknown,
  expectedSourcePaths: readonly string[],
): metadata is CommandHookMetadata {
  if (!isObject(metadata)) return false

  const candidate = metadata as CodexHookOwnershipMetadata
  if (candidate.isManaged !== false) return false
  if (candidate.handlerType !== 'command') return false
  if (candidate.pluginId !== null) return false
  if (typeof candidate.sourcePath !== 'string') return false
  if (typeof candidate.command !== 'string' || candidate.command.trim() === '') return false
  if (!isExpectedSourcePath(candidate.sourcePath, expectedSourcePaths)) return false

  const binName = extractDirectNodeModulesBin(candidate.command)
  return binName !== null && isKnownWebpressoCodexBin(binName)
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

function isKnownWebpressoCodexBin(binName: string): binName is KnownWebpressoCodexBin {
  return KNOWN_WEBPRESSO_CODEX_BIN_SET.has(binName)
}

function extractDirectNodeModulesBin(command: string): string | null {
  const normalizedCommand = stripSingleShellQuotePair(command.trim())
  const match = NODE_MODULES_BIN_PATTERN.exec(normalizedCommand)
  if (match?.[1]) return match[1]
  const managedLauncherMatch = MANAGED_LAUNCHER_PATTERN.exec(normalizedCommand)
  if (managedLauncherMatch?.[2]) return managedLauncherMatch[2]

  const guardedMatch = GUARDED_NODE_MODULES_BIN_PATTERN.exec(command.trim())
  if (guardedMatch?.[3]) return guardedMatch[3]

  const guardedManagedLauncherMatch = GUARDED_MANAGED_LAUNCHER_PATTERN.exec(command.trim())
  return guardedManagedLauncherMatch?.[3] ?? null
}

function stripSingleShellQuotePair(value: string): string {
  if (value.length < 2) return value
  const first = value[0]
  const last = value[value.length - 1]
  if ((first === '"' && last === '"') || (first === "'" && last === "'")) {
    return value.slice(1, -1)
  }
  return value
}
