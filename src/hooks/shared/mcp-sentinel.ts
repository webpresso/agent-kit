/**
 * MCP readiness sentinel.
 *
 * Background. The pretool-guard hook routes dev-workflow commands
 * (`pnpm test`, `just lint`, `wp ...`) to the webpresso MCP tool surface
 * when MCP is alive, and falls back to a `just <task>` recipe otherwise.
 * The hook needs a way to discover whether an webpresso MCP server is
 * currently running.
 *
 * Why a scan-based reader. Earlier versions keyed the sentinel filename
 * to a value derived from `process.ppid` or `process.cwd()`, so the
 * reader (hook) and writer (MCP) had to compute the same key. Both
 * approaches break on real IDE topologies:
 *
 *   - PPID-keyed fails when the IDE host is not the direct parent of
 *     both processes (Codex CLI routes hooks through workers).
 *   - cwd-keyed fails when the IDE spawns the MCP server with a cwd
 *     that diverges from the session cwd (Codex spawns the MCP server
 *     with the script's directory, not the project root).
 *
 * The fix decouples the two halves. The writer claims a unique
 * filename (defaulting to `wp-mcp-ready-${process.pid}`); the reader
 * scans `tmpdir` for ALL files matching `wp-mcp-ready-*` and returns
 * true if any of them contains a live PID. Reader and writer no longer
 * need to agree on a key, only on a stable filename pattern.
 *
 * The webpresso MCP server's tool surface is functionally global — it
 * serves whichever cwd the request comes from — so "any MCP is alive"
 * is sufficient to enable MCP-tool routing on the hook side.
 *
 * Liveness check. The sentinel content is the MCP server PID. Hook
 * verifies the PID is alive via `process.kill(pid, 0)`. Stale
 * sentinels (MCP crashed without cleanup) are skipped.
 *
 * Override. Set `WP_MCP_SENTINEL_KEY` to pin the writer's filename
 * suffix (useful for tests that need a deterministic file path).
 */
import { readFileSync, readdirSync, unlinkSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'

const SENTINEL_PREFIX = 'wp-mcp-ready-'

function writerKey(): string {
  const override = process.env.WP_MCP_SENTINEL_KEY
  if (override && override.trim().length > 0) return override.trim()
  return String(process.pid)
}

export function sentinelPath(): string {
  return join(tmpdir(), `${SENTINEL_PREFIX}${writerKey()}`)
}

function readPid(filePath: string): number | null {
  try {
    const pid = parseInt(readFileSync(filePath, 'utf-8'), 10)
    return Number.isFinite(pid) && pid > 0 ? pid : null
  } catch {
    return null
  }
}

function isPidAlive(pid: number): boolean {
  try {
    process.kill(pid, 0)
    return true
  } catch {
    return false
  }
}

export function isMcpReady(): boolean {
  if (process.platform === 'win32') return false
  let entries: readonly string[]
  try {
    entries = readdirSync(tmpdir())
  } catch {
    return false
  }
  for (const name of entries) {
    if (!name.startsWith(SENTINEL_PREFIX)) continue
    const pid = readPid(join(tmpdir(), name))
    if (pid !== null && isPidAlive(pid)) return true
  }
  return false
}

export function writeSentinel(): void {
  writeFileSync(sentinelPath(), String(process.pid), 'utf-8')
}

export function deleteSentinel(): void {
  try {
    unlinkSync(sentinelPath())
  } catch {
    // ignore — sentinel may not exist
  }
}

/**
 * Test-only — kept as a no-op for forward compatibility so callers that
 * adopted the cache-reset pattern don't need a follow-up edit.
 */
export function _resetProjectKeyCache(): void {
  // intentional no-op
}
