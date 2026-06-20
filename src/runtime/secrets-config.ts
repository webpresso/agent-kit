import { execFileSync } from 'node:child_process'
import { existsSync, readFileSync } from 'node:fs'
import path from 'node:path'

export type SecretManagerName = 'doppler' | 'infisical'

export interface SecretsConfigProfile {
  readonly environment: string
}

export interface SecretsConfig {
  readonly manager: SecretManagerName
  readonly projectId: string
  readonly projectLabel?: string
  readonly profiles?: Readonly<Record<string, SecretsConfigProfile>>
}

const COMMITTED_RELATIVE_PATH = path.join('.webpresso', 'secrets.config.json')
const RUNTIME_RELATIVE_PATH = path.join('webpresso', 'secrets.json')

function resolveGitCommonDir(cwd: string): string | null {
  try {
    const out = execFileSync('git', ['rev-parse', '--git-common-dir'], {
      cwd,
      encoding: 'utf8',
      stdio: ['ignore', 'pipe', 'ignore'],
    }).trim()
    if (!out) return null
    return path.isAbsolute(out) ? out : path.resolve(cwd, out)
  } catch {
    return null
  }
}

export function getRuntimeSecretsConfigPath(cwd: string = process.cwd()): string | null {
  const gitDir = resolveGitCommonDir(cwd)
  return gitDir ? path.join(gitDir, RUNTIME_RELATIVE_PATH) : null
}

export function getCommittedSecretsConfigPath(cwd: string = process.cwd()): string {
  return path.join(cwd, COMMITTED_RELATIVE_PATH)
}

export function getPreferredSecretsConfigPath(cwd: string = process.cwd()): string {
  return getRuntimeSecretsConfigPath(cwd) ?? getCommittedSecretsConfigPath(cwd)
}

function isManager(value: unknown): value is SecretManagerName {
  return value === 'doppler' || value === 'infisical'
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
}

function parseProfiles(
  value: unknown,
  source: string,
): Readonly<Record<string, SecretsConfigProfile>> | undefined {
  if (value === undefined) return undefined
  if (!isRecord(value)) {
    throw new Error(`Malformed secrets config at ${source}: "profiles" must be an object`)
  }

  const profiles: Record<string, SecretsConfigProfile> = {}
  for (const [profileId, profileValue] of Object.entries(value)) {
    if (!isRecord(profileValue)) {
      throw new Error(
        `Malformed secrets config at ${source}: profile "${profileId}" must be an object`,
      )
    }
    const environment = profileValue.environment
    if (typeof environment !== 'string' || environment.trim().length === 0) {
      throw new Error(
        `Malformed secrets config at ${source}: profile "${profileId}" must set a non-empty "environment"`,
      )
    }
    profiles[profileId] = { environment: environment.trim() }
  }

  return profiles
}

function parseConfig(raw: string, source: string): SecretsConfig {
  let parsed: unknown
  try {
    parsed = JSON.parse(raw)
  } catch (error) {
    const detail = error instanceof Error ? error.message : String(error)
    throw new Error(`Malformed secrets config at ${source}: ${detail}`)
  }

  if (!isRecord(parsed)) {
    throw new Error(`Malformed secrets config at ${source}: expected object`)
  }

  const obj = parsed
  if (!isManager(obj.manager)) {
    throw new Error(
      `Malformed secrets config at ${source}: "manager" must be "doppler" or "infisical"`,
    )
  }
  if (typeof obj.projectId !== 'string' || obj.projectId.length === 0) {
    throw new Error(`Malformed secrets config at ${source}: "projectId" must be a non-empty string`)
  }

  return {
    manager: obj.manager,
    projectId: obj.projectId,
    ...(typeof obj.projectLabel === 'string' && obj.projectLabel.length > 0
      ? { projectLabel: obj.projectLabel }
      : {}),
    ...(parseProfiles(obj.profiles, source) ? { profiles: parseProfiles(obj.profiles, source) } : {}),
  }
}

function mergeSecretsConfigs(
  committedConfig: SecretsConfig | null,
  runtimeConfig: SecretsConfig | null,
): SecretsConfig | null {
  if (!committedConfig && !runtimeConfig) return null
  if (!committedConfig) return runtimeConfig
  if (!runtimeConfig) return committedConfig

  return {
    manager: runtimeConfig.manager,
    projectId: runtimeConfig.projectId,
    ...(runtimeConfig.projectLabel ?? committedConfig.projectLabel
      ? { projectLabel: runtimeConfig.projectLabel ?? committedConfig.projectLabel }
      : {}),
    ...(committedConfig.profiles ?? runtimeConfig.profiles
      ? { profiles: committedConfig.profiles ?? runtimeConfig.profiles }
      : {}),
  }
}

export function readSecretsConfig(cwd: string = process.cwd()): SecretsConfig | null {
  const runtimePath = getRuntimeSecretsConfigPath(cwd)
  const committedPath = getCommittedSecretsConfigPath(cwd)

  const runtimeConfig =
    runtimePath && existsSync(runtimePath) ? parseConfig(readFileSync(runtimePath, 'utf8'), runtimePath) : null
  const committedConfig = existsSync(committedPath)
    ? parseConfig(readFileSync(committedPath, 'utf8'), committedPath)
    : null

  return mergeSecretsConfigs(committedConfig, runtimeConfig)
}

export function resolveSecretsConfigProfile(
  profileId: string,
  cwd: string = process.cwd(),
): SecretsConfigProfile {
  const config = readSecretsConfig(cwd)
  if (!config) {
    throw new Error('No secret manager configured.\nRun: wp config secrets setup')
  }
  const normalizedProfileId = profileId.trim()
  const profile = config.profiles?.[normalizedProfileId]
  if (!profile) {
    throw new Error(
      `Unknown secret profile "${normalizedProfileId}" in ${getCommittedSecretsConfigPath(cwd)}`,
    )
  }
  return profile
}

export function resolveSecretsConfigProfileEnvironment(
  profileId: string,
  cwd: string = process.cwd(),
): string {
  return resolveSecretsConfigProfile(profileId, cwd).environment
}
