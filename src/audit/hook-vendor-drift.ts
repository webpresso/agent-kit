/**
 * `wp audit hook-vendor-drift` — compares CAPABILITY_MATRIX event declarations
 * against the events actually present in installed vendor hook files.
 *
 * Exits 1 when any finding has severity='error' (undocumented events in
 * installed hooks that are not in CAPABILITY_MATRIX). Warnings are
 * informational: matrix says 'full' but the event is absent from installed
 * hooks. Useful as a CI gate to catch vendor-docs drift after re-verification
 * (Hookbridge sync pattern).
 */

import { existsSync, readFileSync } from 'node:fs'
import path from 'node:path'

import { CAPABILITY_MATRIX } from '#cli/commands/init/scaffolders/agent-hooks/capability-matrix.js'

export type DriftFinding = {
  readonly event: string
  readonly vendor: 'claude' | 'codex' | 'cursor'
  readonly expected: string
  readonly actual: string
  readonly severity: 'error' | 'warning'
}

export type DriftReport = {
  readonly findings: readonly DriftFinding[]
  readonly exitCode: 0 | 1
}

// ---------------------------------------------------------------------------
// Pure logic — no filesystem I/O
// ---------------------------------------------------------------------------

/**
 * Compare CAPABILITY_MATRIX against the events found in installed vendor hook
 * files. Returns findings for any mismatch.
 *
 * installedEvents: map of vendor key → set of event names present in their
 * hooks file.
 */
export function detectDrift(
  installedEvents: Readonly<Record<string, ReadonlySet<string>>>,
): readonly DriftFinding[] {
  const findings: DriftFinding[] = []

  const claudeInstalled = installedEvents['claude'] ?? new Set<string>()
  const codexInstalled = installedEvents['codex'] ?? new Set<string>()

  // Check every event declared in CAPABILITY_MATRIX
  const matrixEvents = new Set<string>()
  for (const entry of CAPABILITY_MATRIX) {
    matrixEvents.add(entry.event)

    if (entry.claude === 'full' && !claudeInstalled.has(entry.event)) {
      findings.push({
        event: entry.event,
        vendor: 'claude',
        expected: 'full',
        actual: 'absent',
        severity: 'warning',
      })
    }

    if (entry.codex === 'full' && !codexInstalled.has(entry.event)) {
      findings.push({
        event: entry.event,
        vendor: 'codex',
        expected: 'full',
        actual: 'absent',
        severity: 'warning',
      })
    }
  }

  // Check for undocumented events in installed hooks (not in CAPABILITY_MATRIX)
  for (const event of claudeInstalled) {
    if (!matrixEvents.has(event)) {
      findings.push({
        event,
        vendor: 'claude',
        expected: 'absent',
        actual: 'present',
        severity: 'error',
      })
    }
  }

  for (const event of codexInstalled) {
    if (!matrixEvents.has(event)) {
      findings.push({
        event,
        vendor: 'codex',
        expected: 'absent',
        actual: 'present',
        severity: 'error',
      })
    }
  }

  return findings
}

// ---------------------------------------------------------------------------
// File readers
// ---------------------------------------------------------------------------

function readClaudeInstalledEvents(repoRoot: string): ReadonlySet<string> {
  const settingsPath = path.join(repoRoot, '.claude', 'settings.json')
  if (!existsSync(settingsPath)) return new Set<string>()

  let raw: string
  try {
    raw = readFileSync(settingsPath, 'utf8')
  } catch {
    return new Set<string>()
  }

  let parsed: unknown
  try {
    parsed = JSON.parse(raw)
  } catch {
    return new Set<string>()
  }

  if (typeof parsed !== 'object' || parsed === null) return new Set<string>()

  const record = parsed as Record<string, unknown>
  const hooks = record['hooks']
  if (typeof hooks !== 'object' || hooks === null || Array.isArray(hooks)) {
    return new Set<string>()
  }

  return new Set(Object.keys(hooks as Record<string, unknown>))
}

function readCodexInstalledEvents(repoRoot: string): ReadonlySet<string> {
  const hooksPath = path.join(repoRoot, '.codex', 'hooks.json')
  if (!existsSync(hooksPath)) return new Set<string>()

  let raw: string
  try {
    raw = readFileSync(hooksPath, 'utf8')
  } catch {
    return new Set<string>()
  }

  let parsed: unknown
  try {
    parsed = JSON.parse(raw)
  } catch {
    return new Set<string>()
  }

  if (typeof parsed !== 'object' || parsed === null) return new Set<string>()

  const record = parsed as Record<string, unknown>

  // Codex hooks.json canonical wrapped form: { "hooks": { Event: [...] } }
  const hooksValue = record['hooks']
  if (typeof hooksValue === 'object' && hooksValue !== null && !Array.isArray(hooksValue)) {
    return new Set(Object.keys(hooksValue as Record<string, unknown>))
  }

  // Legacy flat form: { Event: [...] } at the root
  return new Set(Object.keys(record))
}

// ---------------------------------------------------------------------------
// Main audit entry point
// ---------------------------------------------------------------------------

export async function auditHookVendorDrift(options: {
  repoRoot: string
  fix?: boolean
}): Promise<DriftReport> {
  const { repoRoot } = options

  const installedEvents: Record<string, ReadonlySet<string>> = {
    claude: readClaudeInstalledEvents(repoRoot),
    codex: readCodexInstalledEvents(repoRoot),
  }

  const findings = detectDrift(installedEvents)

  for (const f of findings) {
    const prefix = f.severity === 'error' ? '[error]' : '[warn] '
    console.log(
      `${prefix} hook-vendor-drift: ${f.vendor}/${f.event} — expected=${f.expected} actual=${f.actual}`,
    )
  }

  if (findings.length === 0) {
    console.log('hook-vendor-drift: no drift detected')
  }

  const hasError = findings.some((f) => f.severity === 'error')
  return { findings, exitCode: hasError ? 1 : 0 }
}
