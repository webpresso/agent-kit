import { mkdtempSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { basename, join } from 'node:path'

export type CiActSecretProfileId = 'none' | 'github-api' | 'neon-control-plane'

export interface CiActSecretProfile {
  readonly id: CiActSecretProfileId
  readonly description: string
  readonly allowedKeys: readonly string[]
  readonly requiredKeys: readonly string[]
  readonly defaultSources: readonly string[]
}

export interface ResolveCiActSecretProfileOptions {
  readonly workflowPath?: string
  readonly jobName?: string
  readonly explicitProfileId?: string
}

const CI_ACT_SECRET_PROFILES: Record<CiActSecretProfileId, CiActSecretProfile> = {
  none: {
    id: 'none',
    description: 'No secrets are injected.',
    allowedKeys: [],
    requiredKeys: [],
    defaultSources: [],
  },
  'github-api': {
    id: 'github-api',
    description: 'GitHub API token surface.',
    allowedKeys: ['GITHUB_TOKEN', 'GITHUB_PAT'],
    requiredKeys: [],
    defaultSources: [],
  },
  'neon-control-plane': {
    id: 'neon-control-plane',
    description: 'Neon control-plane secrets.',
    allowedKeys: ['NEON_API_KEY', 'NEON_PROJECT_ID', 'NEON_PARENT_BRANCH_ID'],
    requiredKeys: ['NEON_API_KEY', 'NEON_PROJECT_ID', 'NEON_PARENT_BRANCH_ID'],
    defaultSources: [],
  },
}

const WORKFLOW_PROFILES: Readonly<Record<string, CiActSecretProfileId>> = {
  'ci.yml': 'none',
  'testing-e2e.yml': 'none',
  'testing-e2e-act.yml': 'none',
  'cleanup-stale-neon-e2e-branches.yml': 'neon-control-plane',
}

export function isCiActSecretProfileId(value: string): value is CiActSecretProfileId {
  return value in CI_ACT_SECRET_PROFILES
}

export function getCiActSecretProfile(profileId: CiActSecretProfileId): CiActSecretProfile {
  return CI_ACT_SECRET_PROFILES[profileId]
}

function resolveJobSecretProfile(jobName?: string): CiActSecretProfileId | undefined {
  if (!jobName) return undefined
  if (jobName === 'cleanup') return 'neon-control-plane'
  return undefined
}

export function resolveCiActSecretProfile(
  options: ResolveCiActSecretProfileOptions,
): CiActSecretProfile {
  if (options.explicitProfileId && isCiActSecretProfileId(options.explicitProfileId)) {
    return getCiActSecretProfile(options.explicitProfileId)
  }

  const workflowName = options.workflowPath ? basename(options.workflowPath) : undefined
  const workflowProfile = workflowName ? WORKFLOW_PROFILES[workflowName] : undefined
  const jobProfile = resolveJobSecretProfile(options.jobName)
  return getCiActSecretProfile(jobProfile ?? workflowProfile ?? 'none')
}

export function pickAllowedSecrets(
  secretMap: Record<string, string>,
  allowedKeys: readonly string[],
): Record<string, string> {
  if (allowedKeys.length === 0) return {}
  return Object.fromEntries(
    allowedKeys.flatMap((key) => {
      const value = secretMap[key]
      return typeof value === 'string' && value.length > 0 ? [[key, value] as const] : []
    }),
  )
}

export function listMissingRequiredSecrets(
  secretMap: Record<string, string>,
  requiredKeys: readonly string[],
): string[] {
  return requiredKeys.filter((key) => {
    const value = secretMap[key]
    return typeof value !== 'string' || value.length === 0
  })
}

export function normalizeActSecretsWithOptions(
  secretMaps: Array<Record<string, string>>,
  options: { mapGithubPatToToken: boolean },
): Record<string, string> {
  const merged: Record<string, string> = {}
  for (const map of secretMaps) {
    for (const [key, value] of Object.entries(map)) {
      if (value.length > 0) merged[key] = value
    }
  }
  if (options.mapGithubPatToToken && !merged.GITHUB_TOKEN && merged.GITHUB_PAT) {
    merged.GITHUB_TOKEN = merged.GITHUB_PAT
  }
  return merged
}

export function renderSecretsFile(secretMap: Record<string, string>): string {
  return Object.entries(secretMap)
    .toSorted(([a], [b]) => a.localeCompare(b))
    .map(([key, value]) => `${key}=${JSON.stringify(value)}`)
    .join('\n')
}

export function injectDefaultActArgs(
  args: string[],
  platform = process.platform,
  arch = process.arch,
): string[] {
  const hasArchitectureFlag = args.includes('--container-architecture')
  if (platform === 'darwin' && arch === 'arm64' && !hasArchitectureFlag) {
    return ['--container-architecture', 'linux/amd64', ...args]
  }
  return args
}

export interface TempSecretsFile {
  readonly path: string
  cleanup(): void
}

export function writeTempSecretsFile(secretMap: Record<string, string>): TempSecretsFile {
  const dir = mkdtempSync(join(tmpdir(), 'wp-ci-act-'))
  const path = join(dir, 'secrets.env')
  writeFileSync(path, `${renderSecretsFile(secretMap)}\n`, { encoding: 'utf8', mode: 0o600 })
  return {
    path,
    cleanup() {
      rmSync(dir, { recursive: true, force: true })
    },
  }
}
