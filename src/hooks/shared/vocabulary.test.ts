import { describe, expect, it } from 'vitest'

import { formatStatusLine, HOOK_STATUS, type HookStatusDetail } from './vocabulary.js'

describe('HOOK_STATUS', () => {
  it('all values are non-empty strings', () => {
    for (const value of Object.values(HOOK_STATUS)) {
      expect(typeof value).toStrictEqual('string')
      expect(value.length).toBeGreaterThan(0)
    }
  })

  it('all values are unique', () => {
    const values = Object.values(HOOK_STATUS)
    const unique = new Set(values)
    expect(unique.size).toStrictEqual(values.length)
  })
})

describe('formatStatusLine', () => {
  const base: HookStatusDetail = {
    hook: 'wp-pretool-guard',
    event: 'PreToolUse',
    vendor: 'claude',
    status: 'enforcing',
  }

  it('includes hook name', () => {
    const line = formatStatusLine(base)
    expect(line).toContain('wp-pretool-guard')
  })

  it('includes event', () => {
    const line = formatStatusLine(base)
    expect(line).toContain('PreToolUse')
  })

  it('includes vendor', () => {
    const line = formatStatusLine(base)
    expect(line).toContain('claude')
  })

  it('includes status', () => {
    const line = formatStatusLine(base)
    expect(line).toContain('enforcing')
  })

  it('includes reason when degraded', () => {
    const detail: HookStatusDetail = {
      ...base,
      status: 'degraded',
      reason: 'binary not found',
    }
    const line = formatStatusLine(detail)
    expect(line).toContain('binary not found')
  })

  it('includes nextCommand when present', () => {
    const detail: HookStatusDetail = {
      ...base,
      status: 'pending-trust',
      nextCommand: 'codex trust',
    }
    const line = formatStatusLine(detail)
    expect(line).toContain('codex trust')
  })

  it('does not include reason or nextCommand suffix when absent', () => {
    const line = formatStatusLine(base)
    expect(line).not.toContain('reason:')
    expect(line).not.toContain('→ run:')
  })
})
