/**
 * `ak hooks doctor` — post-install plugin health verification.
 *
 * Verifies the agent-kit plugin installation is healthy:
 * - all hook bins exist
 * - bins are executable (skip on win32)
 * - bins respond to empty stdin with exit 0 + JSON
 * - plugin.json exists and references only paths that exist
 * - MCP server starts and responds to tools/list (soft-fail)
 */

import { accessSync, constants, readFileSync, statSync } from 'node:fs'
import { spawn } from 'node:child_process'
import { platform } from 'node:os'
import { dirname, join, resolve } from 'node:path'

import { isMcpReady } from './shared/mcp-sentinel.js'

export interface DoctorCheck {
  name: string
  ok: boolean
  detail?: string
}

export interface DoctorResult {
  ok: boolean
  checks: DoctorCheck[]
}

/** Hook bin definitions */
const HOOK_BINS: { name: string; binName: string; checkStdin: boolean }[] = [
  { name: 'pretool-guard', binName: 'ak-pretool-guard', checkStdin: true },
  { name: 'post-tool (lint-after-edit)', binName: 'ak-post-tool', checkStdin: false },
  { name: 'stop (qa-changed-files)', binName: 'ak-stop-qa', checkStdin: false },
  { name: 'guard-switch', binName: 'ak-guard-switch', checkStdin: true },
  { name: 'sessionstart', binName: 'ak-sessionstart-routing', checkStdin: true },
  { name: 'test-quality-check', binName: 'ak-test-quality-check', checkStdin: false },
]

/**
 * Find the real path of a bin by reading package.json and using require.resolve.
 * Works in all install contexts (global, workspace, direct dependency).
 */
function resolveHookBin(binName: string): string | null {
  try {
    const binDir = dirname(require.resolve('.'))
    // Walk up from the doctor.ts location (src/hooks/) to find package.json
    let dir = binDir
    while (dir !== dirname(dir)) {
      if (tryAccess(join(dir, 'package.json'))) {
        const pkg = JSON.parse(readFileSync(join(dir, 'package.json'), 'utf-8'))
        const binScript = pkg.bin?.[binName]
        if (binScript) {
          // Resolve the bin entry relative to the package root
          const resolved = require.resolve(join(dir, binScript))
          return resolved
        }
      }
      dir = dirname(dir)
    }
    return null
  } catch {
    return null
  }
}

function resolveMcpBin(): string | null {
  return resolveHookBin('ak')
}

function resolvePluginRoot(): string | null {
  const akBin = resolveMcpBin()
  if (!akBin) return null
  let dir = dirname(akBin)
  while (dir !== dirname(dir)) {
    if (tryAccess(join(dir, '.claude-plugin', 'plugin.json'))) return dir
    dir = dirname(dir)
  }
  return null
}

function isExecutable(file: string): boolean {
  try {
    const stat = statSync(file)
    return (stat.mode & 0o111) !== 0
  } catch {
    return false
  }
}

function tryAccess(file: string): boolean {
  try {
    accessSync(file, constants.F_OK)
    return true
  } catch {
    return false
  }
}

/**
 * Run a hook binary with `echo '{}' | node <bin>` and check it exits 0
 * and produces valid JSON on stdout.
 */
async function probeHookBin(file: string, checkStdin: boolean): Promise<{ ok: boolean; detail?: string }> {
  if (!tryAccess(file)) {
    return { ok: false, detail: 'file not found' }
  }

  if (platform() !== 'win32' && !isExecutable(file)) {
    return { ok: false, detail: 'not executable' }
  }

  if (!checkStdin) {
    return probeExitZero(file)
  }

  return probeJsonStdin(file)
}

function probeExitZero(file: string): Promise<{ ok: boolean; detail?: string }> {
  return new Promise<{ ok: boolean; detail?: string }>((resolve) => {
    const child = spawn('node', [file], { stdio: ['pipe', 'pipe', 'pipe'] })
    let stderr = ''
    child.stderr?.on('data', (chunk) => {
      stderr += String(chunk)
    })
    child.on('error', (err) => {
      resolve({ ok: false, detail: String(err.message) })
    })
    child.on('close', (code) => {
      resolve(code === 0 ? { ok: true } : { ok: false, detail: `exit ${code}${stderr ? `: ${stderr.trim()}` : ''}` })
    })
  })
}

function probeJsonStdin(file: string): Promise<{ ok: boolean; detail?: string }> {
  return new Promise<{ ok: boolean; detail?: string }>((resolve) => {
    const child = spawn('node', [file], { stdio: ['pipe', 'pipe', 'pipe'] })
    let stdout = ''
    let stderr = ''
    child.stdout.on('data', (chunk) => {
      stdout += String(chunk)
    })
    child.stderr?.on('data', (chunk) => {
      stderr += String(chunk)
    })
    child.stdin.write('{}\n', () => {
      child.stdin.end()
    })
    child.on('error', (err) => {
      resolve({ ok: false, detail: String(err.message) })
    })
    child.on('close', (code) => {
      if (code !== 0) {
        resolve({ ok: false, detail: `exit ${code}${stderr ? `: ${stderr.trim()}` : ''}` })
        return
      }
      try {
        JSON.parse(stdout.trim())
        resolve({ ok: true })
      } catch {
        resolve({ ok: false, detail: `invalid JSON on stdout: ${stdout.trim().slice(0, 80)}` })
      }
    })
  })
}

function checkPluginJson(): { ok: boolean; detail?: string } {
  const root = resolvePluginRoot()
  if (!root) {
    return { ok: false, detail: 'plugin root not found (ak not in PATH)' }
  }
  const pluginJsonPath = join(root, '.claude-plugin', 'plugin.json')
  if (!tryAccess(pluginJsonPath)) {
    return { ok: false, detail: 'plugin.json not found' }
  }
  try {
    const content = readFileSync(pluginJsonPath, 'utf-8')
    const manifest = JSON.parse(content)

    // Check required fields
    if (!manifest.version || !manifest.agents || !Array.isArray(manifest.agents)) {
      return { ok: false, detail: 'plugin.json missing version or agents array' }
    }

    // Check each bin reference exists
    const bins: string[] = []
    for (const agent of manifest.agents) {
      if (agent.invocation?.command) bins.push(agent.invocation.command)
    }

    for (const bin of bins) {
      // bin is like "./dist/esm/hooks/..." — resolve relative to root
      const resolved = resolve(root, bin)
      if (!tryAccess(resolved)) {
        return { ok: false, detail: `bin referenced in plugin.json not found: ${bin}` }
      }
    }

    return { ok: true }
  } catch (err) {
    return { ok: false, detail: `failed to read plugin.json: ${String(err)}` }
  }
}

async function checkMcpServer(): Promise<{ ok: boolean; detail?: string; skipped?: boolean }> {
  // Fast path: if sentinel exists and PID is alive, MCP is already running
  if (isMcpReady()) {
    return { ok: true, detail: 'MCP server already running (sentinel found)', skipped: true }
  }

  const timeoutMs = Number(process.env.AK_DOCTOR_MCP_TIMEOUT_MS ?? 5000)
  const akMcpBin = resolveMcpBin()

  if (!akMcpBin) {
    return { ok: false, detail: 'MCP server (ak) not found in .bin' }
  }

  return new Promise<{ ok: boolean; detail?: string; skipped?: boolean }>((resolve) => {
    const child = spawn('node', [akMcpBin], {
      stdio: ['pipe', 'pipe', 'pipe'],
      env: { ...process.env, AK_DOCTOR_MCP_TIMEOUT_MS: String(timeoutMs) },
    })

    let stdout = ''
    let stderr = ''
    let settled = false

    const timer = setTimeout(() => {
      if (!settled) {
        settled = true
        child.kill()
        resolve({ ok: false, detail: `MCP server did not respond within ${timeoutMs}ms` })
      }
    }, timeoutMs)

    child.stdout.on('data', (chunk) => {
      stdout += String(chunk)
    })
    child.stderr?.on('data', (chunk) => {
      stderr += String(chunk)
    })

    // Send tools/list JSON-RPC request
    const toolsListRequest = JSON.stringify({
      jsonrpc: '2.0',
      id: 1,
      method: 'tools/list',
      params: {},
    }) + '\n'

    child.stdin.write(toolsListRequest, () => {
      child.stdin.end()
    })

    child.on('error', (err) => {
      if (!settled) {
        settled = true
        clearTimeout(timer)
        resolve({ ok: false, detail: String(err.message) })
      }
    })

    child.on('close', (code) => {
      if (settled) return
      settled = true
      clearTimeout(timer)

      if (code !== 0 && code !== null) {
        resolve({ ok: false, detail: `MCP server exited with code ${code}: ${stderr.trim().slice(0, 100) || '(no stderr)'}` })
        return
      }

      // Try to parse a valid JSON-RPC tools/list response
      try {
        const lines = stdout.trim().split('\n')
        for (const line of lines) {
          if (!line.trim()) continue
          const parsed = JSON.parse(line)
          if (parsed.result && typeof parsed.result === 'object' && 'tools' in parsed.result) {
            resolve({ ok: true, detail: `MCP server responded with ${(parsed.result.tools as unknown[]).length} tools` })
            return
          }
        }
        resolve({ ok: false, detail: `MCP server responded but no valid tools/list result: ${stdout.trim().slice(0, 80)}` })
      } catch {
        resolve({ ok: false, detail: `MCP server produced invalid JSON-RPC response: ${stdout.trim().slice(0, 80)}` })
      }
    })
  })
}

export interface RunHooksDoctorOptions {
  skipMcp?: boolean
}

export async function runHooksDoctor(opts: RunHooksDoctorOptions = {}): Promise<DoctorResult> {
  const checks: DoctorCheck[] = []
  const isWin = platform() === 'win32'

  // 1. Bin existence + executable checks
  for (const bin of HOOK_BINS) {
    const file = resolveHookBin(bin.binName)
    const exists = file && tryAccess(file)

    if (!exists) {
      checks.push({ name: bin.name, ok: false, detail: `bin '${bin.binName}' not found in .bin` })
      continue
    }

    if (!isWin && !isExecutable(file!)) {
      checks.push({ name: bin.name, ok: false, detail: 'exists but not executable' })
      continue
    }

    // 2. stdin response check (exit 0 + JSON for interactive bins)
    const probe = await probeHookBin(file!, bin.checkStdin)
    checks.push({ name: bin.name, ok: probe.ok, detail: probe.detail })
  }

  // 3. plugin.json integrity
  checks.push({ name: 'plugin.json integrity', ...checkPluginJson() })

  // 4. MCP server liveness (soft-fail)
  if (opts.skipMcp) {
    checks.push({ name: 'MCP server liveness', ok: true, detail: 'skipped (--skip-mcp)' })
  } else {
    const mcpResult = await checkMcpServer()
    // Soft-fail: MCP check never sets ok: false in the final result,
    // but we record it so the output can show a warning.
    checks.push({
      name: 'MCP server liveness',
      ok: true, // always pass — MCP failures are soft
      detail: mcpResult.skipped
        ? mcpResult.detail
        : mcpResult.ok
          ? mcpResult.detail
          : `WARNING: ${mcpResult.detail}`,
    })
  }

  // Non-MCP checks must all pass
  const nonMcpChecks = checks.filter((c) => !c.name.startsWith('MCP '))
  const overallOk = nonMcpChecks.every((c) => c.ok)

  return { ok: overallOk, checks }
}

export async function printHooksDoctor(opts: RunHooksDoctorOptions = {}): Promise<number> {
  const result = await runHooksDoctor(opts)

  for (const check of result.checks) {
    const icon = check.ok ? '[x]' : '[ ]'
    const detail = check.detail ? `: ${check.detail}` : ''
    // Use stderr so skill output doesn't pollute stdout (which is JSON for hooks)
    console.error(`${icon} ${check.name}${detail}`)
  }

  return result.ok ? 0 : 1
}
