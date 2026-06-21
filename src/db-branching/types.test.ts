import { describe, expect, it } from 'vitest'

import {
  createDbBranchPlan,
  createDbBranchSkipPlan,
  isDbBranchProviderDescriptor,
  type DbBranchCapabilityDescriptor,
} from './types.js'

describe('isDbBranchProviderDescriptor', () => {
  it('accepts the current Neon capability descriptor', () => {
    const descriptor = {
      provider: 'neon',
      mode: 'managed',
      supportsClone: true,
      supportsTtl: true,
      supportsCleanup: true,
    } satisfies DbBranchCapabilityDescriptor

    expect(isDbBranchProviderDescriptor(descriptor)).toBe(true)
  })

  it('accepts the future Xata capability descriptor', () => {
    const descriptor = {
      provider: 'xata',
      mode: 'future',
      supportsClone: true,
      supportsTtl: true,
      supportsCleanup: true,
    } satisfies DbBranchCapabilityDescriptor

    expect(isDbBranchProviderDescriptor(descriptor)).toBe(true)
  })
})

describe('createDbBranchPlan', () => {
  it('creates a DB-present plan with connection string, smoke, TTL, and cleanup', () => {
    expect(
      createDbBranchPlan({
        provider: {
          provider: 'neon',
          mode: 'managed',
          supportsClone: true,
          supportsTtl: true,
          supportsCleanup: true,
        },
        branchName: 'preview/pr-123',
        connectionStringEnvVar: 'DATABASE_URL',
        connectionStringSecretRef: 'neon://preview/pr-123',
        smokeCommand: 'psql "$DATABASE_URL" -c "select 1"',
        ttlSeconds: 86400,
        cleanupCommand: 'wp cleanup preview --db-branch preview/pr-123',
      }),
    ).toEqual({
      kind: 'managed',
      provider: 'neon',
      branchName: 'preview/pr-123',
      connectionStringEnvVar: 'DATABASE_URL',
      connectionStringSecretRef: 'neon://preview/pr-123',
      smokeCommand: 'psql "$DATABASE_URL" -c "select 1"',
      ttlSeconds: 86400,
      cleanupCommand: 'wp cleanup preview --db-branch preview/pr-123',
    })
  })

  it('rejects managed plans without cleanup evidence', () => {
    expect(() =>
      createDbBranchPlan({
        provider: {
          provider: 'neon',
          mode: 'managed',
          supportsClone: true,
          supportsTtl: true,
          supportsCleanup: true,
        },
        branchName: 'preview/pr-123',
        connectionStringEnvVar: 'DATABASE_URL',
        connectionStringSecretRef: 'neon://preview/pr-123',
        smokeCommand: 'psql "$DATABASE_URL" -c "select 1"',
        ttlSeconds: 86400,
        cleanupCommand: '',
      }),
    ).toThrow('cleanupCommand')
  })
})

describe('createDbBranchSkipPlan', () => {
  it('creates the silent no-db skip evidence for non-DB apps', () => {
    expect(
      createDbBranchSkipPlan({
        reason: 'No DB sink declared for this app.',
        evidence: 'db-branch capability absent in secrets config',
      }),
    ).toEqual({
      kind: 'skip',
      reason: 'No DB sink declared for this app.',
      evidence: 'db-branch capability absent in secrets config',
    })
  })
})
