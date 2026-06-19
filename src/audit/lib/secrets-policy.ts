export const SECRETS_CONFIG_PATH = '.webpresso/secrets.config.json'

export const SECRET_VALUE_PATTERN =
  /(?:^|[\s"'`=:])(?:(?:sk|pk)(?=[-_0-9])|ghp|gho|ghu|ghs|ghr|dp\.st|napi_|pplx-|ctx7sk-)[-_a-zA-Z0-9./+=]{8,}/u

export type SecretsConfigMetadata = {
  readonly manager: 'doppler' | 'infisical'
  readonly projectId: string
  readonly projectLabel?: string
}

const V1_ALLOWED_CONFIG_KEYS = new Set(['schemaVersion', 'providers', 'profiles', 'sinks'])
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
  if (/\.(?:test|spec|e2e)\.(?:ts|tsx|js|jsx|mjs|cjs)$/iu.test(relativePath)) return false
  return /\.(?:md|ts|tsx|js|mjs|cjs|json|ya?ml|toml|txt|sh)$/iu.test(relativePath)
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
  if (obj.schemaVersion === 1) {
    for (const key of Object.keys(obj)) {
      if (!V1_ALLOWED_CONFIG_KEYS.has(key)) {
        throw new Error(`${sourceLabel}: unexpected key "${key}"`)
      }
    }
    const providers = obj.providers
    if (typeof providers !== 'object' || providers === null || Array.isArray(providers)) {
      throw new Error(`${sourceLabel}: "providers" must be an object`)
    }
    const defaultProvider = (providers as Record<string, unknown>).default
    if (typeof defaultProvider !== 'object' || defaultProvider === null || Array.isArray(defaultProvider)) {
      throw new Error(`${sourceLabel}: "providers.default" must be an object`)
    }
    const provider = defaultProvider as Record<string, unknown>
    if (provider.type !== 'doppler' && provider.type !== 'infisical') {
      throw new Error(`${sourceLabel}: "providers.default.type" must be "doppler" or "infisical"`)
    }
    if (typeof provider.project !== 'string' || provider.project.length === 0) {
      throw new Error(`${sourceLabel}: "providers.default.project" must be a non-empty string`)
    }
    if (!PROJECT_ID_PATTERN.test(provider.project)) {
      throw new Error(`${sourceLabel}: "providers.default.project" must be a valid project slug`)
    }
    return {
      manager: provider.type,
      projectId: provider.project,
      projectLabel: typeof provider.project === 'string' ? provider.project : undefined,
    }
  }

  throw new Error(`${sourceLabel}: only schemaVersion 1 secret orchestration configs are supported`)
}
