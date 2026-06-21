import { execFileSync } from 'node:child_process'
import { existsSync, readFileSync } from 'node:fs'
import path from 'node:path'

export type SecretManagerName = 'doppler' | 'infisical'

export interface SecretsConfigProfile {
  readonly environment: string
}

const SECRET_VALUE_PATTERN =
  /(?:^|[\s"'`=:])(?:(?:sk|pk)(?=[-_0-9])|ghp|gho|ghu|ghs|ghr|dp\.st|napi_|pplx-|ctx7sk-)[-_a-zA-Z0-9./+=]{8,}/u
const SECRET_VALUE_PATTERN_GLOBAL =
  /(?:^|[\s"'`=:])(?:(?:sk|pk)(?=[-_0-9])|ghp|gho|ghu|ghs|ghr|dp\.st|napi_|pplx-|ctx7sk-)[-_a-zA-Z0-9./+=]{8,}/gu

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

function resolveGitTopLevel(cwd: string): string | null {
  try {
    const out = execFileSync('git', ['rev-parse', '--show-toplevel'], {
      cwd,
      encoding: 'utf8',
      stdio: ['ignore', 'pipe', 'ignore'],
    }).trim()
    return out || null
  } catch {
    return null
  }
}

function findCommittedSecretsConfigPath(cwd: string): string {
  const gitRoot = resolveGitTopLevel(cwd)
  if (gitRoot) return path.join(gitRoot, COMMITTED_RELATIVE_PATH)

  let current = path.resolve(cwd)
  while (true) {
    const candidate = path.join(current, COMMITTED_RELATIVE_PATH)
    if (existsSync(candidate)) return candidate
    const parent = path.dirname(current)
    if (parent === current) return path.join(path.resolve(cwd), COMMITTED_RELATIVE_PATH)
    current = parent
  }
}

export function getCommittedSecretsConfigPath(cwd: string = process.cwd()): string {
  return findCommittedSecretsConfigPath(cwd)
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

export function isSecretLikeMetadataText(value: string): boolean {
  return SECRET_VALUE_PATTERN.test(value)
}

export function sanitizeSecretsMetadataText(value: string): string {
  return value.replace(SECRET_VALUE_PATTERN_GLOBAL, '[redacted]')
}

function assertNoSecretValue(value: string, source: string, label: string): void {
  if (isSecretLikeMetadataText(value)) {
    throw new Error(
      `Malformed secrets config at ${source}: ${label} must not contain secret values`,
    )
  }
}

function parseProfiles(
  value: unknown,
  source: string,
  allowedProviders?: ReadonlySet<string>,
): Readonly<Record<string, SecretsConfigProfile>> | undefined {
  if (value === undefined) return undefined
  if (!isRecord(value)) {
    throw new Error(`Malformed secrets config at ${source}: "profiles" must be an object`)
  }

  const profiles: Record<string, SecretsConfigProfile> = {}
  for (const [profileId, profileValue] of Object.entries(value)) {
    assertNoSecretValue(profileId, source, 'profile id')
    if (!isRecord(profileValue)) {
      throw new Error(
        `Malformed secrets config at ${source}: profile "${profileId}" must be an object`,
      )
    }
    const provider = profileValue.provider
    if (typeof provider === 'string') {
      assertNoSecretValue(provider, source, `profile "${profileId}" provider`)
    }
    if (allowedProviders && provider !== undefined) {
      if (typeof provider !== 'string' || !allowedProviders.has(provider)) {
        throw new Error(
          `Malformed secrets config at ${source}: profile "${profileId}" references an unknown provider`,
        )
      }
    }
    const environment = profileValue.environment
    if (typeof environment !== 'string' || environment.trim().length === 0) {
      throw new Error(
        `Malformed secrets config at ${source}: profile "${profileId}" must set a non-empty "environment"`,
      )
    }
    const normalizedEnvironment = environment.trim()
    assertNoSecretValue(normalizedEnvironment, source, `profile "${profileId}" environment`)
    profiles[profileId] = { environment: normalizedEnvironment }
  }

  return profiles
}

function parseSchemaVersion1Config(
  obj: Record<string, unknown>,
  source: string,
): SecretsConfig | null {
  if (obj.schemaVersion !== 1) return null
  const providers = isRecord(obj.providers) ? obj.providers : null
  const providerMap = providers ? new Set(Object.keys(providers)) : new Set<string>()
  const defaultProvider = providers && isRecord(providers.default) ? providers.default : null
  if (!defaultProvider) {
    throw new Error(`Malformed secrets config at ${source}: "providers.default" must be an object`)
  }
  if (!isManager(defaultProvider.type)) {
    throw new Error(
      `Malformed secrets config at ${source}: "providers.default.type" must be "doppler" or "infisical"`,
    )
  }
  if (typeof defaultProvider.project !== 'string' || defaultProvider.project.length === 0) {
    throw new Error(
      `Malformed secrets config at ${source}: "providers.default.project" must be a non-empty string`,
    )
  }
  assertNoSecretValue(defaultProvider.project, source, 'providers.default.project')
  return {
    manager: defaultProvider.type,
    projectId: defaultProvider.project,
    ...(typeof obj.projectLabel === 'string' && obj.projectLabel.length > 0
      ? (assertNoSecretValue(obj.projectLabel, source, 'projectLabel'),
        { projectLabel: obj.projectLabel })
      : {}),
    ...(parseProfiles(obj.profiles, source, providerMap)
      ? { profiles: parseProfiles(obj.profiles, source, providerMap) }
      : {}),
  }
}

function parseConfig(raw: string, source: string): SecretsConfig {
  if (SECRET_VALUE_PATTERN.test(raw)) {
    throw new Error(
      `Malformed secrets config at ${source}: metadata must not contain secret values`,
    )
  }

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
  const schemaVersion1Config = parseSchemaVersion1Config(obj, source)
  if (schemaVersion1Config) return schemaVersion1Config

  if (!isManager(obj.manager)) {
    throw new Error(
      `Malformed secrets config at ${source}: "manager" must be "doppler" or "infisical"`,
    )
  }
  if (typeof obj.projectId !== 'string' || obj.projectId.length === 0) {
    throw new Error(`Malformed secrets config at ${source}: "projectId" must be a non-empty string`)
  }
  assertNoSecretValue(obj.projectId, source, 'projectId')

  return {
    manager: obj.manager,
    projectId: obj.projectId,
    ...(typeof obj.projectLabel === 'string' && obj.projectLabel.length > 0
      ? (assertNoSecretValue(obj.projectLabel, source, 'projectLabel'),
        { projectLabel: obj.projectLabel })
      : {}),
    ...(parseProfiles(obj.profiles, source)
      ? { profiles: parseProfiles(obj.profiles, source) }
      : {}),
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
    ...((runtimeConfig.projectLabel ?? committedConfig.projectLabel)
      ? { projectLabel: runtimeConfig.projectLabel ?? committedConfig.projectLabel }
      : {}),
    ...((committedConfig.profiles ?? runtimeConfig.profiles)
      ? { profiles: committedConfig.profiles ?? runtimeConfig.profiles }
      : {}),
  }
}

export function readSecretsConfig(cwd: string = process.cwd()): SecretsConfig | null {
  const runtimePath = getRuntimeSecretsConfigPath(cwd)
  const committedPath = getCommittedSecretsConfigPath(cwd)

  const runtimeConfig =
    runtimePath && existsSync(runtimePath)
      ? parseConfig(readFileSync(runtimePath, 'utf8'), runtimePath)
      : null
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
    const safeProfileId = isSecretLikeMetadataText(normalizedProfileId)
      ? '[redacted]'
      : normalizedProfileId
    throw new Error(
      `Unknown secret profile "${safeProfileId}" in ${getCommittedSecretsConfigPath(cwd)}`,
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
