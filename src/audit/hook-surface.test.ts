import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs'
import os from 'node:os'
import path from 'node:path'

import { afterEach, beforeEach, describe, expect, it } from 'vitest'

import {
  auditHookSurface,
  auditHookSurfaceAsRepoResult,
  detectDrift,
  extractOwner,
} from './hook-surface.js'
import type { HookEntry } from './hook-surface.js'

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

interface TempRepo {
  /** Repository root (contains .claude/settings.json for project-level hooks) */
  cwd: string
  /** Isolated user dir (contains settings.json for user-level hooks) */
  userDir: string
  /** ${cwd}/.claude */
  claudeDir: string
  /**
   * Path to user-level settings.json inside userDir.
   * Pass as `userSettingsPath` to auditHookSurface() to isolate tests
   * from the real ~/.claude/settings.json on this machine.
   */
  userSettingsFile: string
}

function makeTempRepo(): TempRepo {
  const cwd = mkdtempSync(path.join(os.tmpdir(), 'wp-audit-hook-surface-'))
  const claudeDir = path.join(cwd, '.claude')
  const userDir = mkdtempSync(path.join(os.tmpdir(), 'wp-audit-hook-surface-user-'))
  mkdirSync(claudeDir, { recursive: true })
  // User settings file starts absent (no file = no hooks)
  const userSettingsFile = path.join(userDir, 'settings.json')
  return { cwd, userDir, claudeDir, userSettingsFile }
}

function writeSettings(dir: string, hooks: Record<string, unknown>): void {
  writeFileSync(path.join(dir, 'settings.json'), JSON.stringify({ hooks }), 'utf8')
}

/**
 * Build a minimal hook group entry in the shape Claude Code expects.
 */
function hookGroup(matcher: string, commands: readonly string[]): unknown {
  return {
    matcher,
    hooks: commands.map((command) => ({ type: 'command', command })),
  }
}

let tempRepo: TempRepo

beforeEach(() => {
  tempRepo = makeTempRepo()
})

afterEach(() => {
  rmSync(tempRepo.cwd, { recursive: true, force: true })
  rmSync(tempRepo.userDir, { recursive: true, force: true })
})

// Shorthand: build options that isolate from the real ~/.claude/settings.json
function opts(extraProjectHooks?: Record<string, unknown>): {
  projectDir: string
  userSettingsPath: string
} {
  if (extraProjectHooks) {
    writeSettings(tempRepo.claudeDir, extraProjectHooks)
  }
  return { projectDir: tempRepo.cwd, userSettingsPath: tempRepo.userSettingsFile }
}

// ---------------------------------------------------------------------------
// Tests — passing cases
// ---------------------------------------------------------------------------

describe('auditHookSurface — passing', () => {
  it('passes when no settings files exist', () => {
    const result = auditHookSurface(opts())
    expect(result.passed).toBe(true)
    expect(result.kind).toBe('hook-surface')
    expect(result.details.violations).toHaveLength(0)
  })

  it('passes when only RTK is on the Bash matcher (project level)', () => {
    const result = auditHookSurface(opts({ PreToolUse: [hookGroup('Bash', ['rtk hook claude'])] }))
    expect(result.passed).toBe(true)
    expect(result.details.violations).toHaveLength(0)
  })

  it('passes when only pretool-guard is on the Bash matcher (project level)', () => {
    const result = auditHookSurface(opts({ PreToolUse: [hookGroup('Bash', ['wp-pretool-guard'])] }))
    expect(result.passed).toBe(true)
    expect(result.details.violations).toHaveLength(0)
  })

  it('passes when a validator and a rewriter share the same matcher', () => {
    // Only one rewriter — validator does not count
    const result = auditHookSurface(
      opts({ PreToolUse: [hookGroup('Bash', ['rtk hook claude', 'wp-pretool-guard'])] }),
    )
    expect(result.passed).toBe(true)
    expect(result.details.violations).toHaveLength(0)
  })

  it('passes when multiple validators are on the same matcher', () => {
    const result = auditHookSurface(
      opts({ PreToolUse: [hookGroup('Bash', ['wp-pretool-guard', 'some-other-validator'])] }),
    )
    expect(result.passed).toBe(true)
    expect(result.details.violations).toHaveLength(0)
  })
})

// ---------------------------------------------------------------------------
// Tests — failing cases
// ---------------------------------------------------------------------------

describe('auditHookSurface — violations', () => {
  it('fails when RTK appears in two separate hook groups for the same matcher', () => {
    const result = auditHookSurface(
      opts({
        PreToolUse: [
          hookGroup('Bash', ['rtk hook claude']),
          hookGroup('Bash', ['/ctx/pretooluse.mjs']),
        ],
      }),
    )
    expect(result.passed).toBe(false)
    expect(result.details.violations.length).toBeGreaterThanOrEqual(1)
  })

  it('violation reason contains matcher and both commands', () => {
    const result = auditHookSurface(
      opts({
        PreToolUse: [hookGroup('Bash', ['rtk hook claude', '/path/to/pretooluse.mjs'])],
      }),
    )
    const reason = result.details.violations[0]?.reason ?? ''
    expect(reason).toContain('Bash')
    expect(reason).toContain('rtk hook claude')
    expect(reason).toContain('pretooluse.mjs')
  })

  it('reports violations per matcher independently (Write vs Bash are separate)', () => {
    const result = auditHookSurface(
      opts({
        PreToolUse: [
          hookGroup('Bash', ['rtk hook claude', '/ctx/pretooluse.mjs']),
          hookGroup('Write', ['rtk hook claude', '/ctx/pretooluse.mjs']),
        ],
      }),
    )
    expect(result.passed).toBe(false)
    expect(result.details.violations.length).toBeGreaterThanOrEqual(2)
    const events = result.details.violations.map((v) => v.event)
    expect(events.every((e) => e === 'PreToolUse')).toBe(true)
    const matchers = result.details.violations.map((v) => v.matcher)
    expect(matchers).toContain('Bash')
    expect(matchers).toContain('Write')
  })
})

// ---------------------------------------------------------------------------
// Tests — parse error resilience
// ---------------------------------------------------------------------------

describe('auditHookSurface — parse error handling', () => {
  it('reports a parse error in details when project settings.json is malformed JSON', () => {
    writeFileSync(path.join(tempRepo.claudeDir, 'settings.json'), '{ bad json }', 'utf8')
    const result = auditHookSurface({
      projectDir: tempRepo.cwd,
      userSettingsPath: tempRepo.userSettingsFile,
    })
    expect(result.passed).toBe(false)
    expect(result.details.violations.some((v) => v.event === 'parse-error')).toBe(true)
  })

  it('does not crash when project settings.json is empty', () => {
    writeFileSync(path.join(tempRepo.claudeDir, 'settings.json'), '', 'utf8')
    const result = auditHookSurface({
      projectDir: tempRepo.cwd,
      userSettingsPath: tempRepo.userSettingsFile,
    })
    // Empty file is a parse error (not valid JSON) but must not throw
    expect(result).toHaveProperty('passed')
  })
})

// ---------------------------------------------------------------------------
// Tests — RepoAuditResult adapter
// ---------------------------------------------------------------------------

describe('auditHookSurfaceAsRepoResult', () => {
  it('returns ok: true with zero violations when no settings files exist', () => {
    const result = auditHookSurfaceAsRepoResult(opts())
    expect(result.ok).toBe(true)
    expect(result.title).toBe('Hook surface audit')
    expect(Array.isArray(result.violations)).toBe(true)
    expect(result.violations).toHaveLength(0)
  })

  it('returns ok: false with a violation message when rewriters conflict', () => {
    const result = auditHookSurfaceAsRepoResult(
      opts({ PreToolUse: [hookGroup('Bash', ['rtk hook claude', '/path/pretooluse.mjs'])] }),
    )
    expect(result.ok).toBe(false)
    expect(result.violations.length).toBeGreaterThanOrEqual(1)
    expect(typeof result.violations[0]?.message).toBe('string')
  })
})

// ---------------------------------------------------------------------------
// extractOwner — TC-04 / TC-10
// ---------------------------------------------------------------------------

describe('extractOwner', () => {
  it('classifies wp-* bins as webpresso (dash form)', () => {
    expect(extractOwner('./node_modules/.bin/wp-pretool-guard')).toBe('webpresso')
    expect(extractOwner('wp-stop-qa')).toBe('webpresso')
    expect(extractOwner('wp-sessionstart-routing')).toBe('webpresso')
  })

  it('classifies wp_* bins as webpresso (underscore form)', () => {
    expect(extractOwner('wp_pretool_guard')).toBe('webpresso')
  })

  it('classifies oh-my-codex / codex-native-hook.js as omx', () => {
    expect(extractOwner('node "/path/oh-my-codex/dist/scripts/codex-native-hook.js"')).toBe('omx')
    expect(extractOwner('node /path/omx/hook.js')).toBe('omx')
  })

  it('classifies rtk commands', () => {
    expect(extractOwner('rtk hook pretooluse')).toBe('rtk')
    expect(extractOwner('rtk hook claude')).toBe('rtk')
  })

  it('classifies gstack scripts', () => {
    expect(extractOwner('"$CLAUDE_PROJECT_DIR/.claude/hooks/check-gstack.sh"')).toBe('gstack')
    expect(extractOwner('/some/path/gstack-hook.sh')).toBe('gstack')
  })

  it('returns unknown for unrecognised commands', () => {
    expect(extractOwner('some-other-tool --hook')).toBe('unknown')
    expect(extractOwner('')).toBe('unknown')
  })
})

// ---------------------------------------------------------------------------
// detectDrift — TC-01 through TC-06, TC-07/TC-08 (empty input), TC-09
// ---------------------------------------------------------------------------

describe('detectDrift', () => {
  // TC-01: cross-owner same-event → allowed
  // TC-02: same-owner + same-command → drift
  // TC-03: same-owner, different-command → allowed
  it('TC-03: allows same owner with different commands on the same event', () => {
    const hooks: readonly HookEntry[] = [
      { runtime: 'codex', event: 'Stop', command: './node_modules/.bin/wp-stop-qa' },
      { runtime: 'codex', event: 'Stop', command: './node_modules/.bin/wp-guard-switch' },
    ]
    expect(detectDrift(hooks)).toHaveLength(0)
  })

  // TC-05: same webpresso bin registered twice → drift
  it('TC-05: flags same webpresso bin registered twice on same event as drift', () => {
    const hooks: readonly HookEntry[] = [
      { runtime: 'codex', event: 'PreToolUse', command: './node_modules/.bin/wp-pretool-guard' },
      { runtime: 'codex', event: 'PreToolUse', command: './node_modules/.bin/wp-pretool-guard' },
    ]
    const violations = detectDrift(hooks)
    expect(violations).toHaveLength(1)
    expect(violations[0]?.count).toBe(2)
  })

  // TC-06: same command across different matchers → still drift (dedup key ignores matcher)
  // TC-07/TC-08: empty input → no errors
  it('TC-07/TC-08: returns empty array for empty input', () => {
    expect(detectDrift([])).toHaveLength(0)
  })

  // TC-09: three-way cross-owner on same event → allowed
  // Additional: cross-runtime same command → no drift (different runtime = different key)
  it('allows the same command on different runtimes (not drift)', () => {
    const hooks: readonly HookEntry[] = [
      {
        runtime: 'codex',
        event: 'PreToolUse',
        command: 'node "/path/oh-my-codex/dist/scripts/codex-native-hook.js"',
      },
      {
        runtime: 'claude',
        event: 'PreToolUse',
        command: 'node "/path/oh-my-codex/dist/scripts/codex-native-hook.js"',
      },
    ]
    expect(detectDrift(hooks)).toHaveLength(0)
  })

  // Violation key format check
  it('violation key encodes runtime:event:owner:command', () => {
    const cmd = 'node "/path/oh-my-codex/dist/scripts/codex-native-hook.js"'
    const hooks: readonly HookEntry[] = [
      { runtime: 'codex', event: 'PreToolUse', command: cmd },
      { runtime: 'codex', event: 'PreToolUse', command: cmd },
    ]
    const violations = detectDrift(hooks)
    expect(violations[0]?.key).toBe(`codex:PreToolUse:omx:${cmd}`)
  })
})
