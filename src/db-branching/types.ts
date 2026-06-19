export type DbBranchProviderName = 'neon' | 'xata'
export type DbBranchProviderMode = 'managed' | 'future'

export interface DbBranchCapabilityDescriptor {
  readonly provider: DbBranchProviderName
  readonly mode: DbBranchProviderMode
  readonly supportsClone: boolean
  readonly supportsTtl: boolean
  readonly supportsCleanup: boolean
}

export interface ManagedDbBranchPlan {
  readonly kind: 'managed'
  readonly provider: DbBranchProviderName
  readonly branchName: string
  readonly connectionStringEnvVar: string
  readonly connectionStringSecretRef: string
  readonly smokeCommand: string
  readonly ttlSeconds: number
  readonly cleanupCommand: string
}

export interface SkippedDbBranchPlan {
  readonly kind: 'skip'
  readonly reason: string
  readonly evidence: string
}

export type DbBranchPlan = ManagedDbBranchPlan | SkippedDbBranchPlan

export interface CreateDbBranchPlanInput {
  readonly provider: DbBranchCapabilityDescriptor
  readonly branchName: string
  readonly connectionStringEnvVar: string
  readonly connectionStringSecretRef: string
  readonly smokeCommand: string
  readonly ttlSeconds: number
  readonly cleanupCommand: string
}

export interface CreateDbBranchSkipPlanInput {
  readonly reason: string
  readonly evidence: string
}

export function isDbBranchProviderDescriptor(
  value: unknown,
): value is DbBranchCapabilityDescriptor {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return false
  const candidate = value as Record<string, unknown>
  return (
    (candidate.provider === 'neon' || candidate.provider === 'xata')
    && (candidate.mode === 'managed' || candidate.mode === 'future')
    && typeof candidate.supportsClone === 'boolean'
    && typeof candidate.supportsTtl === 'boolean'
    && typeof candidate.supportsCleanup === 'boolean'
  )
}

function requireNonEmptyString(value: string, field: string): string {
  if (value.trim().length === 0) {
    throw new Error(`${field} must be a non-empty string`)
  }
  return value
}

export function createDbBranchPlan(input: CreateDbBranchPlanInput): ManagedDbBranchPlan {
  return {
    kind: 'managed',
    provider: input.provider.provider,
    branchName: requireNonEmptyString(input.branchName, 'branchName'),
    connectionStringEnvVar: requireNonEmptyString(
      input.connectionStringEnvVar,
      'connectionStringEnvVar',
    ),
    connectionStringSecretRef: requireNonEmptyString(
      input.connectionStringSecretRef,
      'connectionStringSecretRef',
    ),
    smokeCommand: requireNonEmptyString(input.smokeCommand, 'smokeCommand'),
    ttlSeconds:
      input.ttlSeconds > 0 ? input.ttlSeconds : (() => { throw new Error('ttlSeconds must be > 0') })(),
    cleanupCommand: requireNonEmptyString(input.cleanupCommand, 'cleanupCommand'),
  }
}

export function createDbBranchSkipPlan(
  input: CreateDbBranchSkipPlanInput,
): SkippedDbBranchPlan {
  return {
    kind: 'skip',
    reason: requireNonEmptyString(input.reason, 'reason'),
    evidence: requireNonEmptyString(input.evidence, 'evidence'),
  }
}
