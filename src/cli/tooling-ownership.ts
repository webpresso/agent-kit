import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs'
import { dirname } from 'node:path'

import { getSurfacePath, NotInGitRepoError } from '#paths/state-root.js'

export const TOOLING_OWNERSHIP_FILENAME = 'tooling-ownership.json'

export const MANAGED_TOOL_NAMES = ['omx', 'omc', 'gstack'] as const
export type ManagedToolName = (typeof MANAGED_TOOL_NAMES)[number]

export interface ToolingOwnershipRecord {
  readonly managedBy: 'wp'
}

export interface ToolingOwnershipEntry {
  readonly user?: ToolingOwnershipRecord
  readonly projects?: readonly string[]
}

export interface ToolingOwnershipState {
  readonly version: 1
  readonly tools: Partial<Record<ManagedToolName, ToolingOwnershipEntry>>
}

function normalizeProjects(value: unknown): string[] | undefined {
  if (!Array.isArray(value)) return undefined
  const projects = [...new Set(value.filter((item): item is string => typeof item === 'string'))]
  return projects.length > 0 ? projects : undefined
}

function normalizeEntry(value: unknown): ToolingOwnershipEntry | undefined {
  if (value === null || typeof value !== 'object') return undefined
  const raw = value as {
    user?: { managedBy?: unknown }
    projects?: unknown
  }
  const user = raw.user?.managedBy === 'wp' ? { managedBy: 'wp' as const } : undefined
  const projects = normalizeProjects(raw.projects)
  if (!user && !projects) return undefined
  return {
    ...(user ? { user } : {}),
    ...(projects ? { projects } : {}),
  }
}

export function defaultToolingOwnershipState(): ToolingOwnershipState {
  return { version: 1, tools: {} }
}

export function normalizeToolingOwnershipState(parsed: unknown): ToolingOwnershipState {
  if (parsed === null || typeof parsed !== 'object') return defaultToolingOwnershipState()
  const raw = parsed as {
    version?: unknown
    tools?: Partial<Record<ManagedToolName, unknown>>
  }
  if (raw.version !== 1 || raw.tools === null || typeof raw.tools !== 'object') {
    return defaultToolingOwnershipState()
  }

  const tools = Object.fromEntries(
    MANAGED_TOOL_NAMES.flatMap((tool) => {
      const normalized = normalizeEntry(raw.tools?.[tool])
      return normalized ? [[tool, normalized]] : []
    }),
  ) as ToolingOwnershipState['tools']

  return { version: 1, tools }
}

export function defaultToolingOwnershipPath(): string {
  return getSurfacePath(TOOLING_OWNERSHIP_FILENAME, 'user')
}

export function readToolingOwnershipState(path = defaultToolingOwnershipPath()): ToolingOwnershipState {
  try {
    return normalizeToolingOwnershipState(JSON.parse(readFileSync(path, 'utf8')))
  } catch {
    return defaultToolingOwnershipState()
  }
}

export function writeToolingOwnershipState(
  state: ToolingOwnershipState,
  path = defaultToolingOwnershipPath(),
): void {
  mkdirSync(dirname(path), { recursive: true })
  writeFileSync(path, `${JSON.stringify(state, null, 2)}\n`, 'utf8')
}

function nextEntry(
  existing: ToolingOwnershipEntry | undefined,
  update: Partial<{ user: ToolingOwnershipRecord; projects: readonly string[] | undefined }>,
): ToolingOwnershipEntry | undefined {
  const projects = update.projects ?? existing?.projects
  const user = update.user ?? existing?.user
  if (!user && (!projects || projects.length === 0)) return undefined
  return {
    ...(user ? { user } : {}),
    ...(projects && projects.length > 0 ? { projects } : {}),
  }
}

export function claimUserOwnedTool(
  state: ToolingOwnershipState,
  tool: ManagedToolName,
): ToolingOwnershipState {
  return {
    ...state,
    tools: {
      ...state.tools,
      [tool]: nextEntry(state.tools[tool], { user: { managedBy: 'wp' } }),
    },
  }
}

export function claimProjectOwnedTool(
  state: ToolingOwnershipState,
  tool: Extract<ManagedToolName, 'omx' | 'omc'>,
  repoKey: string,
): ToolingOwnershipState {
  const projects = [...new Set([...(state.tools[tool]?.projects ?? []), repoKey])].toSorted()
  return {
    ...state,
    tools: {
      ...state.tools,
      [tool]: nextEntry(state.tools[tool], { projects }),
    },
  }
}

export function clearProjectOwnedTool(
  state: ToolingOwnershipState,
  tool: Extract<ManagedToolName, 'omx' | 'omc'>,
  repoKey: string,
): ToolingOwnershipState {
  const projects = (state.tools[tool]?.projects ?? []).filter((entry) => entry !== repoKey)
  const next = nextEntry(state.tools[tool], { projects })
  const tools = { ...state.tools }
  if (next) tools[tool] = next
  else delete tools[tool]
  return { ...state, tools }
}

export function isUserOwnedTool(
  state: ToolingOwnershipState,
  tool: ManagedToolName,
): boolean {
  return state.tools[tool]?.user?.managedBy === 'wp'
}

export function isProjectOwnedTool(
  state: ToolingOwnershipState,
  tool: Extract<ManagedToolName, 'omx' | 'omc'>,
  repoKey: string | null,
): boolean {
  if (!repoKey) return false
  return (state.tools[tool]?.projects ?? []).includes(repoKey)
}

export function hasAnyOwnership(state: ToolingOwnershipState, tool: ManagedToolName): boolean {
  const entry = state.tools[tool]
  return Boolean(entry?.user || (entry?.projects?.length ?? 0) > 0)
}

export function tryReadRepoKey(
  cwd: string,
  getSurfaceRepoPath: (name: string, scope: 'repo', cwd: string) => string = getSurfacePath,
): string | null {
  try {
    const repoPath = getSurfaceRepoPath('.probe', 'repo', cwd)
    return repoPath.split('/').at(-2) ?? null
  } catch (error) {
    if (error instanceof NotInGitRepoError) return null
    throw error
  }
}

export function toolingOwnershipFileExists(path = defaultToolingOwnershipPath()): boolean {
  return existsSync(path)
}
