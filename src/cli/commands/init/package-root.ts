import { existsSync } from 'node:fs'
import { isAbsolute, join, posix, win32 } from 'node:path'
import { fileURLToPath } from 'node:url'

export interface ResolveAgentKitPackageRootOptions {
  readonly moduleUrl?: string
  readonly execPath?: string
  readonly argv0?: string
  readonly argv1?: string
  readonly pathEnv?: string
  readonly pathExtEnv?: string
  readonly platform?: NodeJS.Platform
  readonly requireCatalog?: boolean
}

function existingModulePath(moduleUrl: string | undefined): string | null {
  if (typeof moduleUrl !== 'string' || moduleUrl.length === 0) return null
  try {
    return fileURLToPath(moduleUrl)
  } catch {
    return null
  }
}

function isRunnablePath(path: string | undefined): path is string {
  if (typeof path !== 'string' || path.length === 0) return false
  return isAbsolute(path) || win32.isAbsolute(path) || path.includes('/') || path.includes('\\')
}

function pathModuleForPlatform(platform: NodeJS.Platform): typeof posix | typeof win32 {
  return platform === 'win32' ? win32 : posix
}

function pathDelimiterForPlatform(platform: NodeJS.Platform): string {
  return platform === 'win32' ? ';' : ':'
}

function resolveBinOnPath(
  binName: string,
  pathEnv: string | undefined,
  options: { readonly pathExtEnv?: string; readonly platform?: NodeJS.Platform } = {},
): string | null {
  if (binName.length === 0 || typeof pathEnv !== 'string' || pathEnv.length === 0) return null
  const platform = options.platform ?? process.platform
  const pathExtEnv = options.pathExtEnv ?? process.env.PATHEXT
  const pathModule = pathModuleForPlatform(platform)
  const candidates =
    platform === 'win32' && !/\.[^./\\]+$/u.test(binName)
      ? [
          binName,
          ...(typeof pathExtEnv === 'string' && pathExtEnv.length > 0
            ? pathExtEnv
                .split(';')
                .map((entry) => entry.trim())
                .filter((entry) => entry.length > 0)
                .map((entry) => `${binName}${entry.toLowerCase()}`)
            : [`${binName}.exe`, `${binName}.cmd`, `${binName}.bat`]),
        ]
      : [binName]
  for (const entry of pathEnv.split(pathDelimiterForPlatform(platform))) {
    if (entry.length === 0) continue
    for (const binCandidate of candidates) {
      for (const candidate of new Set([
        pathModule.join(entry, binCandidate),
        join(entry, binCandidate),
      ])) {
        if (existsSync(candidate)) return candidate
      }
    }
  }
  return null
}

export function isAgentKitPackageRoot(
  dir: string,
  options: { readonly requireCatalog?: boolean } = {},
): boolean {
  if (!existsSync(join(dir, 'package.json'))) return false
  if (options.requireCatalog === true && !existsSync(join(dir, 'catalog'))) return false

  return (
    existsSync(join(dir, 'bin', 'wp')) ||
    existsSync(join(dir, 'bin', 'wp.cmd')) ||
    existsSync(join(dir, 'bin', 'wp.exe')) ||
    existsSync(join(dir, '.claude-plugin', 'plugin.json')) ||
    existsSync(join(dir, 'src', 'cli', 'cli.ts')) ||
    existsSync(join(dir, 'dist', 'esm', 'cli', 'cli.js'))
  )
}

export function findAgentKitPackageRoot(
  startPath: string | undefined,
  options: { readonly requireCatalog?: boolean; readonly platform?: NodeJS.Platform } = {},
): string | null {
  if (!isRunnablePath(startPath)) return null

  const platform = options.platform ?? process.platform
  const pathModule = pathModuleForPlatform(platform)
  let dir = pathModule.dirname(startPath)
  for (let depth = 0; depth < 10; depth++) {
    if (isAgentKitPackageRoot(dir, options)) return dir
    const parent = pathModule.dirname(dir)
    if (parent === dir) break
    dir = parent
  }
  return null
}

export function resolveAgentKitPackageRoot(
  options: ResolveAgentKitPackageRootOptions = {},
): string | null {
  const modulePath = existingModulePath(options.moduleUrl ?? import.meta.url)
  const execPath = options.execPath ?? process.execPath
  const argv0 = options.argv0 ?? process.argv[0]
  const argv1 = options.argv1 ?? process.argv[1]
  const pathEnv = options.pathEnv ?? process.env.PATH
  const platform = options.platform ?? process.platform
  const pathModule = pathModuleForPlatform(platform)
  const pathResolvedBin = resolveBinOnPath(pathModule.basename(argv0 || 'wp'), pathEnv, {
    pathExtEnv: options.pathExtEnv,
    platform,
  })
  const requireCatalog = options.requireCatalog

  for (const startPath of [modulePath, argv1, execPath, pathResolvedBin, argv0]) {
    const root = findAgentKitPackageRoot(startPath ?? undefined, { requireCatalog, platform })
    if (root) return root
  }
  return null
}

export function resolveAgentKitPackageRootOrThrow(
  errorMessage: string,
  options: ResolveAgentKitPackageRootOptions = {},
): string {
  const root = resolveAgentKitPackageRoot(options)
  if (root) return root
  throw new Error(errorMessage)
}
