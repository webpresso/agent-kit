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
import { fileURLToPath } from 'node:url'

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

const RTK_REQUESTED_MARKER = join('.agent', '.rtk-requested')
const RTK_INSTALL_HINT = 'rtk requested via --with rtk but not on PATH; brew install rtk'

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
 * Find the package root by walking upward from this module file.
 *
 * This is stable in both source (`src/hooks/doctor.ts`) and built
 * (`dist/esm/hooks/doctor.js`) execution, and does not depend on
 * Node/CommonJS `require.resolve` behavior.
 */
function resolvePackageRoot(): string | null {
  let dir = dirname(fileURLToPath(import.meta.url))
  while (dir !== dirname(dir)) {
    if (tryAccess(join(dir, 'package.json'))) return dir
    dir = dirname(dir)
  }
  return null
}

/**
 * Find the real path of a hook bin by reading package.json relative to the
 * current installed package root. Works in workspace, packed, and global installs.
 */
function resolveHookBin(binName: string): string | null {
  try {
    const root = resolvePackageRoot()
    if (!root) return null
    const pkg = JSON.parse(readFileSync(join(root, 'package.json'), 'utf-8'))
    const binScript = pkg.bin?.[binName]
    if (!binScript) return null
    return resolve(root, binScript)
  } catch {
    return null
  }
}

function resolveAkCliPath(): string | null {
  const root = resolvePackageRoot()
  if (!root) return null

  const builtCli = join(root, 'dist', 'esm', 'cli', 'cli.js')
  if (tryAccess(builtCli)) return builtCli

  const sourceCli = join(root, 'src', 'cli', 'cli.ts')
  if (tryAccess(sourceCli)) return sourceCli

  return null
}

function resolveMcpProbeCommand(): { command: string; args: string[] } | null {
  const root = resolvePackageRoot()
  if (root) {
    const builtCli = join(root, 'dist', 'esm', 'mcp', 'cli.js')
    if (tryAccess(builtCli)) return { command: 'node', args: [builtCli] }
  }

  const akCli = resolveAkCliPath()
  if (!akCli) return null

  return akCli.endsWith('.ts')
    ? { command: 'bun', args: [akCli, 'mcp'] }
    : { command: 'node', args: [akCli, 'mcp'] }
}

function resolvePluginRoot(): string | null {
  const root = resolvePackageRoot()
  return root && tryAccess(join(root, '.claude-plugin', 'plugin.json')) ? root : null
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

function wasRtkRequested(cwd = process.cwd()): boolean {
  return tryAccess(join(cwd, RTK_REQUESTED_MARKER))
}

function checkRtkOnPath(): Promise<DoctorCheck | null> {
  if (!wasRtkRequested()) return Promise.resolve(null)

  return new Promise<DoctorCheck>((resolve) => {
    const child = spawn('rtk', ['--version'], { stdio: ['ignore', 'pipe', 'pipe'] })
    let stdout = ''
    let stderr = ''
    child.stdout.on('data', (chunk) => {
      stdout += String(chunk)
    })
    child.stderr?.on('data', (chunk) => {
      stderr += String(chunk)
    })
    child.on('error', () => {
      resolve({ name: 'rtk on PATH', ok: false, detail: RTK_INSTALL_HINT })
    })
    child.on('close', (code) => {
      if (code === 0) {
        resolve({ name: 'rtk on PATH', ok: true, detail: stdout.trim() || 'rtk present' })
        return
      }
      const suffix = stderr.trim().length > 0 ? ` (${stderr.trim()})` : ''
      resolve({ name: 'rtk on PATH', ok: false, detail: `${RTK_INSTALL_HINT}${suffix}` })
    })
  })
}

/**
 * Run a hook binary with `echo '{}' | node <bin>` and check it exits 0
 * and produces valid JSON on stdout.
 */
async function probeHookBin(
  file: string,
  checkStdin: boolean,
): Promise<{ ok: boolean; detail?: string }> {
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
    const child = spawn(file, [], { stdio: ['pipe', 'pipe', 'pipe'] })
    let stderr = ''
    child.stdin.end()
    child.stderr?.on('data', (chunk) => {
      stderr += String(chunk)
    })
    child.on('error', (err) => {
      resolve({ ok: false, detail: String(err.message) })
    })
    child.on('close', (code) => {
      resolve(
        code === 0
          ? { ok: true }
          : { ok: false, detail: `exit ${code}${stderr ? `: ${stderr.trim()}` : ''}` },
      )
    })
  })
}

function probeJsonStdin(file: string): Promise<{ ok: boolean; detail?: string }> {
  return new Promise<{ ok: boolean; detail?: string }>((resolve) => {
    const child = spawn(file, [], { stdio: ['pipe', 'pipe', 'pipe'] })
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

    if (!manifest.version) {
      return { ok: false, detail: 'plugin.json missing version' }
    }

    const referencedPaths = new Set<string>()
    const collectFromCommand = (command: unknown): void => {
      if (typeof command !== 'string') return
      for (const token of command.split(/\s+/)) {
        if (!token.includes('${CLAUDE_PLUGIN_ROOT}/')) continue
        const relative = token.replace('${CLAUDE_PLUGIN_ROOT}/', '').replace(/^["']|["']$/g, '')
        referencedPaths.add(relative)
      }
    }

    for (const eventHooks of Object.values(manifest.hooks ?? {})) {
      if (!Array.isArray(eventHooks)) continue
      for (const group of eventHooks) {
        if (!Array.isArray(group?.hooks)) continue
        for (const hook of group.hooks) {
          collectFromCommand(hook?.command)
        }
      }
    }

    for (const server of Object.values(manifest.mcpServers ?? {})) {
      if (Array.isArray((server as { args?: unknown[] }).args)) {
        for (const arg of (server as { args: unknown[] }).args) collectFromCommand(arg)
      }
    }

    for (const relative of referencedPaths) {
      const resolved = resolve(root, relative)
      if (!tryAccess(resolved)) {
        return { ok: false, detail: `path referenced in plugin.json not found: ${relative}` }
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
  const probeCommand = resolveMcpProbeCommand()

  if (!probeCommand) {
    return { ok: false, detail: 'MCP server (ak) not found in .bin' }
  }

  return new Promise<{ ok: boolean; detail?: string; skipped?: boolean }>((resolve) => {
    const child = spawn(probeCommand.command, probeCommand.args, {
      stdio: ['pipe', 'pipe', 'pipe'],
      env: { ...process.env, AK_DOCTOR_MCP_TIMEOUT_MS: String(timeoutMs) },
    })

    let stdout = ''
    let stderr = ''
    let settled = false

    const finish = (result: { ok: boolean; detail?: string; skipped?: boolean }): void => {
      if (settled) return
      settled = true
      clearTimeout(timer)
      child.kill()
      resolve(result)
    }

    const timer = setTimeout(() => {
      finish({ ok: false, detail: `MCP server did not respond within ${timeoutMs}ms` })
    }, timeoutMs)

    child.stdout.on('data', (chunk) => {
      stdout += String(chunk)
      let newlineIndex = stdout.indexOf('\n')
      while (newlineIndex !== -1) {
        const line = stdout.slice(0, newlineIndex).trim()
        stdout = stdout.slice(newlineIndex + 1)
        if (line) {
          try {
            const parsed = JSON.parse(line)
            if (parsed.result && typeof parsed.result === 'object' && 'tools' in parsed.result) {
              finish({
                ok: true,
                detail: `MCP server responded with ${(parsed.result.tools as unknown[]).length} tools`,
              })
              return
            }
          } catch {
            // ignore non-JSON lines until close/timeout
          }
        }
        newlineIndex = stdout.indexOf('\n')
      }
    })
    child.stderr?.on('data', (chunk) => {
      stderr += String(chunk)
    })

    const initializeRequest =
      JSON.stringify({
        jsonrpc: '2.0',
        id: 1,
        method: 'initialize',
        params: {
          protocolVersion: '2024-11-05',
          capabilities: {},
          clientInfo: { name: 'agent-kit-hooks-doctor', version: '0.0.0' },
        },
      }) + '\n'

    const toolsListRequest =
      JSON.stringify({
        jsonrpc: '2.0',
        id: 2,
        method: 'tools/list',
        params: {},
      }) + '\n'

    child.stdin.write(initializeRequest, () => {
      child.stdin.write(toolsListRequest, () => {
        // Keep stdin open until we receive a response or time out. Closing
        // immediately can terminate the stdio server before it flushes the
        // initialize/tools-list responses.
      })
    })

    child.on('error', (err) => {
      finish({ ok: false, detail: String(err.message) })
    })

    child.on('close', (code) => {
      if (settled) return

      if (code !== 0 && code !== null) {
        finish({
          ok: false,
          detail: `MCP server exited with code ${code}: ${stderr.trim().slice(0, 100) || '(no stderr)'}`,
        })
        return
      }

      finish({
        ok: false,
        detail: `MCP server responded but no valid tools/list result: ${stdout.trim().slice(0, 80)}`,
      })
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

  const rtkCheck = await checkRtkOnPath()
  if (rtkCheck) checks.push(rtkCheck)

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
