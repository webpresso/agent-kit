import { spawn, spawnSync, type SpawnOptions, type SpawnSyncOptions } from 'node:child_process'
import path from 'node:path'

import { fetchSecretsForConfig } from './secret-managers.js'
import { isDirectRuntimeProfile, isRuntimeProfile, type RuntimeProfile } from './profiles.js'
import { readSecretsConfig } from './secrets-config.js'

export type RuntimeSelector = RuntimeProfile | string

export interface RuntimeEnvCache {
  readonly values: Map<string, Record<string, string>>
}

export interface ResolveRuntimeEnvironmentOptions {
  readonly cwd?: string
  readonly profile?: RuntimeSelector
  readonly environment?: string
  readonly env?: NodeJS.ProcessEnv
  readonly cache?: RuntimeEnvCache
}

export interface RuntimeSpawnOptions {
  readonly cwd?: string
  readonly profile?: RuntimeSelector
  readonly environment?: string
  readonly env?: NodeJS.ProcessEnv
  readonly cache?: RuntimeEnvCache
}

export interface RuntimeCommandOptions extends RuntimeSpawnOptions {
  readonly command: string
  readonly args?: readonly string[]
  readonly stdio?: SpawnSyncOptions['stdio']
}

export function createRuntimeEnvCache(): RuntimeEnvCache {
  return { values: new Map() }
}

export function buildRuntimeProcessEnv(
  cwd: string = process.cwd(),
  baseEnv: NodeJS.ProcessEnv = process.env,
  injectedEnv: Record<string, string> = {},
): NodeJS.ProcessEnv {
  const localBin = path.join(cwd, 'node_modules', '.bin')
  const currentPath = baseEnv.PATH?.trim()
  const nextPath = currentPath
    ? currentPath.split(path.delimiter).includes(localBin)
      ? currentPath
      : `${localBin}${path.delimiter}${currentPath}`
    : localBin

  return {
    ...baseEnv,
    ...injectedEnv,
    PATH: nextPath,
  }
}

function normalizeProfileSelector(profile: RuntimeSelector | undefined): string | undefined {
  const trimmed = profile?.trim()
  return trimmed && trimmed.length > 0 ? trimmed : undefined
}

function isCanonicalSecretProfile(
  profile: string | undefined,
): profile is Exclude<RuntimeProfile, 'none'> {
  return profile !== undefined && isRuntimeProfile(profile) && profile !== 'none'
}

function normalizeEnvironmentSelector(environment: string | undefined): string | undefined {
  const trimmed = environment?.trim()
  return trimmed && trimmed.length > 0 ? trimmed : undefined
}

function resolveEnvironmentSelector(
  profile: string | undefined,
  environment: string | undefined,
): string | undefined {
  const explicitEnvironment = normalizeEnvironmentSelector(environment)
  if (explicitEnvironment) return explicitEnvironment
  if (!profile) return undefined
  return isCanonicalSecretProfile(profile) ? undefined : undefined
}

export function resolveRuntimeEnvironment(
  options: ResolveRuntimeEnvironmentOptions = {},
): Record<string, string> {
  const cwd = options.cwd ?? process.cwd()
  const profile = normalizeProfileSelector(options.profile)

  if (isDirectRuntimeProfile(profile)) {
    return {}
  }

  const config = readSecretsConfig(cwd)
  if (!config) {
    if (!profile) return {}
    throw new Error('No secret manager configured.\nRun: wp config secrets setup')
  }

  const cache = options.cache ?? createRuntimeEnvCache()
  const environmentSelector = resolveEnvironmentSelector(profile, options.environment)
  const cacheKey = `${cwd}::${config.manager}::${config.projectId}::${environmentSelector ?? '<default>'}`
  const cached = cache.values.get(cacheKey)
  if (cached) return { ...cached }

  const resolved = fetchSecretsForConfig(config, { cwd, environment: environmentSelector })
  cache.values.set(cacheKey, resolved)
  return { ...resolved }
}

export function buildRuntimeSpawnOptions(options: RuntimeSpawnOptions = {}): {
  cwd: string
  env: NodeJS.ProcessEnv
  cache: RuntimeEnvCache
} {
  const cwd = options.cwd ?? process.cwd()
  const cache = options.cache ?? createRuntimeEnvCache()
  const resolvedEnv = resolveRuntimeEnvironment({
    cwd,
    profile: options.profile,
    environment: options.environment,
    env: options.env,
    cache,
  })

  return {
    cwd,
    env: buildRuntimeProcessEnv(cwd, options.env ?? process.env, resolvedEnv),
    cache,
  }
}

export function spawnRuntimeCommandSync(
  options: RuntimeCommandOptions,
): ReturnType<typeof spawnSync> {
  const prepared = buildRuntimeSpawnOptions(options)
  return spawnSync(options.command, [...(options.args ?? [])], {
    cwd: prepared.cwd,
    env: prepared.env,
    stdio: options.stdio ?? 'inherit',
    shell: false,
  })
}

export function spawnRuntimeCommand(
  command: string,
  args: readonly string[] = [],
  options: RuntimeSpawnOptions & Pick<SpawnOptions, 'stdio' | 'signal'> = {},
) {
  const prepared = buildRuntimeSpawnOptions(options)
  return spawn(command, [...args], {
    cwd: prepared.cwd,
    env: prepared.env,
    stdio: options.stdio ?? 'inherit',
    signal: options.signal,
    detached: process.platform !== 'win32',
    shell: false,
  })
}
