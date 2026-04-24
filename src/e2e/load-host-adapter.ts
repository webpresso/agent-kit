import type { E2eHostAdapter } from './types.js'

import { existsSync } from 'node:fs'
import { dirname, resolve, parse } from 'node:path'
import { pathToFileURL } from 'node:url'

import {
  AGENT_KIT_CONFIG_EXPORT_NAME,
  AGENT_KIT_CONFIG_FILE_NAME,
  type AgentKitConfig,
  validateAgentKitConfig,
} from './config.js'
import { FALLBACK_HOST_ADAPTER_EXPORT_NAMES, isE2eHostAdapter } from './host-adapter.js'

export interface LoadAgentKitConfigOptions {
  cwd?: string
}

export interface LoadedAgentKitConfig {
  config: AgentKitConfig
  configPath: string
}

export interface LoadedHostAdapter extends LoadedAgentKitConfig {
  adapter: E2eHostAdapter
  exportName: string
  moduleSpecifier: string
}

export class AgentKitConfigLoadError extends Error {
  constructor(
    public readonly configPath: string,
    public readonly cause: Error,
  ) {
    super(
      `Failed to load ${AGENT_KIT_CONFIG_FILE_NAME} at ${configPath}: ${cause.message}`,
      cause instanceof Error ? { cause } : undefined,
    )
    this.name = 'AgentKitConfigLoadError'
  }
}

export class AgentKitConfigExportError extends Error {
  constructor(public readonly configPath: string) {
    super(
      `Expected ${AGENT_KIT_CONFIG_FILE_NAME} at ${configPath} to export ${AGENT_KIT_CONFIG_EXPORT_NAME}.`,
    )
    this.name = 'AgentKitConfigExportError'
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

export function getAgentKitConfigPath(cwd: string = process.cwd()): string {
  return resolve(cwd, AGENT_KIT_CONFIG_FILE_NAME)
}

export function resolveAgentKitConfigPath(cwd: string = process.cwd()): string {
  return findAgentKitConfigPath(cwd) ?? getAgentKitConfigPath(cwd)
}

export function findAgentKitConfigPath(cwd: string = process.cwd()): string | null {
  for (const searchDir of getSearchDirectories(cwd)) {
    const configPath = getAgentKitConfigPath(searchDir)
    if (existsSync(configPath)) {
      return configPath
    }
  }

  return null
}

export async function loadAgentKitConfig(
  options: LoadAgentKitConfigOptions = {},
): Promise<LoadedAgentKitConfig> {
  const configPath = resolveAgentKitConfigPath(options.cwd)
  const configModule = await loadModuleNamespace(pathToFileURL(configPath).href, (cause) => {
    throw new AgentKitConfigLoadError(configPath, cause)
  })

  if (!(AGENT_KIT_CONFIG_EXPORT_NAME in configModule)) {
    throw new AgentKitConfigExportError(configPath)
  }

  return {
    config: validateAgentKitConfig(configModule[AGENT_KIT_CONFIG_EXPORT_NAME], configPath),
    configPath,
  }
}

export async function loadAgentKitConfigSafe(
  options: LoadAgentKitConfigOptions = {},
): Promise<LoadedAgentKitConfig | null> {
  const configPath = findAgentKitConfigPath(options.cwd)
  if (!configPath) {
    return null
  }

  return loadAgentKitConfig({ cwd: dirname(configPath) })
}

export async function loadHostAdapter(
  options: LoadAgentKitConfigOptions = {},
): Promise<LoadedHostAdapter | null> {
  const loadedConfig = await loadAgentKitConfigSafe(options)
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
