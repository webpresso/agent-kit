import { describe, expect, it } from 'vitest'

import { buildDenyEnvelope, buildInfraDenyEnvelope } from '#hooks/shared/types'

describe('buildDenyEnvelope', () => {
  it('produces valid JSON with permissionDecision: deny', () => {
    const envelope = buildDenyEnvelope({ reason: 'Command is forbidden' })
    expect(envelope.hookSpecificOutput.permissionDecision).toStrictEqual('deny')
    expect(envelope.hookSpecificOutput.hookEventName).toStrictEqual('PreToolUse')
    expect(envelope.hookSpecificOutput.permissionDecisionReason).toStrictEqual('Command is forbidden')
    // Must be serialisable
    expect(() => JSON.stringify(envelope)).not.toThrow()
  })

  it('includes logId in output when provided', () => {
    const envelope = buildDenyEnvelope({ reason: 'Blocked', logId: 'abc12345' })
    expect(envelope.logId).toStrictEqual('abc12345')
    const json = JSON.parse(JSON.stringify(envelope)) as Record<string, unknown>
    expect(json['logId']).toStrictEqual('abc12345')
  })

  it('omits logId from output when not provided (no undefined keys)', () => {
    const envelope = buildDenyEnvelope({ reason: 'Blocked' })
    expect('logId' in envelope).toBe(false)
    const json = JSON.stringify(envelope)
    expect(json).not.toContain('logId')
  })

  it('omits escapeHatch from output when not provided (no undefined keys)', () => {
    const envelope = buildDenyEnvelope({ reason: 'Blocked' })
    expect('escapeHatch' in envelope).toBe(false)
    const json = JSON.stringify(envelope)
    expect(json).not.toContain('escapeHatch')
  })

  it('includes escapeHatch when provided', () => {
    const envelope = buildDenyEnvelope({
      reason: 'Blocked',
      escapeHatch: 'Add to allowlist.md',
    })
    expect(envelope.escapeHatch).toStrictEqual('Add to allowlist.md')
  })

  it('includes both logId and escapeHatch when both provided', () => {
    const envelope = buildDenyEnvelope({
      reason: 'Blocked',
      logId: 'deadbeef',
      escapeHatch: 'wp setup',
    })
    expect(envelope.logId).toStrictEqual('deadbeef')
    expect(envelope.escapeHatch).toStrictEqual('wp setup')
  })
})

describe('buildInfraDenyEnvelope', () => {
  it('sets isInfraFailure: true', () => {
    const envelope = buildInfraDenyEnvelope({ reason: 'Guard binary missing' })
    expect(envelope.isInfraFailure).toBe(true)
  })

  it('sets permissionDecision: deny', () => {
    const envelope = buildInfraDenyEnvelope({ reason: 'Guard binary missing' })
    expect(envelope.hookSpecificOutput.permissionDecision).toStrictEqual('deny')
  })

  it('sets escapeHatch to wp setup', () => {
    const envelope = buildInfraDenyEnvelope({ reason: 'Guard binary missing' })
    expect(envelope.escapeHatch).toStrictEqual('wp setup')
  })

  it('includes the reason in permissionDecisionReason', () => {
    const envelope = buildInfraDenyEnvelope({ reason: 'Guard binary missing' })
    expect(envelope.hookSpecificOutput.permissionDecisionReason).toStrictEqual('Guard binary missing')
  })

  it('is serialisable to valid JSON', () => {
    const envelope = buildInfraDenyEnvelope({ reason: 'Guard binary missing' })
    expect(() => JSON.stringify(envelope)).not.toThrow()
  })
})
