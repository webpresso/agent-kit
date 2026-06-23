import { existsSync } from 'node:fs'
import { dirname, join, resolve } from 'node:path'

export const SECRETS_CONFIG_PATH = '.webpresso/secrets.config.json'

export const SECRET_VALUE_PATTERN =
  /(?:^|[\s"'`=:])(?:(?:sk|pk)(?=[-_0-9])|ghp|gho|ghu|ghs|ghr|dp\.st|napi_|pplx-|ctx7sk-)[-_a-zA-Z0-9./+=]{8,}/u

export type SecretsConfigMetadata = {
  readonly manager: 'doppler' | 'infisical'
  readonly projectId: string
  readonly projectLabel?: string
  readonly profiles?: Readonly<Record<string, { readonly environment: string }>>
}

const ALLOWED_SCHEMA_V1_KEYS = new Set([
  'schemaVersion',
  'providers',
  'profiles',
  'sinks',
  'projectLabel',
])
const FORBIDDEN_CONFIG_KEY =
  /(?:^|_)(?:token|secret|password|api[_-]?key|credential|private[_-]?key)(?:$|_)/iu
const PROJECT_ID_PATTERN = /^[a-z0-9][a-z0-9_-]{0,62}$/u

const FORBIDDEN_BASENAMES = new Set([
  '.dev.vars',
  '.dev.vars.example',
  'secrets.json',
  'credentials.json',
])

const FORBIDDEN_BASENAME_PATTERNS: readonly RegExp[] = [
  /^\.dev\.vars(?:\..+)?$/u,
  /^\.env(?:\..+)?$/u,
  /^.*\.pem$/u,
  /^.*\.p12$/u,
  /^.*\.key$/u,
  /^id_rsa(?:\.pub)?$/u,
  /^.*service-account.*\.json$/u,
]

function normalizePath(relativePath: string): string {
  return relativePath.replace(/\\/gu, '/')
}

function fileBasename(relativePath: string): string {
  const normalized = normalizePath(relativePath)
  return normalized.split('/').pop() ?? normalized
}

export function isForbiddenSecretBasename(name: string): boolean {
  if (name === '.env.example') return false
  if (FORBIDDEN_BASENAMES.has(name)) return true
  return FORBIDDEN_BASENAME_PATTERNS.some((pattern) => pattern.test(name))
}

export function isForbiddenWorkingTreePath(relativePath: string): boolean {
  const normalized = normalizePath(relativePath)
  if (normalized === SECRETS_CONFIG_PATH) return false
  if (isForbiddenSecretBasename(fileBasename(normalized))) return true
  return normalized === '.webpresso/secrets.json'
}

export function isForbiddenGitPath(relativePath: string): boolean {
  const normalized = normalizePath(relativePath)
  if (normalized === SECRETS_CONFIG_PATH) return false
  if (normalized.endsWith('/.git/webpresso/secrets.json')) return false
  if (isForbiddenSecretBasename(fileBasename(normalized))) return true
  if (normalized === '.webpresso/secrets.json') return true
  return normalized.includes('/.wrangler/') || normalized.startsWith('.wrangler/')
}

export function shouldScanGitFileForSecretValues(relativePath: string): boolean {
  if (/\.(?:test|spec)\.(?:ts|tsx|js|jsx|mjs|cjs)$/iu.test(relativePath)) return false
  return /\.(?:md|ts|tsx|js|mjs|cjs|json|ya?ml|toml|txt|sh)$/iu.test(relativePath)
}

export function resolveSecretsAuditRoot(rootDirectory: string = process.cwd()): string | null {
  const absoluteRoot = resolve(rootDirectory)

  let current = absoluteRoot
  while (true) {
    if (existsSync(join(current, SECRETS_CONFIG_PATH))) return current
    const parent = dirname(current)
    if (parent === current) return null
    current = parent
  }
}

function validateConfigKeys(
  obj: Record<string, unknown>,
  sourceLabel: string,
  allowedKeys: ReadonlySet<string>,
): void {
  for (const key of Object.keys(obj)) {
    if (!allowedKeys.has(key)) {
      throw new Error(`${sourceLabel}: unexpected key "${key}"`)
    }
    if (FORBIDDEN_CONFIG_KEY.test(key)) {
      throw new Error(`${sourceLabel}: key "${key}" looks like a secret name`)
    }
  }
}

function requireRecord(value: unknown, sourceLabel: string, name: string): Record<string, unknown> {
  if (typeof value !== 'object' || value === null || Array.isArray(value)) {
    throw new Error(`${sourceLabel}: "${name}" must be an object`)
  }
  return value as Record<string, unknown>
}

function buildProfilesMetadata(
  value: unknown,
  sourceLabel: string,
  allowedProviders?: ReadonlySet<string>,
): Readonly<Record<string, { readonly environment: string }>> | undefined {
  if (value === undefined) return undefined
  const profileEntries = requireRecord(value, sourceLabel, 'profiles')

  const profiles: Record<string, { readonly environment: string }> = {}
  for (const [profileId, profileValue] of Object.entries(profileEntries)) {
    if (typeof profileValue !== 'object' || profileValue === null || Array.isArray(profileValue)) {
      throw new Error(`${sourceLabel}: profile "${profileId}" must be an object`)
    }
    const profile = profileValue as Record<string, unknown>
    const provider = profile.provider
    if (allowedProviders && provider !== undefined) {
      if (typeof provider !== 'string' || !allowedProviders.has(provider)) {
        throw new Error(
          `${sourceLabel}: profile "${profileId}" references unknown provider "${String(provider)}"`,
        )
      }
    }
    const env = profile.environment
    if (typeof env !== 'string' || env.trim().length === 0) {
      throw new Error(`${sourceLabel}: profile "${profileId}" must set a non-empty "environment"`)
    }
    if (SECRET_VALUE_PATTERN.test(env)) {
      throw new Error(
        `${sourceLabel}: profile "${profileId}" environment must not contain secret values`,
      )
    }
    profiles[profileId] = { environment: env.trim() }
  }

  return profiles
}

function buildSchemaVersion1Metadata(
  obj: Record<string, unknown>,
  sourceLabel: string,
): SecretsConfigMetadata | null {
  if (obj.schemaVersion !== 1) return null
  validateConfigKeys(obj, sourceLabel, ALLOWED_SCHEMA_V1_KEYS)

  const providers = requireRecord(obj.providers, sourceLabel, 'providers')
  const defaultProvider = requireRecord(providers.default, sourceLabel, 'providers.default')
  const providerType = defaultProvider.type
  if (providerType !== 'doppler' && providerType !== 'infisical') {
    throw new Error(`${sourceLabel}: "providers.default.type" must be "doppler" or "infisical"`)
  }
  const manager: 'doppler' | 'infisical' = providerType
  const project = defaultProvider.project
  if (typeof project !== 'string' || project.length === 0) {
    throw new Error(`${sourceLabel}: "providers.default.project" must be a non-empty string`)
  }
  if (!PROJECT_ID_PATTERN.test(project)) {
    throw new Error(`${sourceLabel}: "providers.default.project" must be a valid project slug`)
  }

  const profiles = buildProfilesMetadata(obj.profiles, sourceLabel, new Set(Object.keys(providers)))
  const base: SecretsConfigMetadata = profiles
    ? { manager, projectId: project, profiles }
    : { manager, projectId: project }
  if (obj.projectLabel === undefined) return base
  if (typeof obj.projectLabel !== 'string' || obj.projectLabel.length === 0) {
    throw new Error(`${sourceLabel}: "projectLabel" must be a non-empty string when set`)
  }
  if (SECRET_VALUE_PATTERN.test(obj.projectLabel)) {
    throw new Error(`${sourceLabel} projectLabel must not contain secret values`)
  }
  return { ...base, projectLabel: obj.projectLabel }
}

export function parseSecretsConfigMetadata(
  raw: string,
  sourceLabel: string,
): SecretsConfigMetadata {
  if (SECRET_VALUE_PATTERN.test(raw)) {
    throw new Error(`${sourceLabel} must not contain secret values`)
  }

  let parsed: unknown
  try {
    parsed = JSON.parse(raw)
  } catch (error) {
    const detail = error instanceof Error ? error.message : String(error)
    throw new Error(`Invalid JSON in ${sourceLabel}: ${detail}`)
  }

  if (typeof parsed !== 'object' || parsed === null || Array.isArray(parsed)) {
    throw new Error(`${sourceLabel} must be a JSON object`)
  }

  const obj = parsed as Record<string, unknown>
  const schemaVersion1Metadata = buildSchemaVersion1Metadata(obj, sourceLabel)
  if (schemaVersion1Metadata) return schemaVersion1Metadata
  throw new Error(`${sourceLabel}: only schemaVersion 1 secret config is supported`)
}
