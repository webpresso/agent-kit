/**
 * `wp audit hook-surface` — enforces the single-rewriter-per-matcher invariant.
 *
 * From Anthropic's official hooks docs (May 2026):
 *   "When multiple PreToolUse hooks return updatedInput to rewrite a tool's
 *   arguments, the last one to finish wins. Since hooks run in parallel, the
 *   order is non-deterministic. Avoid having more than one hook modify the
 *   same tool's input."
 *
 * This audit collects hooks from:
 *   - ~/.claude/settings.json          (user-level)
 *   - $CLAUDE_PROJECT_DIR/.claude/settings.json  (project-level)
 *
 * It classifies each hook as a **rewriter** or a **validator**, then flags any
 * event+matcher combination that has more than one rewriter registered.
 *
 * Known rewriters (hardcoded, expandable):
 *   - `rtk hook claude` → Bash rewriter
 *   - any hook path ending in `pretooluse.mjs` that is NOT a passthrough
 */

import { existsSync, readFileSync } from 'node:fs'
import os from 'node:os'
import path from 'node:path'

import type { RepoAuditResult, RepoAuditViolation } from './repo-guardrails.js'

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

type InternalHookEntry = { type?: string; command?: string; timeout?: number }
type HookGroup = { matcher?: string; hooks?: readonly InternalHookEntry[] }
type HooksMap = Readonly<Record<string, readonly HookGroup[]>>

/** A normalised hook entry carrying runtime, event, command, and optional matcher. */
export type HookEntry = {
  readonly runtime: string
  readonly event: string
  readonly command: string
  readonly matcher?: string
}

/** A drift violation: the same owner+command appears >1 time for the same runtime+event. */
export type DriftViolation = {
  readonly key: string
  readonly count: number
  readonly entries: readonly HookEntry[]
}

export interface HookSurfaceViolation {
  readonly event: string
  readonly matcher: string
  readonly rewriters: readonly string[]
  readonly reason: string
}

export interface HookSurfaceDetails {
  readonly ok: boolean
  readonly violations: readonly HookSurfaceViolation[]
}

export interface HookSurfaceResult {
  readonly passed: boolean
  readonly kind: 'hook-surface'
  readonly details: HookSurfaceDetails
}

interface ParsedSettings {
  readonly source: string
  readonly hooks: HooksMap
  readonly parseError?: string
}

// ---------------------------------------------------------------------------
// Owner extraction
// ---------------------------------------------------------------------------

/**
 * Determines the canonical owner of a hook command using priority-ordered
 * pattern matching. Returns one of: 'agent-kit', 'context-mode', 'omx',
 * 'rtk', 'gstack', or 'unknown'.
 */
export function extractOwner(command: string): string {
  if (/\bwp[-_][a-z]/.test(command)) return 'agent-kit'
  if (command.includes('context-mode')) return 'context-mode'
  if (/omx|oh-my-codex/.test(command)) return 'omx'
  if (/\brtk\b/.test(command)) return 'rtk'
  if (/gstack|check-gstack/.test(command)) return 'gstack'
  return 'unknown'
}

// ---------------------------------------------------------------------------
// Drift detection
// ---------------------------------------------------------------------------

/**
 * Detects drift violations where the same owner+command appears more than once
 * for the same runtime+event combination. Cross-owner same-event composition
 * is NOT a violation — only same-owner/same-command duplication is.
 *
 * Pure function — no filesystem I/O.
 */
export function detectDrift(entries: readonly HookEntry[]): DriftViolation[] {
  const byKey = new Map<string, HookEntry[]>()

  for (const entry of entries) {
    const owner = extractOwner(entry.command)
    const key = `${entry.runtime}:${entry.event}:${owner}:${entry.command.trim()}`
    const existing = byKey.get(key)
    if (existing) {
      existing.push(entry)
    } else {
      byKey.set(key, [entry])
    }
  }

  const violations: DriftViolation[] = []

  for (const [key, group] of byKey) {
    if (group.length > 1) {
      violations.push({ key, count: group.length, entries: group })
    }
  }

  return violations
}

// ---------------------------------------------------------------------------
// Rewriter detection
// ---------------------------------------------------------------------------

/**
 * Returns true if the hook command is a known rewriter — i.e. it can return
 * `updatedInput` and mutate the tool's arguments.
 *
 * Validators only return `permissionDecision` or `additionalContext` and are
 * safe to stack on the same matcher.
 */
function isRewriter(command: string): boolean {
  // RTK rewrites Bash input — canonical rewriter
  if (command.includes('rtk hook claude')) return true

  // context-mode pretooluse hook rewrites input unless explicitly passthrough.
  // We cannot read the hook's internals, so we flag any pretooluse.mjs
  // binding conservatively.
  if (command.endsWith('pretooluse.mjs')) return true
  if (command.includes('/pretooluse.mjs')) return true

  return false
}

// ---------------------------------------------------------------------------
// Settings file parsing
// ---------------------------------------------------------------------------

function readSettingsFile(filePath: string): ParsedSettings {
  if (!existsSync(filePath)) {
    return { source: filePath, hooks: {} }
  }

  let raw: string
  try {
    raw = readFileSync(filePath, 'utf8')
  } catch (error: unknown) {
    const msg = error instanceof Error ? error.message : String(error)
    return {
      source: filePath,
      hooks: {},
      parseError: `Could not read ${filePath}: ${msg}`,
    }
  }

  let parsed: unknown
  try {
    parsed = JSON.parse(raw)
  } catch (error: unknown) {
    const msg = error instanceof Error ? error.message : String(error)
    return {
      source: filePath,
      hooks: {},
      parseError: `Could not parse ${filePath}: ${msg}`,
    }
  }

  if (!parsed || typeof parsed !== 'object') {
    return { source: filePath, hooks: {} }
  }

  const record = parsed as Record<string, unknown>

  // Claude Code settings.json wraps hooks under { "hooks": { Event: [...] } }
  const raw_hooks = record['hooks']
  if (raw_hooks && typeof raw_hooks === 'object' && !Array.isArray(raw_hooks)) {
    return { source: filePath, hooks: raw_hooks as HooksMap }
  }

  return { source: filePath, hooks: {} }
}

function resolveSettingsPaths(
  projectDir: string | undefined,
  userSettingsOverride: string | undefined,
): readonly string[] {
  const paths: string[] = []

  // User-level: ~/.claude/settings.json (or override for tests)
  const userSettings = userSettingsOverride ?? path.join(os.homedir(), '.claude', 'settings.json')
  paths.push(userSettings)

  // Project-level: $CLAUDE_PROJECT_DIR/.claude/settings.json
  const projectRoot = projectDir ?? process.env['CLAUDE_PROJECT_DIR']
  if (projectRoot) {
    paths.push(path.join(projectRoot, '.claude', 'settings.json'))
  }

  return paths
}

// ---------------------------------------------------------------------------
// Core audit logic
// ---------------------------------------------------------------------------

/**
 * Represents one rewriter registration: event + matcher + command + source.
 */
interface RewriterEntry {
  readonly event: string
  readonly matcher: string
  readonly command: string
  readonly source: string
}

function collectRewriters(settings: readonly ParsedSettings[]): readonly RewriterEntry[] {
  const entries: RewriterEntry[] = []

  for (const { source, hooks } of settings) {
    for (const [event, groups] of Object.entries(hooks)) {
      if (!Array.isArray(groups)) continue

      for (const group of groups) {
        const matcher = group.matcher ?? '*'
        const hookEntries = group.hooks ?? []

        for (const hook of hookEntries) {
          const command = hook.command
          if (typeof command !== 'string' || command.trim() === '') continue
          if (isRewriter(command)) {
            entries.push({ event, matcher, command, source })
          }
        }
      }
    }
  }

  return entries
}

function buildViolations(rewriters: readonly RewriterEntry[]): readonly HookSurfaceViolation[] {
  // Group by event+matcher
  const byKey = new Map<string, RewriterEntry[]>()

  for (const entry of rewriters) {
    const key = `${entry.event}\0${entry.matcher}`
    const existing = byKey.get(key)
    if (existing) {
      existing.push(entry)
    } else {
      byKey.set(key, [entry])
    }
  }

  const violations: HookSurfaceViolation[] = []

  for (const [key, entries] of byKey) {
    if (entries.length <= 1) continue

    const [event, matcher] = key.split('\0') as [string, string]
    const commands = entries.map((e) => e.command)
    violations.push({
      event,
      matcher,
      rewriters: commands,
      reason:
        `${entries.length} rewriters registered on ${event}/${matcher}: ` +
        commands.map((c) => JSON.stringify(c)).join(', ') +
        '. Since hooks run in parallel, the last updatedInput wins non-deterministically. ' +
        'Keep at most one rewriter per event+matcher combination.',
    })
  }

  return violations
}

// ---------------------------------------------------------------------------
// Public API
// ---------------------------------------------------------------------------

export interface HookSurfaceOptions {
  /** Repository root. Falls back to CLAUDE_PROJECT_DIR env var when omitted. */
  readonly projectDir?: string
  /**
   * Override path to the user-level settings file.
   * Defaults to ~/.claude/settings.json.
   * Useful in tests to avoid reading real user settings.
   */
  readonly userSettingsPath?: string
}

/**
 * Run the hook-surface audit.
 */
export function auditHookSurface(
  projectDirOrOpts?: string | HookSurfaceOptions,
): HookSurfaceResult {
  const opts: HookSurfaceOptions =
    typeof projectDirOrOpts === 'string'
      ? { projectDir: projectDirOrOpts }
      : (projectDirOrOpts ?? {})

  const settingsPaths = resolveSettingsPaths(opts.projectDir, opts.userSettingsPath)
  const settings = settingsPaths.map(readSettingsFile)

  const parseErrors = settings.flatMap((s) => (s.parseError ? [s.parseError] : []))
  const rewriters = collectRewriters(settings)
  const violations = buildViolations(rewriters)

  const passed = violations.length === 0 && parseErrors.length === 0

  // Promote parse errors to violations so they surface in the output
  const errorViolations: HookSurfaceViolation[] = parseErrors.map((msg) => ({
    event: 'parse-error',
    matcher: '',
    rewriters: [],
    reason: msg,
  }))

  const allViolations = [...errorViolations, ...violations]

  return {
    passed,
    kind: 'hook-surface',
    details: {
      ok: passed,
      violations: allViolations,
    },
  }
}

/**
 * Adapter returning a RepoAuditResult shape for registry integration.
 */
export function auditHookSurfaceAsRepoResult(
  projectDirOrOpts?: string | HookSurfaceOptions,
): RepoAuditResult {
  const result = auditHookSurface(projectDirOrOpts)

  const violations: RepoAuditViolation[] = result.details.violations.map((v) => ({
    message: v.reason,
  }))

  return {
    ok: result.passed,
    title: 'Hook surface audit',
    checked: result.details.violations.length,
    violations,
  }
}
