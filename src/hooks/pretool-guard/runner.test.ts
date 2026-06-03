/**
 * Integration tests for the pretool-guard pipeline.
 *
 * These tests spawn the real compiled binary (`dist/esm/hooks/pretool-guard/index.js`)
 * and feed it synthetic stdin payloads, asserting exit code and stdout JSON shape.
 *
 * MCP-ready is signalled by writing a sentinel file at
 * `${tmpdir()}/wp-mcp-ready-${SENTINEL_KEY}` and passing
 * `WP_MCP_SENTINEL_KEY=${SENTINEL_KEY}` to the spawned binary so reader and
 * writer agree on the filename without relying on PPID inheritance.
 * Only the MCP sentinel is used by the hook path.
 */

import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { spawnSync } from 'node:child_process'
import { existsSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { dirname } from 'node:path'

const __dirname = dirname(fileURLToPath(import.meta.url))
const BINARY = join(__dirname, '../../../dist/esm/hooks/pretool-guard/index.js')
const SENTINEL_KEY = `runner-test-${process.pid}`

// Per-test isolated TMPDIR — the binary's sentinel reader scans tmpdir for any
// `wp-mcp-ready-*` files, so without isolation real running MCP servers on the
// host machine would leak into the test and fool the readiness check.
let testTmpDir: string

function sentinelPath(): string {
  return join(testTmpDir, `wp-mcp-ready-${SENTINEL_KEY}`)
}

function runBinary(
  stdin: string,
  extraEnv: Record<string, string | undefined> = {},
): { stdout: string; stderr: string; status: number } {
  const result = spawnSync('node', [BINARY], {
    input: stdin,
    encoding: 'utf-8',
    timeout: 8000,
    env: {
      ...process.env,
      WP_MCP_SENTINEL_KEY: SENTINEL_KEY,
      // TMPDIR=tested directory so the binary's `os.tmpdir()` resolves to our
      // isolated dir on macOS/Linux. Node honours TMPDIR > TMP > TEMP > /tmp.
      TMPDIR: testTmpDir,
      TMP: testTmpDir,
      TEMP: testTmpDir,
      ...extraEnv,
    },
  })
  return {
    stdout: result.stdout ?? '',
    stderr: result.stderr ?? '',
    status: result.status ?? -1,
  }
}

function writeMcpSentinel(): void {
  writeFileSync(sentinelPath(), String(process.pid), 'utf-8')
}

function clearMcpSentinel(): void {
  if (existsSync(sentinelPath())) rmSync(sentinelPath())
}

function createRepoWithConfig(config: Record<string, unknown>): string {
  const repoDir = mkdtempSync(join(testTmpDir, 'wp-guard-repo-'))
  writeFileSync(join(repoDir, '.webpressorc.json'), JSON.stringify(config), 'utf-8')
  return repoDir
}

describe.skipIf(!existsSync(BINARY))('pretool-guard binary integration', () => {
  beforeEach(() => {
    testTmpDir = mkdtempSync(join(tmpdir(), 'wp-runner-test-'))
    clearMcpSentinel()
  })

  afterEach(() => {
    clearMcpSentinel()
    rmSync(testTmpDir, { recursive: true, force: true })
  })

  // ── Deny cases (MCP ready, first intercept) ───────────────────────────────

  it('vp exec vitest + MCP ready → exit 0, deny JSON with permissionDecision deny', () => {
    writeMcpSentinel()
    const payload = JSON.stringify({
      tool_name: 'Bash',
      tool_input: { command: 'vp exec vitest run' },
    })
    const { stdout, status } = runBinary(payload)
    expect(status).toBe(0)
    const parsed = JSON.parse(stdout) as {
      hookSpecificOutput: { permissionDecision: string; permissionDecisionReason: string }
    }
    expect(parsed.hookSpecificOutput.permissionDecision).toBe('deny')
    expect(parsed.hookSpecificOutput.permissionDecisionReason).toContain('wp_test')
  })

  it('vp exec oxlint + MCP ready → exit 0, deny JSON mentioning wp_lint', () => {
    writeMcpSentinel()
    const payload = JSON.stringify({
      tool_name: 'Bash',
      tool_input: { command: 'vp exec oxlint .' },
    })
    const { stdout, status } = runBinary(payload)
    expect(status).toBe(0)
    const parsed = JSON.parse(stdout) as {
      hookSpecificOutput: { permissionDecision: string; permissionDecisionReason: string }
    }
    expect(parsed.hookSpecificOutput.permissionDecision).toBe('deny')
    expect(parsed.hookSpecificOutput.permissionDecisionReason).toContain('wp_lint')
  })

  it('vp exec tsc + MCP ready → exit 0, deny JSON mentioning wp_typecheck', () => {
    writeMcpSentinel()
    const payload = JSON.stringify({
      tool_name: 'Bash',
      tool_input: { command: 'vp exec tsc --noEmit' },
    })
    const { stdout, status } = runBinary(payload)
    expect(status).toBe(0)
    const parsed = JSON.parse(stdout) as {
      hookSpecificOutput: { permissionDecision: string; permissionDecisionReason: string }
    }
    expect(parsed.hookSpecificOutput.permissionDecision).toBe('deny')
    expect(parsed.hookSpecificOutput.permissionDecisionReason).toContain('wp_typecheck')
  })

  it('vp exec prettier + MCP ready → exit 0, deny JSON mentioning wp_format', () => {
    writeMcpSentinel()
    const payload = JSON.stringify({
      tool_name: 'Bash',
      tool_input: { command: 'vp exec prettier README.md --write' },
    })
    const { stdout, status } = runBinary(payload)
    expect(status).toBe(0)
    const parsed = JSON.parse(stdout) as {
      hookSpecificOutput: { permissionDecision: string; permissionDecisionReason: string }
    }
    expect(parsed.hookSpecificOutput.permissionDecision).toBe('deny')
    expect(parsed.hookSpecificOutput.permissionDecisionReason).toContain('wp_format')
  })

  // ── Passthrough cases ─────────────────────────────────────────────────────

  it('ctx_execute build command + MCP ready → exit 0, passthrough without ctx loop', () => {
    writeMcpSentinel()
    const payload = JSON.stringify({
      toolName: 'mcp__context_mode__ctx_execute',
      toolInput: {
        language: 'shell',
        code: 'cd /repo && vp run build 2>&1 | tail -160',
      },
    })
    const { stdout, status } = runBinary(payload)
    expect(status).toBe(0)
    const parsed = JSON.parse(stdout) as Record<string, unknown>
    expect(parsed).toEqual({})
  })

  it('git status + MCP ready → exit 0, passthrough {} (not deny)', () => {
    writeMcpSentinel()
    const payload = JSON.stringify({ tool_name: 'Bash', tool_input: { command: 'git status' } })
    const { stdout, status } = runBinary(payload)
    expect(status).toBe(0)
    const parsed = JSON.parse(stdout) as Record<string, unknown>
    expect(parsed.hookSpecificOutput).toBeUndefined()
  })

  it('echo hello + MCP ready → exit 0, passthrough (no deny)', () => {
    writeMcpSentinel()
    const payload = JSON.stringify({ tool_name: 'Bash', tool_input: { command: 'echo hello' } })
    const { stdout, status } = runBinary(payload)
    expect(status).toBe(0)
    const parsed = JSON.parse(stdout) as Record<string, unknown>
    // Must be passthrough — no permissionDecision: deny
    expect(
      (parsed.hookSpecificOutput as { permissionDecision?: string } | undefined)
        ?.permissionDecision,
    ).not.toBe('deny')
  })

  // ── MCP-not-ready remains MCP-first (still denied) ────────────────────────

  it('vp test WITHOUT MCP sentinel → still deny for MCP-first routing', () => {
    const payload = JSON.stringify({
      tool_name: 'Bash',
      tool_input: { command: 'vp exec vitest run' },
    })
    const { stdout, status } = runBinary(payload)
    const parsed = JSON.parse(stdout) as {
      hookSpecificOutput: { permissionDecision: string; permissionDecisionReason: string }
    }
    expect(status).toBe(0)
    expect(parsed.hookSpecificOutput.permissionDecision).toBe('deny')
  })

  it('vp run test remains denied on repeated invocations even with MCP sentinel', () => {
    writeMcpSentinel()
    const payload = JSON.stringify({
      tool_name: 'Bash',
      tool_input: { command: 'vp exec vitest run' },
    })

    const first = runBinary(payload)
    expect(first.status).toBe(0)
    const firstParsed = JSON.parse(first.stdout) as {
      hookSpecificOutput: { permissionDecision: string }
    }
    expect(firstParsed.hookSpecificOutput.permissionDecision).toBe('deny')

    const second = runBinary(payload)
    expect(second.status).toBe(0)
    const secondParsed = JSON.parse(second.stdout) as {
      hookSpecificOutput: { permissionDecision: string }
    }
    expect(secondParsed.hookSpecificOutput.permissionDecision).toBe('deny')
  })

  it('consumer .webpressorc.json guard.scriptRoutes routes package scripts through canonical wp-pretool-guard', () => {
    const repoDir = createRepoWithConfig({
      version: '1',
      installed: { tier3Skills: [] },
      guard: { scriptRoutes: { 'docs:check': 'docs-frontmatter' } },
    })
    const payload = JSON.stringify({
      tool_name: 'Bash',
      tool_input: { command: 'pnpm run docs:check' },
    })

    const { stdout, stderr, status } = runBinary(payload, { CLAUDE_PROJECT_DIR: repoDir })

    expect(status).toBe(2)
    expect(stdout.trim()).toBe('')
    expect(stderr).toContain('[forbidden-commands]')
    expect(stderr).toContain('wp_audit(kind="docs-frontmatter")')
  })

  it('consumer .webpressorc.json guard.packageManager=vp-only routes raw pnpm through canonical wp-pretool-guard', () => {
    const repoDir = createRepoWithConfig({
      version: '1',
      installed: { tier3Skills: [] },
      guard: { packageManager: 'vp-only' },
    })
    const payload = JSON.stringify({
      tool_name: 'Bash',
      tool_input: { command: 'pnpm install --frozen-lockfile' },
    })

    const { stdout, stderr, status } = runBinary(payload, { CLAUDE_PROJECT_DIR: repoDir })

    expect(status).toBe(2)
    expect(stdout.trim()).toBe('')
    expect(stderr).toContain('[forbidden-commands]')
    expect(stderr).toContain('vp-only')
  })
})
