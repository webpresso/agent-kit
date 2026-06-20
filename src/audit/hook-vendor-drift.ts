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
  // Only the vendors `detectDrift` actually inspects. Cursor hooks are not yet
  // emitted to an installed file, so there is nothing to compare; add it here
  // when a cursor reader lands.
  readonly vendor: 'claude' | 'codex'
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

/**
 * Result of reading a vendor config file. Distinguishes "absent" (fine — no
 * managed hooks installed) from "present but unparseable" (a real fault that
 * must be surfaced, NOT silently treated as zero installed events — otherwise a
 * corrupt `.claude/settings.json` reports a false "no drift" and the CI gate
 * passes on a broken config).
 */
type InstalledEventsRead = {
  readonly events: ReadonlySet<string>
  readonly parseError?: string
}

type JsonObjectRead =
  | { readonly kind: 'absent' }
  | { readonly kind: 'ok'; readonly value: Record<string, unknown> }
  | { readonly kind: 'error'; readonly message: string }

function describeError(error: unknown): string {
  return error instanceof Error ? error.message : String(error)
}

function readJsonObjectFile(filePath: string): JsonObjectRead {
  if (!existsSync(filePath)) return { kind: 'absent' }

  let raw: string
  try {
    raw = readFileSync(filePath, 'utf8')
  } catch (error: unknown) {
    return { kind: 'error', message: `unreadable (${describeError(error)})` }
  }

  let parsed: unknown
  try {
    parsed = JSON.parse(raw)
  } catch (error: unknown) {
    return { kind: 'error', message: `invalid JSON (${describeError(error)})` }
  }

  if (typeof parsed !== 'object' || parsed === null || Array.isArray(parsed)) {
    return { kind: 'error', message: 'not a JSON object' }
  }
  return { kind: 'ok', value: parsed as Record<string, unknown> }
}

function readClaudeInstalledEvents(repoRoot: string): InstalledEventsRead {
  const read = readJsonObjectFile(path.join(repoRoot, '.claude', 'settings.json'))
  if (read.kind === 'absent') return { events: new Set<string>() }
  if (read.kind === 'error') return { events: new Set<string>(), parseError: read.message }

  const hooks = read.value['hooks']
  if (typeof hooks !== 'object' || hooks === null || Array.isArray(hooks)) {
    return { events: new Set<string>() }
  }
  return { events: new Set(Object.keys(hooks as Record<string, unknown>)) }
}

function readCodexInstalledEvents(repoRoot: string): InstalledEventsRead {
  const read = readJsonObjectFile(path.join(repoRoot, '.codex', 'hooks.json'))
  if (read.kind === 'absent') return { events: new Set<string>() }
  if (read.kind === 'error') return { events: new Set<string>(), parseError: read.message }

  // Codex hooks.json canonical wrapped form: { "hooks": { Event: [...] } }
  const hooksValue = read.value['hooks']
  if (typeof hooksValue === 'object' && hooksValue !== null && !Array.isArray(hooksValue)) {
    return { events: new Set(Object.keys(hooksValue as Record<string, unknown>)) }
  }
  // Legacy flat form: { Event: [...] } at the root
  return { events: new Set(Object.keys(read.value)) }
}

// ---------------------------------------------------------------------------
// Main audit entry point
// ---------------------------------------------------------------------------

function configReadFinding(
  vendor: 'claude' | 'codex',
  configPath: string,
  message: string,
): DriftFinding {
  return {
    event: configPath,
    vendor,
    expected: 'parseable JSON object',
    actual: message,
    severity: 'error',
  }
}

export async function auditHookVendorDrift(options: {
  repoRoot: string
  fix?: boolean
  log?: (message: string) => void
}): Promise<DriftReport> {
  const { log, repoRoot } = options

  const claude = readClaudeInstalledEvents(repoRoot)
  const codex = readCodexInstalledEvents(repoRoot)

  const findings: DriftFinding[] = [...detectDrift({ claude: claude.events, codex: codex.events })]
  // A present-but-unparseable config is a hard error, not silent "no drift".
  if (claude.parseError) {
    findings.unshift(configReadFinding('claude', '.claude/settings.json', claude.parseError))
  }
  if (codex.parseError) {
    findings.unshift(configReadFinding('codex', '.codex/hooks.json', codex.parseError))
  }

  if (log) {
    for (const f of findings) {
      const prefix = f.severity === 'error' ? '[error]' : '[warn] '
      log(
        `${prefix} hook-vendor-drift: ${f.vendor}/${f.event} — expected=${f.expected} actual=${f.actual}`,
      )
    }

    if (findings.length === 0) {
      log('hook-vendor-drift: no drift detected')
    }
  }

  const hasError = findings.some((f) => f.severity === 'error')
  return { findings, exitCode: hasError ? 1 : 0 }
}
