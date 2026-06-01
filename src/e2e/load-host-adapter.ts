import type { E2eHostAdapter } from './types.js'

import { existsSync } from 'node:fs'
import { dirname, resolve, parse } from 'node:path'
import { pathToFileURL } from 'node:url'

import {
  WEBPRESSO_CONFIG_CANDIDATES,
  WEBPRESSO_CONFIG_EXPORT_NAME,
  WEBPRESSO_CONFIG_FILE_NAME,
  type WebpressoConfig,
  validateWebpressoConfig,
} from './config.js'
import { FALLBACK_HOST_ADAPTER_EXPORT_NAMES, isE2eHostAdapter } from './host-adapter.js'

export interface LoadWebpressoConfigOptions {
  cwd?: string
}

export interface LoadedWebpressoConfig {
  config: WebpressoConfig
  configPath: string
}

export interface LoadedHostAdapter extends LoadedWebpressoConfig {
  adapter: E2eHostAdapter
  exportName: string
  moduleSpecifier: string
}

export class WebpressoConfigLoadError extends Error {
  constructor(
    public readonly configPath: string,
    public readonly cause: Error,
  ) {
    super(
      `Failed to load ${WEBPRESSO_CONFIG_FILE_NAME} at ${configPath}: ${cause.message}`,
      cause instanceof Error ? { cause } : undefined,
    )
    this.name = 'WebpressoConfigLoadError'
  }
}

export class WebpressoConfigExportError extends Error {
  constructor(
    public readonly configPath: string,
    public readonly exportName: string = WEBPRESSO_CONFIG_EXPORT_NAME,
  ) {
    super(`Expected config at ${configPath} to export ${exportName}.`)
    this.name = 'WebpressoConfigExportError'
  }
}

export class HostAdapterModuleLoadError extends Error {
  constructor(
    public readonly moduleSpecifier: string,
    public readonly configPath: string,
    public readonly cause: Error,
  ) {
    super(
      `Failed to load E2E host adapter module "${moduleSpecifier}" from ${configPath}: ${cause.message}`,
      cause instanceof Error ? { cause } : undefined,
    )
    this.name = 'HostAdapterModuleLoadError'
  }
}

export class HostAdapterExportError extends Error {
  constructor(
    public readonly moduleSpecifier: string,
    public readonly availableExports: readonly string[],
    public readonly attemptedExports: readonly string[],
  ) {
    const availableSummary =
      availableExports.length > 0 ? availableExports.join(', ') : '<no exports>'
    const attemptedSummary = attemptedExports.join(', ')

    super(
      `E2E host adapter module "${moduleSpecifier}" does not export a valid adapter. Tried ${attemptedSummary}. Available exports: ${availableSummary}.`,
    )
    this.name = 'HostAdapterExportError'
  }
}

export function getWebpressoConfigPath(cwd: string = process.cwd()): string {
  return resolve(cwd, WEBPRESSO_CONFIG_FILE_NAME)
}

export function resolveWebpressoConfigPath(cwd: string = process.cwd()): string {
  return findWebpressoConfigPath(cwd) ?? getWebpressoConfigPath(cwd)
}

export function findWebpressoConfigPath(cwd: string = process.cwd()): string | null {
  for (const searchDir of getSearchDirectories(cwd)) {
    for (const candidate of WEBPRESSO_CONFIG_CANDIDATES) {
      const configPath = resolve(searchDir, candidate.fileName)
      if (existsSync(configPath)) {
        return configPath
      }
    }
  }

  return null
}

export async function loadWebpressoConfig(
  options: LoadWebpressoConfigOptions = {},
): Promise<LoadedWebpressoConfig> {
  const configPath = resolveWebpressoConfigPath(options.cwd)
  const configModule = await loadModuleNamespace(pathToFileURL(configPath).href, (cause) => {
    throw new WebpressoConfigLoadError(configPath, cause)
  })
  const exportName = expectedConfigExportName(configPath)

  if (!(exportName in configModule)) {
    throw new WebpressoConfigExportError(configPath, exportName)
  }

  return {
    config: validateWebpressoConfig(configModule[exportName], configPath),
    configPath,
  }
}

export async function loadWebpressoConfigSafe(
  options: LoadWebpressoConfigOptions = {},
): Promise<LoadedWebpressoConfig | null> {
  const configPath = findWebpressoConfigPath(options.cwd)
  if (!configPath) {
    return null
  }

  return loadWebpressoConfig({ cwd: dirname(configPath) })
}

export async function loadHostAdapter(
  options: LoadWebpressoConfigOptions = {},
): Promise<LoadedHostAdapter | null> {
  const loadedConfig = await loadWebpressoConfigSafe(options)
  if (!loadedConfig?.config.e2e) {
    return null
  }

  const moduleSpecifier = resolveModuleSpecifier(
    loadedConfig.config.e2e.hostAdapterModule,
    loadedConfig.configPath,
  )
  const hostAdapterModule = await loadModuleNamespace(moduleSpecifier, (cause) => {
    throw new HostAdapterModuleLoadError(moduleSpecifier, loadedConfig.configPath, cause)
  })
  const exportNames = getHostAdapterExportLookupOrder(loadedConfig.config.e2e.hostAdapterExport)

  for (const exportName of exportNames) {
    if (!(exportName in hostAdapterModule)) {
      continue
    }

    const candidate = hostAdapterModule[exportName]
    if (isE2eHostAdapter(candidate)) {
      return {
        ...loadedConfig,
        adapter: candidate,
        exportName,
        moduleSpecifier,
      }
    }
  }

  throw new HostAdapterExportError(moduleSpecifier, Object.keys(hostAdapterModule), exportNames)
}

export async function loadConfiguredHostAdapter(
  cwd: string = process.cwd(),
): Promise<LoadedHostAdapter | null> {
  return loadHostAdapter({ cwd })
}

function getHostAdapterExportLookupOrder(explicitExportName?: string): string[] {
  return explicitExportName
    ? [explicitExportName, ...FALLBACK_HOST_ADAPTER_EXPORT_NAMES]
    : [...FALLBACK_HOST_ADAPTER_EXPORT_NAMES]
}

function getSearchDirectories(cwd: string): string[] {
  const absoluteStart = resolve(cwd)
  const rootDir = parse(absoluteStart).root
  const directories: string[] = []
  let current = absoluteStart

  while (true) {
    directories.push(current)
    if (current === rootDir) {
      return directories
    }

    current = dirname(current)
  }
}

function resolveModuleSpecifier(moduleSpecifier: string, configPath: string): string {
  if (moduleSpecifier.startsWith('file:')) {
    return moduleSpecifier
  }

  if (moduleSpecifier.startsWith('.') || moduleSpecifier.startsWith('/')) {
    return pathToFileURL(resolve(dirname(configPath), moduleSpecifier)).href
  }

  return moduleSpecifier
}

function expectedConfigExportName(configPath: string): string {
  const candidate = WEBPRESSO_CONFIG_CANDIDATES.find((item) =>
    configPath.endsWith(item.fileName),
  )
  return candidate?.exportName ?? WEBPRESSO_CONFIG_EXPORT_NAME
}

async function loadModuleNamespace(
  moduleSpecifier: string,
  onError: (cause: Error) => never,
): Promise<Record<string, unknown>> {
  try {
    const moduleNamespace = await import(moduleSpecifier)
    return moduleNamespace as Record<string, unknown>
  } catch (error) {
    onError(error as Error)
  }
}
