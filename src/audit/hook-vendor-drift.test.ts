import { describe, expect, test } from 'vitest'

import { detectDrift } from './hook-vendor-drift.js'

describe('detectDrift', () => {
  test('empty installed events + non-empty matrix → warnings for each full entry', () => {
    const findings = detectDrift({ claude: new Set(), codex: new Set() })
    // CAPABILITY_MATRIX has multiple events with claude='full' and codex='full'
    const claudeWarnings = findings.filter((f) => f.vendor === 'claude' && f.severity === 'warning')
    const codexWarnings = findings.filter((f) => f.vendor === 'codex' && f.severity === 'warning')
    expect(claudeWarnings.length).toBeGreaterThan(0)
    expect(codexWarnings.length).toBeGreaterThan(0)
    // No errors — installed is empty, so no undocumented events
    const errors = findings.filter((f) => f.severity === 'error')
    expect(errors).toStrictEqual([])
  })

  test('all matrix full-events installed for claude → no claude warnings', () => {
    // The CAPABILITY_MATRIX events with claude='full'
    const claudeFullEvents = new Set([
      'SessionStart',
      'PreToolUse',
      'PostToolUse',
      'UserPromptSubmit',
      'Stop',
    ])
    const findings = detectDrift({ claude: claudeFullEvents, codex: new Set() })
    const claudeWarnings = findings.filter((f) => f.vendor === 'claude' && f.severity === 'warning')
    expect(claudeWarnings).toStrictEqual([])
    // Codex still has warnings (empty)
    const codexWarnings = findings.filter((f) => f.vendor === 'codex' && f.severity === 'warning')
    expect(codexWarnings.length).toBeGreaterThan(0)
  })

  test('unknown event in installed claude hooks → error finding', () => {
    const findings = detectDrift({
      claude: new Set(['UnknownEvent']),
      codex: new Set(),
    })
    const errors = findings.filter((f) => f.severity === 'error' && f.vendor === 'claude')
    expect(errors).toHaveLength(1)
    expect(errors[0]).toStrictEqual({
      event: 'UnknownEvent',
      vendor: 'claude',
      expected: 'absent',
      actual: 'present',
      severity: 'error',
    })
  })

  test('unknown event in installed codex hooks → error finding', () => {
    const findings = detectDrift({
      claude: new Set(),
      codex: new Set(['GhostEvent']),
    })
    const errors = findings.filter((f) => f.severity === 'error' && f.vendor === 'codex')
    expect(errors).toHaveLength(1)
    expect(errors[0]).toStrictEqual({
      event: 'GhostEvent',
      vendor: 'codex',
      expected: 'absent',
      actual: 'present',
      severity: 'error',
    })
  })

  test('happy path: all matrix events installed, no unknown events → no findings', () => {
    const allFullEvents = new Set([
      'SessionStart',
      'PreToolUse',
      'PostToolUse',
      'UserPromptSubmit',
      'Stop',
    ])
    const findings = detectDrift({ claude: allFullEvents, codex: allFullEvents })
    // Only warnings possible: entries where support != 'full' but event is installed
    // (no errors since all events are in the matrix). Warnings only fire when
    // support='full' but event is absent — here all events are present.
    const warnings = findings.filter((f) => f.severity === 'warning')
    expect(warnings).toStrictEqual([])
    const errors = findings.filter((f) => f.severity === 'error')
    expect(errors).toStrictEqual([])
  })

  test('only warnings → exitCode is 0 (pure logic, no file I/O needed)', () => {
    // detectDrift returning only warnings should result in exitCode=0
    // We verify this through the finding shapes — the caller (auditHookVendorDrift)
    // computes exitCode from findings.some(f => f.severity === 'error')
    const findings = detectDrift({ claude: new Set(), codex: new Set() })
    const hasError = findings.some((f) => f.severity === 'error')
    expect(hasError).toBe(false)
  })

  test('error finding → exitCode would be 1', () => {
    const findings = detectDrift({
      claude: new Set(['SomeFutureEvent']),
      codex: new Set(),
    })
    const hasError = findings.some((f) => f.severity === 'error')
    expect(hasError).toBe(true)
  })

  test('warning finding shape is correct', () => {
    // Pick a single known full event for claude and omit it
    const findings = detectDrift({ claude: new Set(), codex: new Set(['SessionStart']) })
    const claudeWarning = findings.find(
      (f) => f.vendor === 'claude' && f.event === 'SessionStart' && f.severity === 'warning',
    )
    expect(claudeWarning).toStrictEqual({
      event: 'SessionStart',
      vendor: 'claude',
      expected: 'full',
      actual: 'absent',
      severity: 'warning',
    })
  })

  test('codex UserPromptSubmit is full in matrix → warning when absent', () => {
    const findings = detectDrift({ claude: new Set(), codex: new Set() })
    const codexUserPromptWarning = findings.find(
      (f) => f.vendor === 'codex' && f.event === 'UserPromptSubmit' && f.severity === 'warning',
    )
    expect(codexUserPromptWarning).toStrictEqual({
      event: 'UserPromptSubmit',
      vendor: 'codex',
      expected: 'full',
      actual: 'absent',
      severity: 'warning',
    })
  })

  test('partial matrix entries do not warn when absent', () => {
    const findings = detectDrift({ claude: new Set(), codex: new Set() })
    expect(
      findings.find(
        (f) => f.vendor === 'codex' && f.event === 'PermissionRequest' && f.severity === 'warning',
      ),
    ).toBeUndefined()
    expect(
      findings.find(
        (f) => f.vendor === 'claude' && f.event === 'SessionEnd' && f.severity === 'warning',
      ),
    ).toBeUndefined()
  })
})
