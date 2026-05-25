import { mkdirSync, mkdtempSync, rmSync, symlinkSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterEach, describe, expect, it } from 'vitest'

import {
  buildOutput,
  buildSessionStartEnvelope,
  detectDevLinkBreakage,
  formatBreakageMessage,
} from './index'
import { STATE_FILE_RELATIVE_PATH } from '#dev/dev-link-state'

const tempRoots: string[] = []

function createTempRoot(): string {
  const root = mkdtempSync(join(tmpdir(), 'check-dev-link-'))
  tempRoots.push(root)
  return root
}

function writeState(consumer: string, payload: unknown): void {
  mkdirSync(join(consumer, '.webpresso'), { recursive: true })
  writeFileSync(join(consumer, STATE_FILE_RELATIVE_PATH), JSON.stringify(payload), 'utf8')
}

afterEach(() => {
  for (const root of tempRoots.splice(0)) {
    rmSync(root, { recursive: true, force: true })
  }
})

describe('detectDevLinkBreakage', () => {
  it('returns null when no state file exists (CI / never linked)', () => {
    expect(detectDevLinkBreakage({ cwd: createTempRoot() })).toBeNull()
  })

  it('returns null when symlink matches state file', () => {
    const consumer = createTempRoot()
    const source = createTempRoot()
    mkdirSync(join(consumer, 'node_modules', '@webpresso'), { recursive: true })
    symlinkSync(source, join(consumer, 'node_modules', 'webpresso'), 'dir')
    writeState(consumer, { package: 'webpresso', linkedFrom: source })

    expect(detectDevLinkBreakage({ cwd: consumer })).toBeNull()
  })

  it('detects breakage when symlink points elsewhere', () => {
    const consumer = createTempRoot()
    const source = createTempRoot()
    const stale = createTempRoot()
    mkdirSync(join(consumer, 'node_modules', '@webpresso'), { recursive: true })
    symlinkSync(stale, join(consumer, 'node_modules', 'webpresso'), 'dir')
    writeState(consumer, { package: 'webpresso', linkedFrom: source })

    expect(detectDevLinkBreakage({ cwd: consumer })).toEqual({
      expected: source,
      actual: stale,
      packageName: 'webpresso',
      projectDir: consumer,
    })
  })

  it('detects breakage when target is a real directory (pnpm-store snapshot)', () => {
    const consumer = createTempRoot()
    const source = createTempRoot()
    mkdirSync(join(consumer, 'node_modules', 'webpresso'), { recursive: true })
    writeState(consumer, { package: 'webpresso', linkedFrom: source })

    const breakage = detectDevLinkBreakage({ cwd: consumer })
    expect(breakage?.expected).toBe(source)
    expect(breakage?.actual).toBeNull()
  })
})

describe('formatBreakageMessage', () => {
  it('mentions both expected and actual paths plus the fix command', () => {
    const message = formatBreakageMessage({
      expected: '/tmp/webpresso',
      actual: '/tmp/store-snapshot',
      packageName: 'webpresso',
      projectDir: '/tmp/consumer',
    })

    expect(message).toContain('/tmp/webpresso')
    expect(message).toContain('/tmp/store-snapshot')
    expect(message).toContain('vp run dev:link --consumer /tmp/consumer')
    expect(message).toContain('webpresso')
    expect(message).toContain('wp-restore-dev-links')
  })

  it('uses <store snapshot> placeholder when actual link is null', () => {
    const message = formatBreakageMessage({
      expected: '/tmp/webpresso',
      actual: null,
      packageName: 'webpresso',
      projectDir: '/tmp/consumer',
    })

    expect(message).toContain('<store snapshot>')
  })
})

describe('buildSessionStartEnvelope', () => {
  it('emits the additionalContext envelope shared by Claude Code and Codex', () => {
    const envelope = buildSessionStartEnvelope('hello')
    const parsed = JSON.parse(envelope) as {
      hookSpecificOutput: { hookEventName: string; additionalContext: string }
    }
    expect(parsed.hookSpecificOutput.hookEventName).toBe('SessionStart')
    expect(parsed.hookSpecificOutput.additionalContext).toBe('hello')
  })

  it('safely escapes embedded quotes/backslashes (JSON.stringify, no manual printf)', () => {
    const envelope = buildSessionStartEnvelope('has "quotes" and \\ backslash')
    const parsed = JSON.parse(envelope) as {
      hookSpecificOutput: { additionalContext: string }
    }
    expect(parsed.hookSpecificOutput.additionalContext).toBe('has "quotes" and \\ backslash')
  })
})

describe('buildOutput', () => {
  it('returns null on healthy state (no envelope written)', () => {
    expect(buildOutput(createTempRoot())).toBeNull()
  })

  it('returns a parseable single-line envelope on broken state', () => {
    const consumer = createTempRoot()
    const source = createTempRoot()
    mkdirSync(join(consumer, 'node_modules', 'webpresso'), { recursive: true })
    writeState(consumer, { package: 'webpresso', linkedFrom: source })

    const out = buildOutput(consumer)
    expect(out).not.toBeNull()
    if (out !== null) {
      const parsed = JSON.parse(out) as { hookSpecificOutput: { hookEventName: string } }
      expect(parsed.hookSpecificOutput.hookEventName).toBe('SessionStart')
      expect(out.includes('\n')).toBe(false)
    }
  })
})
