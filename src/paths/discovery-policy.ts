import { relative, sep } from 'node:path'

export type DiscoveryContext = 'testDiscovery' | 'diskAuditWalk' | 'packageSurface'

export const RUNTIME_SURFACE_DIRS = [
  '_worktrees',
  '.agent',
  '.agents',
  '.claude',
  '.codex',
  '.cursor',
  '.omc',
  '.omx',
  '.opencode',
  'logs',
] as const

export const BUILD_OUTPUT_DIRS = [
  'build',
  'coverage',
  'dist',
  'node_modules',
  'target',
  '.next',
  '.stryker-tmp',
  '.webpresso-packed-surface',
  '.wrangler',
] as const

export const CACHE_DIRS = [
  '.git',
  '.cache',
  '.idea',
  '.output',
  '.temp',
  '.turbo',
  'temp',
  'tmp',
] as const

const CONTEXT_DIRS: Record<DiscoveryContext, readonly string[]> = {
  testDiscovery: [...RUNTIME_SURFACE_DIRS, ...BUILD_OUTPUT_DIRS, ...CACHE_DIRS],
  diskAuditWalk: [...RUNTIME_SURFACE_DIRS, ...BUILD_OUTPUT_DIRS, ...CACHE_DIRS],
  packageSurface: [...RUNTIME_SURFACE_DIRS, ...BUILD_OUTPUT_DIRS, ...CACHE_DIRS],
}

export interface ShouldSkipDirectoryOptions {
  /**
   * Explicit targets, such as `wp test --cwd _worktrees/foo`, are already
   * scoped to the requested root and must not be blocked merely because one of
   * their parent directories is normally runtime-generated.
   */
  readonly allowRuntimeSurfaces?: boolean
}

export function ignoreBasenamesFor(context: DiscoveryContext): readonly string[] {
  return CONTEXT_DIRS[context]
}

export function globIgnorePatternsFor(context: DiscoveryContext): readonly string[] {
  return ignoreBasenamesFor(context).flatMap((name) => [`${name}/**`, `**/${name}/**`])
}

export function isRuntimeSurfacePath(path: string): boolean {
  const normalized = normalizeRelativePath(path)
  const parts = normalized.split('/')
  return parts.some((part) => (RUNTIME_SURFACE_DIRS as readonly string[]).includes(part))
}

export function shouldSkipDirectory(
  context: DiscoveryContext,
  basename: string,
  relativePath: string = basename,
  options: ShouldSkipDirectoryOptions = {},
): boolean {
  if (
    options.allowRuntimeSurfaces &&
    (RUNTIME_SURFACE_DIRS as readonly string[]).includes(basename)
  ) {
    return false
  }

  const names = ignoreBasenamesFor(context)
  if (names.includes(basename)) return true

  const normalized = normalizeRelativePath(relativePath)
  return normalized
    .split('/')
    .some((part) => names.includes(part) && !(options.allowRuntimeSurfaces && isRuntimeSurface(part)))
}

export function relativeDiscoveryPath(root: string, target: string): string {
  return normalizeRelativePath(relative(root, target))
}

function isRuntimeSurface(name: string): boolean {
  return (RUNTIME_SURFACE_DIRS as readonly string[]).includes(name)
}

function normalizeRelativePath(path: string): string {
  return path.split(sep).join('/').replace(/^\.\/+/u, '')
}
