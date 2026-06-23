import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { performance } from 'node:perf_hooks'
import { spawnSync } from 'node:child_process'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

import { WP_ROUTING_BLOCK } from '#hooks/shared/routing-block'
import { SessionMemorySessionStore } from '../../session-memory/session.js'
import { Database } from '#db/sqlite.js'

// Mock update-banner so state-root (which requires env-paths/proper-lockfile) is
// never imported in the index test environment.
vi.mock('./update-banner.js', () => ({
  readUpdateBanner: vi.fn(() => null),
}))

import { readUpdateBanner } from './update-banner.js'
import { buildOutput, MAX_BYTES, RESUME_CAP_MS, TRUNCATION_NOTICE } from './index.js'

const mockReadUpdateBanner = vi.mocked(readUpdateBanner)

interface ParsedOutput {
  hookSpecificOutput: {
    hookEventName: string
    additionalContext: string
  }
}

function makeFixture(): string {
  return mkdtempSync(join(tmpdir(), 'wp-sessionstart-'))
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
    expect(parsed.hookSpecificOutput.additionalContext).toContain('<wp_routing>')
  })

  it('always emits routing block when .agent/routing.md is empty', () => {
    const cwd = tmp()
    writeRoutingMd(cwd, '')
    const out = buildOutput({}, cwd, {})
    expect(out).not.toBeNull()
    const parsed = JSON.parse(out as string) as ParsedOutput
    expect(parsed.hookSpecificOutput.additionalContext).toContain('<wp_routing>')
    expect(parsed.hookSpecificOutput.additionalContext).not.toContain('routing.md')
  })

  it('prepends WP_ROUTING_BLOCK before .agent/routing.md content', () => {
    const cwd = tmp()
    const contents = '# Routing\n\nGo to docs.'
    writeRoutingMd(cwd, contents)

    const out = buildOutput({}, cwd, {})
    expect(out).not.toBeNull()
    const parsed = JSON.parse(out as string) as ParsedOutput
    const ctx = parsed.hookSpecificOutput.additionalContext
    // Routing block must come before routing.md content
    expect(ctx.indexOf(WP_ROUTING_BLOCK)).toBeLessThan(ctx.indexOf(contents))
    expect(ctx).toContain(WP_ROUTING_BLOCK + '\n\n' + contents)
  })

  it('always emits routing block when .agent/routing.md is missing (nonexistent dir)', () => {
    const out = buildOutput({}, '/definitely/not/a/real/path/xyz', {})
    expect(out).not.toBeNull()
    const parsed = JSON.parse(out as string) as ParsedOutput
    expect(parsed.hookSpecificOutput.additionalContext).toContain('<wp_routing>')
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

  it('emits only supported SessionStart output fields', () => {
    const cwd = tmp()
    const parsed = JSON.parse(buildOutput({}, cwd, {})) as ParsedOutput

    expect(Object.keys(parsed).sort()).toStrictEqual(['hookSpecificOutput'])
    expect(Object.keys(parsed.hookSpecificOutput).sort()).toStrictEqual([
      'additionalContext',
      'hookEventName',
    ])
    expect(Object.hasOwn(parsed, 'decision')).toBe(false)
    expect(Object.hasOwn(parsed, 'reason')).toBe(false)
    expect(Object.hasOwn(parsed, 'continue')).toBe(false)
    expect(Object.hasOwn(parsed, 'stopReason')).toBe(false)
    expect(Object.hasOwn(parsed, 'suppressOutput')).toBe(false)
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

  it('keeps routing-only SessionStart injection on the fast path', () => {
    const cwd = tmp()
    writeRoutingMd(cwd, '# Routing\nshort content\n')

    // Warm up to avoid first-call overhead skewing the measurement.
    buildOutput({}, cwd, { WP_SESSIONSTART_RESUME_CAP_MS: '0' })

    const t0 = performance.now()
    const out = buildOutput({}, cwd, { WP_SESSIONSTART_RESUME_CAP_MS: '0' })
    const elapsed = performance.now() - t0

    expect(out).not.toBeNull()
    expect(elapsed).toBeLessThan(50)
  })

  it('keeps resume injection within the release latency budget', () => {
    const cwd = tmp()
    const dbPath = join(cwd, 'sessions.sqlite')
    const store = new SessionMemorySessionStore(dbPath)
    store.captureEvent({
      repoHash: 'repo123456789abcd',
      sessionId: 'session-1',
      agentId: 'agent-1',
      event: {
        eventId: 'evt-latency',
        eventType: 'decision',
        toolName: 'UserPromptSubmit',
        content: 'Restore continuity details for the next turn.',
        summary: 'Restore continuity',
        priority: 90,
        metadata: { source: 'resume' },
      },
    })
    store.close()

    buildOutput(
      { source: 'resume', session_id: 'session-1' },
      cwd,
      {},
      {
        dbPath,
        repoHash: () => 'repo123456789abcd',
      },
    )

    const t0 = performance.now()
    const out = buildOutput(
      { source: 'resume', session_id: 'session-1' },
      cwd,
      {},
      {
        dbPath,
        repoHash: () => 'repo123456789abcd',
      },
    )
    const elapsed = performance.now() - t0

    expect(out).toContain('<wp_session_continuity')
    expect(elapsed).toBeLessThan(RESUME_CAP_MS)
  })

  it.each(['startup', 'resume', 'compact'])(
    'injects bounded continuity restore context for %s SessionStart without dropping routing',
    (source) => {
      const cwd = tmp()
      const dbPath = join(cwd, 'sessions.sqlite')
      const store = new SessionMemorySessionStore(dbPath)
      store.captureEvent({
        repoHash: 'repo123456789abcd',
        sessionId: 'session-1',
        agentId: 'agent-1',
        event: {
          eventId: `evt-${source}`,
          eventType: source === 'compact' ? 'compaction_boundary' : 'decision',
          toolName: source === 'compact' ? 'PreCompact' : 'UserPromptSubmit',
          content: `Restore ${source} continuity details for the next turn.`,
          summary: `Restore ${source} continuity`,
          priority: 90,
          metadata: { source },
        },
      })
      store.close()

      const out = buildOutput(
        { source, session_id: 'session-1', agent_id: 'agent-1' },
        cwd,
        {},
        {
          dbPath,
          repoHash: () => 'repo123456789abcd',
        },
      )
      const parsed = JSON.parse(out) as ParsedOutput
      const ctx = parsed.hookSpecificOutput.additionalContext

      expect(ctx).toContain(WP_ROUTING_BLOCK)
      expect(ctx).toContain('<wp_session_continuity')
      expect(ctx).toContain(`source="${source}"`)
      expect(ctx).toContain(`Restore ${source} continuity`)
      expect(ctx.indexOf(WP_ROUTING_BLOCK)).toBeLessThan(ctx.indexOf('<wp_session_continuity'))
    },
  )

  it('caps continuity restore context and excludes raw oversized payloads', () => {
    const cwd = tmp()
    const dbPath = join(cwd, 'sessions.sqlite')
    const store = new SessionMemorySessionStore(dbPath)
    const oversized = 'RAW-OVERSIZED-PAYLOAD '.repeat(500)
    store.captureEvent({
      repoHash: 'repo123456789abcd',
      sessionId: 'session-1',
      agentId: 'agent-1',
      event: {
        eventId: 'evt-large',
        eventType: 'assistant_turn_summary',
        toolName: 'Stop',
        content: oversized,
        summary: 'Large turn summary',
        priority: 90,
      },
    })
    store.close()

    const out = buildOutput(
      { source: 'resume', session_id: 'session-1', agent_id: 'agent-1' },
      cwd,
      { WP_SESSIONSTART_RESUME_MAX_EVENT_BYTES: '128', WP_SESSIONSTART_RESUME_MAX_BYTES: '700' },
      {
        dbPath,
        repoHash: () => 'repo123456789abcd',
      },
    )
    const ctx = (JSON.parse(out) as ParsedOutput).hookSpecificOutput.additionalContext

    expect(Buffer.byteLength(ctx, 'utf8')).toBeLessThan(MAX_BYTES)
    expect(ctx).toContain('"summary":"Large turn summary"')
    expect(ctx).toContain('"truncated":true')
    expect(ctx).not.toContain(oversized)
  })

  it('redacts env-style, bearer, summary, and metadata secrets before continuity injection', () => {
    const cwd = tmp()
    const dbPath = join(cwd, 'sessions.sqlite')
    const store = new SessionMemorySessionStore(dbPath)
    store.captureEvent({
      repoHash: 'repo123456789abcd',
      sessionId: 'session-1',
      agentId: 'agent-1',
      event: {
        eventId: 'evt-secret',
        eventType: 'decision',
        toolName: 'UserPromptSubmit',
        content:
          'OPENAI_API_KEY=sk-secret Authorization: Bearer ghp-secret Bearer ghp-bare-token keep context',
        summary: 'GITHUB_TOKEN=ghs-secret Bearer ghs-summary-token summary',
        priority: 90,
        metadata: {
          nested: { apiKey: 'metadata-secret' },
          note: 'password=hunter2 Bearer meta-token',
        },
      },
    })
    store.close()

    const out = buildOutput(
      { source: 'resume', session_id: 'session-1' },
      cwd,
      {},
      { dbPath, repoHash: () => 'repo123456789abcd' },
    )
    const ctx = (JSON.parse(out) as ParsedOutput).hookSpecificOutput.additionalContext

    expect(ctx).toContain('OPENAI_API_KEY=[REDACTED]')
    expect(ctx).toContain('Authorization: Bearer [REDACTED]')
    expect(ctx).toContain('Bearer [REDACTED] keep context')
    expect(ctx).toContain('GITHUB_TOKEN=[REDACTED]')
    expect(ctx).toContain('"apiKey":"[REDACTED]"')
    expect(ctx).toContain('password=[REDACTED]')
    expect(ctx).toContain('"redacted":true')
    expect(ctx).not.toContain('sk-secret')
    expect(ctx).not.toContain('ghp-secret')
    expect(ctx).not.toContain('ghs-secret')
    expect(ctx).not.toContain('ghp-bare-token')
    expect(ctx).not.toContain('ghs-summary-token')
    expect(ctx).not.toContain('meta-token')
    expect(ctx).not.toContain('metadata-secret')
    expect(ctx).not.toContain('hunter2')
  })

  it('skips continuity restore when the resume cap is exceeded before querying', () => {
    const cwd = tmp()
    const out = buildOutput(
      { source: 'resume', session_id: 'session-1' },
      cwd,
      { WP_SESSIONSTART_RESUME_CAP_MS: '1' },
      {
        createDatabase: () => {
          const start = performance.now()
          while (performance.now() - start < 5) {
            // burn the tiny test budget deterministically
          }
          return {
            prepare: () => {
              throw new Error('query should not run after resume cap is exceeded')
            },
            close: () => undefined,
          }
        },
        repoHash: () => 'repo123456789abcd',
      },
    )
    const ctx = (JSON.parse(out) as ParsedOutput).hookSpecificOutput.additionalContext

    expect(ctx).toContain(WP_ROUTING_BLOCK)
    expect(ctx).not.toContain('<wp_session_continuity')
  })

  it('reads continuity context without writing snapshot rows on the SessionStart hot path', () => {
    const cwd = tmp()
    const dbPath = join(cwd, 'sessions.sqlite')
    const store = new SessionMemorySessionStore(dbPath)
    store.captureEvent({
      repoHash: 'repo123456789abcd',
      sessionId: 'session-1',
      agentId: 'agent-1',
      event: {
        eventId: 'evt-readonly',
        eventType: 'decision',
        toolName: 'UserPromptSubmit',
        content: 'Read without writing snapshot rows.',
        summary: 'Read-only restore',
        priority: 90,
      },
    })
    store.close()

    const countSnapshots = (): number => {
      const db = new Database(dbPath)
      try {
        return (
          db.prepare<[], { count: number }>('SELECT COUNT(*) AS count FROM sessions').get()
            ?.count ?? 0
        )
      } finally {
        db.close()
      }
    }

    expect(countSnapshots()).toBe(0)
    buildOutput(
      { source: 'resume', session_id: 'session-1' },
      cwd,
      {},
      {
        dbPath,
        repoHash: () => 'repo123456789abcd',
      },
    )
    expect(countSnapshots()).toBe(0)
  })

  it('keeps update banner after continuity restore context', () => {
    const cwd = tmp()
    const dbPath = join(cwd, 'sessions.sqlite')
    const store = new SessionMemorySessionStore(dbPath)
    store.captureEvent({
      repoHash: 'repo123456789abcd',
      sessionId: 'session-1',
      agentId: 'agent-1',
      event: {
        eventId: 'evt-decision',
        eventType: 'decision',
        toolName: 'UserPromptSubmit',
        content: 'Keep update banner and restore context together.',
        summary: 'Keep update banner',
        priority: 90,
      },
    })
    store.close()
    mockReadUpdateBanner.mockReturnValue('<wp_update>webpresso update ready</wp_update>')

    const out = buildOutput(
      { source: 'startup', session_id: 'session-1' },
      cwd,
      {},
      {
        dbPath,
        repoHash: () => 'repo123456789abcd',
      },
    )
    const ctx = (JSON.parse(out) as ParsedOutput).hookSpecificOutput.additionalContext

    expect(ctx).toContain('<wp_session_continuity')
    expect(ctx).toContain('<wp_update>')
    expect(ctx.indexOf('<wp_session_continuity')).toBeLessThan(ctx.indexOf('<wp_update>'))
  })

  it('fails open to routing-only JSON when continuity storage is unavailable', () => {
    const cwd = tmp()
    const out = buildOutput(
      { source: 'resume', session_id: 'session-1' },
      cwd,
      {},
      {
        createDatabase: () => {
          throw new Error('sqlite unavailable')
        },
        repoHash: () => 'repo123456789abcd',
      },
    )
    const parsed = JSON.parse(out) as ParsedOutput

    expect(parsed.hookSpecificOutput.additionalContext).toContain(WP_ROUTING_BLOCK)
    expect(parsed.hookSpecificOutput.additionalContext).not.toContain('<wp_session_continuity')
  })

  it('fails open on malformed stdin through the real hook entrypoint', () => {
    const result = spawnSync(process.env.BUN ?? 'bun', ['./src/hooks/sessionstart/index.ts'], {
      cwd: process.cwd(),
      input: 'not-json',
      encoding: 'utf8',
      env: { ...process.env, CLAUDE_PROJECT_DIR: process.cwd() },
    })

    expect(result.status).toBe(0)
    const parsed = JSON.parse(result.stdout) as ParsedOutput
    const ctx = parsed.hookSpecificOutput.additionalContext
    expect(parsed.hookSpecificOutput.hookEventName).toBe('SessionStart')
    const routingIndex = ctx.indexOf('<wp_routing>')
    expect(routingIndex).toBe(0)
    expect(ctx).toContain('<tool name="wp_test">')
    const continuityIndex = ctx.indexOf('<wp_session_continuity')
    if (continuityIndex !== -1) {
      expect(routingIndex).toBeLessThan(continuityIndex)
    }
  })
})

describe('sessionstart hook update banner', () => {
  let dirs: string[] = []

  beforeEach(() => {
    dirs = []
    mockReadUpdateBanner.mockReturnValue(null)
  })

  afterEach(() => {
    for (const d of dirs) rmSync(d, { recursive: true, force: true })
    vi.clearAllMocks()
  })

  function tmp(): string {
    const d = mkdtempSync(join(tmpdir(), 'wp-sessionstart-banner-'))
    dirs.push(d)
    return d
  }

  it('appends <wp_update> to additionalContext when readUpdateBanner returns a banner', () => {
    const cwd = tmp()
    const banner =
      '<wp_update>webpresso 2.0.0 available (current 1.0.0). Auto-install runs on the next `wp` invocation, or set WP_SKIP_AUTO_INSTALL=1 to opt out.</wp_update>'
    mockReadUpdateBanner.mockReturnValue(banner)

    const out = buildOutput({}, cwd, {})
    const parsed = JSON.parse(out) as ParsedOutput
    expect(parsed.hookSpecificOutput.additionalContext).toContain('<wp_update>')
    expect(parsed.hookSpecificOutput.additionalContext).toContain('webpresso 2.0.0 available')
  })

  it('does not include <wp_update> when readUpdateBanner returns null', () => {
    const cwd = tmp()
    mockReadUpdateBanner.mockReturnValue(null)

    const out = buildOutput({}, cwd, {})
    const parsed = JSON.parse(out) as ParsedOutput
    expect(parsed.hookSpecificOutput.additionalContext).not.toContain('<wp_update>')
    expect(parsed.hookSpecificOutput.additionalContext).toContain('<wp_routing>')
  })
})
