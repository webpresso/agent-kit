import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'

import { afterEach, beforeEach, describe, expect, test, vi } from 'vitest'

import { auditHookVendorDrift, detectDrift } from './hook-vendor-drift.js'

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
      'PreCompact',
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
      'PreCompact',
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
      findings.some(
        (f) => f.vendor === 'codex' && f.event === 'PermissionRequest' && f.severity === 'warning',
      ),
    ).toBe(false)
    expect(
      findings.some(
        (f) => f.vendor === 'claude' && f.event === 'SessionEnd' && f.severity === 'warning',
      ),
    ).toBe(false)
  })
})

describe('auditHookVendorDrift (file I/O)', () => {
  let repoRoot: string

  beforeEach(() => {
    repoRoot = mkdtempSync(join(tmpdir(), 'hook-vendor-drift-'))
    // Silence the audit's console reporting in the test output.
    vi.spyOn(console, 'log').mockImplementation(() => {})
  })

  afterEach(() => {
    vi.restoreAllMocks()
    rmSync(repoRoot, { recursive: true, force: true })
  })

  test('absent vendor configs → warnings only, exit 0 (no parse error)', async () => {
    const report = await auditHookVendorDrift({ repoRoot })
    expect(report.exitCode).toBe(0)
    expect(report.findings.some((f) => f.severity === 'error')).toBe(false)
  })

  test('malformed .claude/settings.json is surfaced as an error, NOT a silent "no drift"', async () => {
    mkdirSync(join(repoRoot, '.claude'), { recursive: true })
    writeFileSync(join(repoRoot, '.claude', 'settings.json'), '{ this is not json', 'utf8')

    const report = await auditHookVendorDrift({ repoRoot })

    expect(report.exitCode).toBe(1)
    const parseError = report.findings.find(
      (f) => f.vendor === 'claude' && f.event === '.claude/settings.json',
    )
    expect(parseError?.severity).toBe('error')
    expect(parseError?.actual).toContain('invalid JSON')
  })

  test('malformed .codex/hooks.json is surfaced as an error, NOT a silent "no drift"', async () => {
    mkdirSync(join(repoRoot, '.codex'), { recursive: true })
    writeFileSync(join(repoRoot, '.codex', 'hooks.json'), 'not json at all', 'utf8')

    const report = await auditHookVendorDrift({ repoRoot })

    expect(report.exitCode).toBe(1)
    const parseError = report.findings.find(
      (f) => f.vendor === 'codex' && f.event === '.codex/hooks.json',
    )
    expect(parseError?.severity).toBe('error')
    expect(parseError?.actual).toContain('invalid JSON')
  })

  test('a JSON array (not object) settings file is surfaced as an error', async () => {
    mkdirSync(join(repoRoot, '.claude'), { recursive: true })
    writeFileSync(join(repoRoot, '.claude', 'settings.json'), '[]', 'utf8')

    const report = await auditHookVendorDrift({ repoRoot })

    expect(report.exitCode).toBe(1)
    expect(
      report.findings.some(
        (f) => f.event === '.claude/settings.json' && f.actual === 'not a JSON object',
      ),
    ).toBe(true)
  })
})
