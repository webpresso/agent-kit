import { mkdirSync, renameSync, existsSync } from 'node:fs'
import { dirname, join } from 'node:path'

import { readTrustedJsonFile } from '#shared-utils/read-json-file.js'
import { writeJsonFile } from '#shared-utils/write-json-file.js'
import { resolveManagedWorktreeRoot } from './location.js'

export type ManagedWorktreeKind = 'owner' | 'scratch'

export interface ManagedWorktreeEntry {
  readonly id: string
  readonly repoNamespace: string
  readonly repoRoot: string
  readonly repoOriginUrl?: string
  readonly kind: ManagedWorktreeKind
  readonly path: string
  readonly branch?: string
  readonly detached?: boolean
  readonly blueprintSlug?: string
  readonly createdAt: string
  readonly updatedAt: string
  readonly lastSeenAt?: string
}

export interface WorktreeRegistry {
  readonly version: 1
  readonly entries: ManagedWorktreeEntry[]
}

export interface RegistryOptions {
  readonly root?: string
  readonly now?: () => string
}

export interface PruneStaleWorktreeRegistryOptions extends RegistryOptions {
  readonly predicate?: (entry: ManagedWorktreeEntry) => boolean
}

function registryPath(root = resolveManagedWorktreeRoot()): string {
  return join(root, 'registry.json')
}

function emptyRegistry(): WorktreeRegistry {
  return { version: 1, entries: [] }
}

export function readWorktreeRegistry(options: RegistryOptions = {}): WorktreeRegistry {
  const path = registryPath(options.root)
  if (!existsSync(path)) return emptyRegistry()

  try {
    const parsed = readTrustedJsonFile<Partial<WorktreeRegistry>>(path)
    if (parsed.version !== 1 || !Array.isArray(parsed.entries)) return emptyRegistry()
    return {
      version: 1,
      entries: parsed.entries.filter(isRegistryEntry),
    }
  } catch {
    return emptyRegistry()
  }
}

function isRegistryEntry(value: unknown): value is ManagedWorktreeEntry {
  if (!value || typeof value !== 'object') return false
  const entry = value as Record<string, unknown>
  return (
    typeof entry.id === 'string' &&
    typeof entry.repoNamespace === 'string' &&
    typeof entry.repoRoot === 'string' &&
    (entry.kind === 'owner' || entry.kind === 'scratch') &&
    typeof entry.path === 'string' &&
    typeof entry.createdAt === 'string' &&
    typeof entry.updatedAt === 'string'
  )
}

export function writeWorktreeRegistry(
  registry: WorktreeRegistry,
  options: RegistryOptions = {},
): void {
  const path = registryPath(options.root)
  mkdirSync(dirname(path), { recursive: true })
  const tmpPath = `${path}.${process.pid}.${Date.now()}.tmp`
  writeJsonFile(tmpPath, registry)
  renameSync(tmpPath, path)
}

export function upsertWorktreeRegistryEntry(
  entry: Omit<ManagedWorktreeEntry, 'createdAt' | 'updatedAt'> & {
    readonly createdAt?: string
    readonly updatedAt?: string
  },
  options: RegistryOptions = {},
): ManagedWorktreeEntry {
  const now = options.now?.() ?? new Date().toISOString()
  const registry = readWorktreeRegistry(options)
  const existing = registry.entries.find((candidate) => candidate.id === entry.id)
  const next: ManagedWorktreeEntry = {
    ...entry,
    createdAt: entry.createdAt ?? existing?.createdAt ?? now,
    updatedAt: entry.updatedAt ?? now,
  }
  writeWorktreeRegistry(
    {
      version: 1,
      entries: [
        ...registry.entries.filter((candidate) => candidate.id !== entry.id),
        next,
      ].toSorted((a, b) => a.path.localeCompare(b.path)),
    },
    options,
  )
  return next
}

export function removeWorktreeRegistryEntries(
  predicate: (entry: ManagedWorktreeEntry) => boolean,
  options: RegistryOptions = {},
): ManagedWorktreeEntry[] {
  const registry = readWorktreeRegistry(options)
  const removed = registry.entries.filter(predicate)
  if (removed.length === 0) return []
  writeWorktreeRegistry(
    { version: 1, entries: registry.entries.filter((entry) => !predicate(entry)) },
    options,
  )
  return removed
}

export function pruneStaleWorktreeRegistryEntries(options: PruneStaleWorktreeRegistryOptions = {}): {
  kept: ManagedWorktreeEntry[]
  removed: ManagedWorktreeEntry[]
} {
  const registry = readWorktreeRegistry(options)
  const shouldPrune = (entry: ManagedWorktreeEntry): boolean =>
    !existsSync(entry.path) && (options.predicate?.(entry) ?? true)
  const kept = registry.entries.filter((entry) => !shouldPrune(entry))
  const removed = registry.entries.filter(shouldPrune)
  if (removed.length > 0) writeWorktreeRegistry({ version: 1, entries: kept }, options)
  return { kept, removed }
}

export function findWorktreeRegistryEntry(
  id: string,
  options: RegistryOptions = {},
): ManagedWorktreeEntry | null {
  return readWorktreeRegistry(options).entries.find((entry) => entry.id === id) ?? null
}
