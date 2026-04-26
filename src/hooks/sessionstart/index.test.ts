import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { performance } from 'node:perf_hooks'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'

import { buildOutput, MAX_BYTES, TRUNCATION_NOTICE } from './index.js'

interface ParsedOutput {
  hookSpecificOutput: {
    hookEventName: string
    additionalContext: string
  }
}

function makeFixture(): string {
  return mkdtempSync(join(tmpdir(), 'ak-sessionstart-'))
}

function writeRoutingMd(dir: string, contents: string): string {
  const agentDir = join(dir, '.agent')
  mkdirSync(agentDir, { recursive: true })
  const file = join(agentDir, 'routing.md')
  writeFileSync(file, contents)
  return file
}

describe('sessionstart hook buildOutput', () => {
  let dirs: string[] = []

  beforeEach(() => {
    dirs = []
  })

  afterEach(() => {
    for (const d of dirs) rmSync(d, { recursive: true, force: true })
  })

  function tmp(): string {
    const d = makeFixture()
    dirs.push(d)
    return d
  }

  it('emits valid JSON additionalContext when .agent/routing.md exists', () => {
    const cwd = tmp()
    const contents = '# Routing\n\nGo to docs.'
    writeRoutingMd(cwd, contents)

    const out = buildOutput({}, cwd, {})

    expect(out).not.toBeNull()
    const parsed = JSON.parse(out as string) as ParsedOutput
    expect(parsed.hookSpecificOutput.hookEventName).toBe('SessionStart')
    expect(parsed.hookSpecificOutput.additionalContext).toBe(contents)
  })

  it('returns null (silent exit) when .agent/routing.md is absent', () => {
    const cwd = tmp()
    expect(buildOutput({}, cwd, {})).toBeNull()
  })

  it('returns null when .agent/routing.md is empty', () => {
    const cwd = tmp()
    writeRoutingMd(cwd, '')
    expect(buildOutput({}, cwd, {})).toBeNull()
  })

  it('truncates contents larger than 200KB and appends notice', () => {
    const cwd = tmp()
    const big = 'x'.repeat(MAX_BYTES + 5_000)
    writeRoutingMd(cwd, big)

    const out = buildOutput({}, cwd, {})
    expect(out).not.toBeNull()
    const parsed = JSON.parse(out as string) as ParsedOutput
    const ctx = parsed.hookSpecificOutput.additionalContext
    expect(ctx.endsWith(TRUNCATION_NOTICE)).toBe(true)
    expect(ctx.length).toBe(MAX_BYTES + TRUNCATION_NOTICE.length)
  })

  it('CLAUDE_PROJECT_DIR takes precedence over cwd', () => {
    const cwd = tmp()
    const projectDir = tmp()
    writeRoutingMd(cwd, 'CWD CONTENT')
    writeRoutingMd(projectDir, 'PROJECT DIR CONTENT')

    const out = buildOutput({}, cwd, { CLAUDE_PROJECT_DIR: projectDir })
    expect(out).not.toBeNull()
    const parsed = JSON.parse(out as string) as ParsedOutput
    expect(parsed.hookSpecificOutput.additionalContext).toBe('PROJECT DIR CONTENT')
  })

  it('input.cwd is ignored in favor of explicit cwd / env (env takes precedence)', () => {
    const cwd = tmp()
    writeRoutingMd(cwd, 'CWD CONTENT')

    const out = buildOutput({ cwd: '/nonexistent/path' }, cwd, {})
    expect(out).not.toBeNull()
    const parsed = JSON.parse(out as string) as ParsedOutput
    expect(parsed.hookSpecificOutput.additionalContext).toBe('CWD CONTENT')
  })

  it('runs in <50ms on a small file', () => {
    const cwd = tmp()
    writeRoutingMd(cwd, '# Routing\nshort content\n')

    // Warm up to avoid first-call overhead skewing the measurement.
    buildOutput({}, cwd, {})

    const t0 = performance.now()
    const out = buildOutput({}, cwd, {})
    const elapsed = performance.now() - t0

    expect(out).not.toBeNull()
    expect(elapsed).toBeLessThan(50)
  })

  it('handles unreadable target dir gracefully (returns null)', () => {
    // Pointing at a path that does not exist should be a silent no-op.
    expect(buildOutput({}, '/definitely/not/a/real/path/xyz', {})).toBeNull()
  })
})
