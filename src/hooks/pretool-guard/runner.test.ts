/**
 * Integration tests for the pretool-guard pipeline.
 *
 * These tests spawn the real compiled binary (`dist/esm/hooks/pretool-guard/index.js`)
 * and feed it synthetic stdin payloads, asserting exit code and stdout JSON shape.
 *
 * MCP-ready is signalled by writing a sentinel file at
 * `${tmpdir()}/ak-mcp-ready-${process.pid}` (the child's ppid equals our test process pid).
 * Throttle markers are written to `${tmpdir()}/ak-routing-guidance-${process.pid}-<type>`.
 * Both are cleaned up after each test.
 */

import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { spawnSync } from 'node:child_process'
import { existsSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { dirname } from 'node:path'

const __dirname = dirname(fileURLToPath(import.meta.url))
const BINARY = join(__dirname, '../../../dist/esm/hooks/pretool-guard/index.js')

function sentinelPath(): string {
  return join(tmpdir(), `ak-mcp-ready-${process.pid}`)
}

function throttleMarker(type: string): string {
  return join(tmpdir(), `ak-routing-guidance-${process.pid}-${type}`)
}

function runBinary(stdin: string): { stdout: string; stderr: string; status: number } {
  const result = spawnSync('node', [BINARY], {
    input: stdin,
    encoding: 'utf-8',
    timeout: 8000,
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

function clearThrottleMarkers(): void {
  for (const type of ['test', 'lint', 'typecheck', 'qa']) {
    const p = throttleMarker(type)
    if (existsSync(p)) rmSync(p)
  }
}

describe.skipIf(!existsSync(BINARY))('pretool-guard binary integration', () => {
  beforeEach(() => {
    clearMcpSentinel()
    clearThrottleMarkers()
  })

  afterEach(() => {
    clearMcpSentinel()
    clearThrottleMarkers()
  })

  // ── Deny cases (MCP ready, first intercept) ───────────────────────────────

  it('just test + MCP ready → exit 0, deny JSON with permissionDecision deny', () => {
    writeMcpSentinel()
    const payload = JSON.stringify({ tool_name: 'Bash', tool_input: { command: 'just test' } })
    const { stdout, status } = runBinary(payload)
    expect(status).toBe(0)
    const parsed = JSON.parse(stdout) as {
      hookSpecificOutput: { permissionDecision: string; permissionDecisionReason: string }
    }
    expect(parsed.hookSpecificOutput.permissionDecision).toBe('deny')
    expect(parsed.hookSpecificOutput.permissionDecisionReason).toContain('ak_test')
  })

  it('pnpm test + MCP ready → exit 0, deny JSON', () => {
    writeMcpSentinel()
    const payload = JSON.stringify({ tool_name: 'Bash', tool_input: { command: 'pnpm test' } })
    const { stdout, status } = runBinary(payload)
    expect(status).toBe(0)
    const parsed = JSON.parse(stdout) as {
      hookSpecificOutput: { permissionDecision: string }
    }
    expect(parsed.hookSpecificOutput.permissionDecision).toBe('deny')
  })

  it('just lint + MCP ready → exit 0, deny JSON mentioning ak_lint', () => {
    writeMcpSentinel()
    const payload = JSON.stringify({ tool_name: 'Bash', tool_input: { command: 'just lint' } })
    const { stdout, status } = runBinary(payload)
    expect(status).toBe(0)
    const parsed = JSON.parse(stdout) as {
      hookSpecificOutput: { permissionDecision: string; permissionDecisionReason: string }
    }
    expect(parsed.hookSpecificOutput.permissionDecision).toBe('deny')
    expect(parsed.hookSpecificOutput.permissionDecisionReason).toContain('ak_lint')
  })

  it('just typecheck + MCP ready → exit 0, deny JSON mentioning ak_typecheck', () => {
    writeMcpSentinel()
    const payload = JSON.stringify({ tool_name: 'Bash', tool_input: { command: 'just typecheck' } })
    const { stdout, status } = runBinary(payload)
    expect(status).toBe(0)
    const parsed = JSON.parse(stdout) as {
      hookSpecificOutput: { permissionDecision: string; permissionDecisionReason: string }
    }
    expect(parsed.hookSpecificOutput.permissionDecision).toBe('deny')
    expect(parsed.hookSpecificOutput.permissionDecisionReason).toContain('ak_typecheck')
  })

  // ── Passthrough cases ─────────────────────────────────────────────────────

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
    expect((parsed.hookSpecificOutput as { permissionDecision?: string } | undefined)?.permissionDecision).not.toBe('deny')
  })

  // ── MCP not ready passthrough ─────────────────────────────────────────────

  it('just test WITHOUT MCP sentinel → falls through to validators (no routing deny)', () => {
    // No sentinel written — MCP not ready
    const payload = JSON.stringify({ tool_name: 'Bash', tool_input: { command: 'just test' } })
    const { stdout, status } = runBinary(payload)
    // Validators run; they may pass or fail but routing must NOT fire
    const parsed = JSON.parse(stdout.trim() || '{}') as Record<string, unknown>
    const hookOutput = parsed.hookSpecificOutput as { permissionDecision?: string } | undefined
    // Routing deny must NOT have occurred
    expect(hookOutput?.permissionDecision).not.toBe('deny')
    // Status is 0 (pass) or 2 (validator block) — not a routing exit
    expect([0, 2]).toContain(status)
  })

  // ── Guidance throttle ─────────────────────────────────────────────────────

  it('throttle: second just test call passes through after first showed guidance', () => {
    writeMcpSentinel()
    const payload = JSON.stringify({ tool_name: 'Bash', tool_input: { command: 'just test' } })

    // First call: guidance shown (deny)
    const first = runBinary(payload)
    expect(first.status).toBe(0)
    const firstParsed = JSON.parse(first.stdout) as {
      hookSpecificOutput: { permissionDecision: string }
    }
    expect(firstParsed.hookSpecificOutput.permissionDecision).toBe('deny')

    // The throttle marker is now on disk (written by the child process with its own ppid = our pid).
    // Verify it exists before the second call.
    expect(existsSync(throttleMarker('test'))).toBe(true)

    // Second call: throttle file exists → routeDevCommand returns null → falls through to validators
    const second = runBinary(payload)
    const secondParsed = JSON.parse(second.stdout.trim() || '{}') as Record<string, unknown>
    const secondHook = secondParsed.hookSpecificOutput as { permissionDecision?: string } | undefined
    expect(secondHook?.permissionDecision).not.toBe('deny')
    expect([0, 2]).toContain(second.status)
  })
})
