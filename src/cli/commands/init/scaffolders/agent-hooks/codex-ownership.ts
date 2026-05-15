import { normalize } from 'node:path'

import type { CommandHookMetadata } from '#codex/app-server/types.js'

export const KNOWN_AGENT_KIT_CODEX_BINS = [
  'ak-sessionstart-routing',
  'ak-check-dev-link',
  'ak-pretool-guard',
  'ak-post-tool',
  'ak-guard-switch',
  'ak-stop-qa',
] as const

type KnownAgentKitCodexBin = (typeof KNOWN_AGENT_KIT_CODEX_BINS)[number]

const KNOWN_AGENT_KIT_CODEX_BIN_SET = new Set<string>(KNOWN_AGENT_KIT_CODEX_BINS)
const NODE_MODULES_BIN_PATTERN = /^(?:\.\/|\/.*\/)?node_modules\/\.bin\/([\w-]+)$/u
const GUARDED_NODE_MODULES_BIN_PATTERN =
  /^\[ -x (["']?)((?:\.\/|\/.*\/)?node_modules\/\.bin\/([\w-]+))\1 \] && \1\2\1 \|\| true$/u

export interface CodexHookOwnershipMetadata {
  readonly isManaged?: unknown
  readonly handlerType?: unknown
  readonly pluginId?: unknown
  readonly sourcePath?: unknown
  readonly command?: unknown
}

export function isAgentKitOwnedCodexHook(
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
  return binName !== null && isKnownAgentKitCodexBin(binName)
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

function isKnownAgentKitCodexBin(binName: string): binName is KnownAgentKitCodexBin {
  return KNOWN_AGENT_KIT_CODEX_BIN_SET.has(binName)
}

function extractDirectNodeModulesBin(command: string): string | null {
  const normalizedCommand = stripSingleShellQuotePair(command.trim())
  const match = NODE_MODULES_BIN_PATTERN.exec(normalizedCommand)
  if (match?.[1]) return match[1]

  const guardedMatch = GUARDED_NODE_MODULES_BIN_PATTERN.exec(command.trim())
  return guardedMatch?.[3] ?? null
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
