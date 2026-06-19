import { describe, expect, it } from 'vitest'

import {
  CAPABILITY_KEYS,
  CAPABILITY_REGISTRY,
  assertNoUnbackedMeasuredClaim,
  crossCheckAgainstReferenceParity,
  validateRegistry,
} from './capability-registry.js'

import type { CapabilityRow, CapabilityStatus } from './capability-registry.js'

describe('CAPABILITY_REGISTRY', () => {
  it('contains every CAPABILITY_KEY exactly once', () => {
    const keys = CAPABILITY_REGISTRY.map((row) => row.key)
    expect(keys.sort()).toStrictEqual([...CAPABILITY_KEYS].sort())
  })

  it('has no duplicate keys', () => {
    const keys = CAPABILITY_REGISTRY.map((row) => row.key)
    const unique = new Set(keys)
    expect(unique.size).toStrictEqual(keys.length)
  })

  it('compaction must not be measured', () => {
    const row = CAPABILITY_REGISTRY.find((r) => r.key === 'compaction')
    expect(row?.status).not.toStrictEqual('measured')
  })

  it('rtk_totals is not_applicable', () => {
    const row = CAPABILITY_REGISTRY.find((r) => r.key === 'rtk_totals')
    expect(row?.status).toStrictEqual('not_applicable')
  })
})

describe('validateRegistry', () => {
  it('returns empty array for the built-in CAPABILITY_REGISTRY', () => {
    expect(validateRegistry(CAPABILITY_REGISTRY)).toStrictEqual([])
  })

  it('returns error when a measured row has no artifactPath', () => {
    const rows: readonly CapabilityRow[] = [
      ...CAPABILITY_REGISTRY.filter((r) => r.key !== 'execute'),
      { key: 'execute', status: 'measured' as CapabilityStatus },
    ]
    const errors = validateRegistry(rows)
    expect(errors.length).toBeGreaterThan(0)
    expect(errors.some((e) => e.includes('execute'))).toStrictEqual(true)
  })

  it('returns error when compaction has status measured', () => {
    const rows: readonly CapabilityRow[] = [
      ...CAPABILITY_REGISTRY.filter((r) => r.key !== 'compaction'),
      {
        key: 'compaction',
        status: 'measured' as CapabilityStatus,
        artifactPath: 'some/path',
      },
    ]
    const errors = validateRegistry(rows)
    expect(errors.length).toBeGreaterThan(0)
    expect(errors.some((e) => e.includes('compaction'))).toStrictEqual(true)
  })

  it('returns error when a CAPABILITY_KEY is missing from the registry', () => {
    const rows = CAPABILITY_REGISTRY.filter((r) => r.key !== 'search')
    const errors = validateRegistry(rows)
    expect(errors.length).toBeGreaterThan(0)
    expect(errors.some((e) => e.includes('search'))).toStrictEqual(true)
  })
})

describe('crossCheckAgainstReferenceParity', () => {
  it('returns mismatch when docs claim execute as measured but registry has it degraded', () => {
    const docsText = 'execute: measured\nsome other content'
    const mismatches = crossCheckAgainstReferenceParity(docsText, CAPABILITY_REGISTRY)
    expect(mismatches.length).toBeGreaterThan(0)
    expect(mismatches.some((m) => m.includes('execute'))).toStrictEqual(true)
  })

  it('returns empty when docs text has no measured claims', () => {
    const docsText = 'execute: degraded\nbatch_execute: planned'
    const mismatches = crossCheckAgainstReferenceParity(docsText, CAPABILITY_REGISTRY)
    expect(mismatches).toStrictEqual([])
  })
})

describe('assertNoUnbackedMeasuredClaim', () => {
  it('returns violation when docs claim execute as measured without a measured+artifactPath row', () => {
    const docsText = 'execute: measured\nsome content'
    const violations = assertNoUnbackedMeasuredClaim(docsText, CAPABILITY_REGISTRY)
    expect(violations.length).toBeGreaterThan(0)
    expect(violations.some((v) => v.includes('execute'))).toStrictEqual(true)
  })

  it('returns empty violations for clean docs with no measured claims', () => {
    const docsText = 'execute: degraded\nbatch_execute: planned\nno measured capabilities here'
    const violations = assertNoUnbackedMeasuredClaim(docsText, CAPABILITY_REGISTRY)
    expect(violations).toStrictEqual([])
  })

  it('returns empty for docs claiming measured for a capability that is actually measured with artifactPath', () => {
    const rows: readonly CapabilityRow[] = [
      ...CAPABILITY_REGISTRY.filter((r) => r.key !== 'execute'),
      { key: 'execute', status: 'measured' as CapabilityStatus, artifactPath: 'some/artifact.ts' },
    ]
    const docsText = 'execute: measured'
    const violations = assertNoUnbackedMeasuredClaim(docsText, rows)
    expect(violations).toStrictEqual([])
  })
})
