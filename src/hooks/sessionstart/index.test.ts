import { existsSync, mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs'
import { homedir, tmpdir } from 'node:os'
import { join } from 'node:path'
import { performance } from 'node:perf_hooks'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

import { WP_ROUTING_BLOCK } from '#hooks/shared/routing-block'

// Mock update-banner so state-root (which requires env-paths/proper-lockfile) is
// never imported in the index test environment.
vi.mock('./update-banner.js', () => ({
  readUpdateBanner: vi.fn(() => null),
}))

// Mock session-memory restore to avoid SQLite in unit tests
vi.mock('#session-memory/session', () => ({
  restore: vi.fn(() => ({ hits: [], snapshotId: null })),
  captureEvent: vi.fn(() => true),
  snapshot: vi.fn(async () => ({ snapshotId: 'test-snap', eventsIncluded: 0, partial: false })),
}))

vi.mock('#session-memory/repo-hash', () => ({
  computeRepoHash: vi.fn(() => 'test-hash-1234'),
}))

import { readUpdateBanner } from './update-banner.js'
import { restore } from '#session-memory/session'
import { buildOutput, buildSessionKnowledgeBlock, MAX_BYTES, TRUNCATION_NOTICE } from './index.js'

const mockReadUpdateBanner = vi.mocked(readUpdateBanner)
const mockRestore = vi.mocked(restore)

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
    mockRestore.mockReturnValue({ hits: [], snapshotId: null })
  })

  afterEach(() => {
    for (const d of dirs) rmSync(d, { recursive: true, force: true })
  })

  function tmp(): string {
    const d = makeFixture()
    dirs.push(d)
    return d
  }

  it('emits valid JSON additionalContext when .agent/routing.md exists', async () => {
    const cwd = tmp()
    const contents = '# Routing\n\nGo to docs.'
    writeRoutingMd(cwd, contents)

    const out = await buildOutput({}, cwd, {})

    expect(out).not.toBeNull()
    const parsed = JSON.parse(out) as ParsedOutput
    expect(parsed.hookSpecificOutput.hookEventName).toBe('SessionStart')
    expect(parsed.hookSpecificOutput.additionalContext).toContain(contents)
  })

  it('always emits routing block even when .agent/routing.md is absent', async () => {
    const cwd = tmp()
    const out = await buildOutput({}, cwd, {})
    expect(out).not.toBeNull()
    const parsed = JSON.parse(out) as ParsedOutput
    expect(parsed.hookSpecificOutput.additionalContext).toContain('<wp_routing>')
  })

  it('always emits routing block when .agent/routing.md is empty', async () => {
    const cwd = tmp()
    writeRoutingMd(cwd, '')
    const out = await buildOutput({}, cwd, {})
    expect(out).not.toBeNull()
    const parsed = JSON.parse(out) as ParsedOutput
    expect(parsed.hookSpecificOutput.additionalContext).toContain('<wp_routing>')
    expect(parsed.hookSpecificOutput.additionalContext).not.toContain('routing.md')
  })

  it('prepends WP_ROUTING_BLOCK before .agent/routing.md content', async () => {
    const cwd = tmp()
    const contents = '# Routing\n\nGo to docs.'
    writeRoutingMd(cwd, contents)

    const out = await buildOutput({}, cwd, {})
    expect(out).not.toBeNull()
    const parsed = JSON.parse(out) as ParsedOutput
    const ctx = parsed.hookSpecificOutput.additionalContext
    // Routing block must come before routing.md content
    expect(ctx.indexOf(WP_ROUTING_BLOCK)).toBeLessThan(ctx.indexOf(contents))
    expect(ctx).toContain(WP_ROUTING_BLOCK + '\n\n' + contents)
  })

  it('always emits routing block when .agent/routing.md is missing (nonexistent dir)', async () => {
    const out = await buildOutput({}, '/definitely/not/a/real/path/xyz', {})
    expect(out).not.toBeNull()
    const parsed = JSON.parse(out) as ParsedOutput
    expect(parsed.hookSpecificOutput.additionalContext).toContain('<wp_routing>')
  })

  it('output is valid JSON with hookSpecificOutput.additionalContext field', async () => {
    const cwd = tmp()
    const out = await buildOutput({}, cwd, {})
    expect(out).not.toBeNull()
    const parsed = JSON.parse(out) as ParsedOutput
    expect(parsed).toHaveProperty('hookSpecificOutput')
    expect(parsed.hookSpecificOutput).toHaveProperty('hookEventName', 'SessionStart')
    expect(parsed.hookSpecificOutput).toHaveProperty('additionalContext')
    expect(typeof parsed.hookSpecificOutput.additionalContext).toBe('string')
  })

  it('truncates routing.md contents larger than 200KB and appends notice', async () => {
    const cwd = tmp()
    const big = 'x'.repeat(MAX_BYTES + 5_000)
    writeRoutingMd(cwd, big)

    const out = await buildOutput({}, cwd, {})
    expect(out).not.toBeNull()
    const parsed = JSON.parse(out) as ParsedOutput
    const ctx = parsed.hookSpecificOutput.additionalContext
    expect(ctx).toContain(TRUNCATION_NOTICE)
  })

  it('CLAUDE_PROJECT_DIR takes precedence over cwd', async () => {
    const cwd = tmp()
    const projectDir = tmp()
    writeRoutingMd(cwd, 'CWD CONTENT')
    writeRoutingMd(projectDir, 'PROJECT DIR CONTENT')

    const out = await buildOutput({}, cwd, { CLAUDE_PROJECT_DIR: projectDir })
    expect(out).not.toBeNull()
    const parsed = JSON.parse(out) as ParsedOutput
    expect(parsed.hookSpecificOutput.additionalContext).toContain('PROJECT DIR CONTENT')
    expect(parsed.hookSpecificOutput.additionalContext).not.toContain('CWD CONTENT')
  })

  it('input.cwd is ignored in favor of explicit cwd / env (env takes precedence)', async () => {
    const cwd = tmp()
    writeRoutingMd(cwd, 'CWD CONTENT')

    const out = await buildOutput({ cwd: '/nonexistent/path' }, cwd, {})
    expect(out).not.toBeNull()
    const parsed = JSON.parse(out) as ParsedOutput
    expect(parsed.hookSpecificOutput.additionalContext).toContain('CWD CONTENT')
  })

  it('runs in <100ms on a small file', async () => {
    const cwd = tmp()
    writeRoutingMd(cwd, '# Routing\nshort content\n')

    // Warm up to avoid first-call overhead skewing the measurement.
    await buildOutput({}, cwd, {})

    const t0 = performance.now()
    const out = await buildOutput({}, cwd, {})
    const elapsed = performance.now() - t0

    expect(out).not.toBeNull()
    expect(elapsed).toBeLessThan(100)
  })
})

describe('sessionstart hook — compact-source restore', () => {
  let dirs: string[] = []

  beforeEach(() => {
    dirs = []
    mockRestore.mockReturnValue({ hits: [], snapshotId: null })
  })

  afterEach(() => {
    for (const d of dirs) rmSync(d, { recursive: true, force: true })
    vi.clearAllMocks()
  })

  function tmp(): string {
    const d = mkdtempSync(join(tmpdir(), 'ak-sessionstart-compact-'))
    dirs.push(d)
    return d
  }

  it('source=compact with non-empty restore → emits <session_knowledge> block', async () => {
    const cwd = tmp()
    mockRestore.mockReturnValue({
      hits: [
        { content: 'implemented session memory store', source: 'session:snap1', tier: 'porter' },
      ],
      snapshotId: 'snap1',
    })

    const out = await buildOutput(
      { source: 'compact', last_user_prompt: 'session memory' },
      cwd,
      {},
    )
    const parsed = JSON.parse(out) as ParsedOutput
    expect(parsed.hookSpecificOutput.additionalContext).toContain('<session_knowledge')
    expect(parsed.hookSpecificOutput.additionalContext).toContain('session memory store')
  })

  it('source=compact with empty restore → no <session_knowledge> block', async () => {
    const cwd = tmp()
    mockRestore.mockReturnValue({ hits: [], snapshotId: null })

    const out = await buildOutput({ source: 'compact' }, cwd, {})
    const parsed = JSON.parse(out) as ParsedOutput
    expect(parsed.hookSpecificOutput.additionalContext).not.toContain('<session_knowledge')
  })

  it('source=startup → restore NOT called', async () => {
    const cwd = tmp()

    const out = await buildOutput({ source: 'startup' }, cwd, {})
    const parsed = JSON.parse(out) as ParsedOutput
    // restore should not have been called for startup source
    expect(mockRestore).not.toHaveBeenCalled()
    expect(parsed.hookSpecificOutput.additionalContext).not.toContain('<session_knowledge')
  })

  it('source=resume → restore NOT called', async () => {
    const cwd = tmp()

    await buildOutput({ source: 'resume' }, cwd, {})
    expect(mockRestore).not.toHaveBeenCalled()
  })

  it('restore failure is non-blocking — still emits routing block', async () => {
    const cwd = tmp()
    mockRestore.mockImplementation(() => {
      throw new Error('SQLite locked')
    })
    vi.spyOn(process.stderr, 'write').mockImplementation(() => true)

    const out = await buildOutput({ source: 'compact' }, cwd, {})
    const parsed = JSON.parse(out) as ParsedOutput
    expect(parsed.hookSpecificOutput.additionalContext).toContain('<wp_routing>')
    expect(parsed.hookSpecificOutput.additionalContext).not.toContain('<session_knowledge')
  })
})

describe('buildSessionKnowledgeBlock', () => {
  it('returns empty string for empty hits', () => {
    expect(buildSessionKnowledgeBlock([], 'query')).toBe('')
  })

  it('wraps hits in <session_knowledge> tag', () => {
    const block = buildSessionKnowledgeBlock(
      [{ content: 'some content', source: 'src1', tier: 'porter' }],
      'test query',
    )
    expect(block).toContain('<session_knowledge')
    expect(block).toContain('</session_knowledge>')
    expect(block).toContain('some content')
  })

  it('HTML-escapes entry content', () => {
    const block = buildSessionKnowledgeBlock(
      [{ content: '<evil>injection</evil>', source: 'src', tier: 'porter' }],
      'q',
    )
    expect(block).not.toContain('<evil>')
    expect(block).toContain('&lt;evil&gt;')
  })
})

describe('sessionstart hook gstack block (opt-in)', () => {
  let dirs: string[] = []

  beforeEach(() => {
    mockRestore.mockReturnValue({ hits: [], snapshotId: null })
  })

  afterEach(() => {
    for (const d of dirs) rmSync(d, { recursive: true, force: true })
  })

  function tmp(): string {
    const d = mkdtempSync(join(tmpdir(), 'wp-sessionstart-gstack-'))
    dirs.push(d)
    return d
  }

  it('does NOT append gstack block when WP_GSTACK_ROUTING is unset', async () => {
    const cwd = tmp()
    const out = await buildOutput({}, cwd, {})
    const parsed = JSON.parse(out) as ParsedOutput
    expect(parsed.hookSpecificOutput.additionalContext).not.toContain('Interactive skills (gstack)')
  })

  it('does NOT append gstack block when WP_GSTACK_ROUTING=0', async () => {
    const cwd = tmp()
    const out = await buildOutput({}, cwd, { WP_GSTACK_ROUTING: '0' })
    const parsed = JSON.parse(out) as ParsedOutput
    expect(parsed.hookSpecificOutput.additionalContext).not.toContain('Interactive skills (gstack)')
  })

  it('does NOT append gstack block when WP_GSTACK_ROUTING=1 but gstack dir absent', async () => {
    const cwd = tmp()
    const gstackDir = join(homedir(), '.claude', 'skills', 'gstack')
    const gstackExists = existsSync(gstackDir)
    const out = await buildOutput({}, cwd, { WP_GSTACK_ROUTING: '1' })
    const parsed = JSON.parse(out) as ParsedOutput
    const ctx = parsed.hookSpecificOutput.additionalContext
    if (gstackExists) {
      expect(ctx).toContain('Interactive skills (gstack)')
    } else {
      expect(ctx).not.toContain('Interactive skills (gstack)')
    }
  })

  it('always preserves routing block regardless of gstack flag', async () => {
    const cwd = tmp()
    const out = await buildOutput({}, cwd, { WP_GSTACK_ROUTING: '1' })
    const parsed = JSON.parse(out) as ParsedOutput
    expect(parsed.hookSpecificOutput.additionalContext).toContain('<wp_routing>')
  })
})

describe('sessionstart hook update banner', () => {
  let dirs: string[] = []

  beforeEach(() => {
    dirs = []
    mockReadUpdateBanner.mockReturnValue(null)
    mockRestore.mockReturnValue({ hits: [], snapshotId: null })
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

  it('appends <wp_update> to additionalContext when readUpdateBanner returns a banner', async () => {
    const cwd = tmp()
    const banner =
      '<wp_update>webpresso 2.0.0 available (current 1.0.0). Auto-install runs on the next `wp` invocation, or set WP_SKIP_AUTO_INSTALL=1 to opt out.</wp_update>'
    mockReadUpdateBanner.mockReturnValue(banner)

    const out = await buildOutput({}, cwd, {})
    const parsed = JSON.parse(out) as ParsedOutput
    expect(parsed.hookSpecificOutput.additionalContext).toContain('<wp_update>')
    expect(parsed.hookSpecificOutput.additionalContext).toContain('webpresso 2.0.0 available')
  })

  it('does not include <wp_update> when readUpdateBanner returns null', async () => {
    const cwd = tmp()
    mockReadUpdateBanner.mockReturnValue(null)

    const out = await buildOutput({}, cwd, {})
    const parsed = JSON.parse(out) as ParsedOutput
    expect(parsed.hookSpecificOutput.additionalContext).not.toContain('<wp_update>')
    expect(parsed.hookSpecificOutput.additionalContext).toContain('<wp_routing>')
  })
})
