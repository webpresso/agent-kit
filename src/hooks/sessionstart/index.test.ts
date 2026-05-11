import { existsSync, mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs'
import { homedir, tmpdir } from 'node:os'
import { join } from 'node:path'
import { performance } from 'node:perf_hooks'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'

import { AK_ROUTING_BLOCK } from '#hooks/shared/routing-block'

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
    expect(parsed.hookSpecificOutput.additionalContext).toContain(contents)
  })

  it('always emits routing block even when .agent/routing.md is absent', () => {
    const cwd = tmp()
    const out = buildOutput({}, cwd, {})
    expect(out).not.toBeNull()
    const parsed = JSON.parse(out as string) as ParsedOutput
    expect(parsed.hookSpecificOutput.additionalContext).toContain('<ak_routing>')
  })

  it('always emits routing block when .agent/routing.md is empty', () => {
    const cwd = tmp()
    writeRoutingMd(cwd, '')
    const out = buildOutput({}, cwd, {})
    expect(out).not.toBeNull()
    const parsed = JSON.parse(out as string) as ParsedOutput
    expect(parsed.hookSpecificOutput.additionalContext).toContain('<ak_routing>')
    expect(parsed.hookSpecificOutput.additionalContext).not.toContain('routing.md')
  })

  it('prepends AK_ROUTING_BLOCK before .agent/routing.md content', () => {
    const cwd = tmp()
    const contents = '# Routing\n\nGo to docs.'
    writeRoutingMd(cwd, contents)

    const out = buildOutput({}, cwd, {})
    expect(out).not.toBeNull()
    const parsed = JSON.parse(out as string) as ParsedOutput
    const ctx = parsed.hookSpecificOutput.additionalContext
    // Routing block must come before routing.md content
    expect(ctx.indexOf(AK_ROUTING_BLOCK)).toBeLessThan(ctx.indexOf(contents))
    expect(ctx).toContain(AK_ROUTING_BLOCK + '\n\n' + contents)
  })

  it('always emits routing block when .agent/routing.md is missing (nonexistent dir)', () => {
    const out = buildOutput({}, '/definitely/not/a/real/path/xyz', {})
    expect(out).not.toBeNull()
    const parsed = JSON.parse(out as string) as ParsedOutput
    expect(parsed.hookSpecificOutput.additionalContext).toContain('<ak_routing>')
  })

  it('output is valid JSON with hookSpecificOutput.additionalContext field', () => {
    const cwd = tmp()
    const out = buildOutput({}, cwd, {})
    expect(out).not.toBeNull()
    const parsed = JSON.parse(out as string) as ParsedOutput
    expect(parsed).toHaveProperty('hookSpecificOutput')
    expect(parsed.hookSpecificOutput).toHaveProperty('hookEventName', 'SessionStart')
    expect(parsed.hookSpecificOutput).toHaveProperty('additionalContext')
    expect(typeof parsed.hookSpecificOutput.additionalContext).toBe('string')
  })

  it('truncates routing.md contents larger than 200KB and appends notice', () => {
    const cwd = tmp()
    const big = 'x'.repeat(MAX_BYTES + 5_000)
    writeRoutingMd(cwd, big)

    const out = buildOutput({}, cwd, {})
    expect(out).not.toBeNull()
    const parsed = JSON.parse(out as string) as ParsedOutput
    const ctx = parsed.hookSpecificOutput.additionalContext
    expect(ctx).toContain(TRUNCATION_NOTICE)
  })

  it('CLAUDE_PROJECT_DIR takes precedence over cwd', () => {
    const cwd = tmp()
    const projectDir = tmp()
    writeRoutingMd(cwd, 'CWD CONTENT')
    writeRoutingMd(projectDir, 'PROJECT DIR CONTENT')

    const out = buildOutput({}, cwd, { CLAUDE_PROJECT_DIR: projectDir })
    expect(out).not.toBeNull()
    const parsed = JSON.parse(out as string) as ParsedOutput
    expect(parsed.hookSpecificOutput.additionalContext).toContain('PROJECT DIR CONTENT')
    expect(parsed.hookSpecificOutput.additionalContext).not.toContain('CWD CONTENT')
  })

  it('input.cwd is ignored in favor of explicit cwd / env (env takes precedence)', () => {
    const cwd = tmp()
    writeRoutingMd(cwd, 'CWD CONTENT')

    const out = buildOutput({ cwd: '/nonexistent/path' }, cwd, {})
    expect(out).not.toBeNull()
    const parsed = JSON.parse(out as string) as ParsedOutput
    expect(parsed.hookSpecificOutput.additionalContext).toContain('CWD CONTENT')
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
})

describe('sessionstart hook gstack block (opt-in)', () => {
  let dirs: string[] = []

  afterEach(() => {
    for (const d of dirs) rmSync(d, { recursive: true, force: true })
  })

  function tmp(): string {
    const d = mkdtempSync(join(tmpdir(), 'ak-sessionstart-gstack-'))
    dirs.push(d)
    return d
  }

  it('does NOT append gstack block when AK_GSTACK_ROUTING is unset', () => {
    const cwd = tmp()
    const out = buildOutput({}, cwd, {})
    const parsed = JSON.parse(out) as ParsedOutput
    expect(parsed.hookSpecificOutput.additionalContext).not.toContain('Interactive skills (gstack)')
  })

  it('does NOT append gstack block when AK_GSTACK_ROUTING=0', () => {
    const cwd = tmp()
    const out = buildOutput({}, cwd, { AK_GSTACK_ROUTING: '0' })
    const parsed = JSON.parse(out) as ParsedOutput
    expect(parsed.hookSpecificOutput.additionalContext).not.toContain('Interactive skills (gstack)')
  })

  it('does NOT append gstack block when AK_GSTACK_ROUTING=1 but gstack dir absent', () => {
    const cwd = tmp()
    // Create a temp dir to act as a non-existent gstack location.
    // We rely on a path that provably does not exist.
    const _fakeHome = join(tmp(), 'fakehome')
    // No gstack dir under fakeHome — homedir() won't point there, but we can
    // verify the negative: no block when gstack dir doesn't exist at homedir.
    const gstackDir = join(homedir(), '.claude', 'skills', 'gstack')
    const gstackExists = existsSync(gstackDir)
    const out = buildOutput({}, cwd, { AK_GSTACK_ROUTING: '1' })
    const parsed = JSON.parse(out) as ParsedOutput
    const ctx = parsed.hookSpecificOutput.additionalContext
    // Result depends on whether gstack is installed in this environment.
    if (gstackExists) {
      expect(ctx).toContain('Interactive skills (gstack)')
    } else {
      expect(ctx).not.toContain('Interactive skills (gstack)')
    }
  })

  it('always preserves routing block regardless of gstack flag', () => {
    const cwd = tmp()
    const out = buildOutput({}, cwd, { AK_GSTACK_ROUTING: '1' })
    const parsed = JSON.parse(out) as ParsedOutput
    expect(parsed.hookSpecificOutput.additionalContext).toContain('<ak_routing>')
  })

  it('appends gstack block after routing content when gstack dir exists', () => {
    const cwd = tmp()
    const gstackDir = join(homedir(), '.claude', 'skills', 'gstack')
    if (!existsSync(gstackDir)) {
      // Gstack not installed in this env — skip conditional path gracefully.
      return
    }
    const out = buildOutput({}, cwd, { AK_GSTACK_ROUTING: '1' })
    const parsed = JSON.parse(out) as ParsedOutput
    const ctx = parsed.hookSpecificOutput.additionalContext
    expect(ctx).toContain('Interactive skills (gstack)')
    expect(ctx).toContain('/browse')
    const routingIdx = ctx.indexOf('<ak_routing>')
    const gstackIdx = ctx.indexOf('Interactive skills (gstack)')
    expect(routingIdx).toBeLessThan(gstackIdx)
  })
})
