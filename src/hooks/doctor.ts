/**
 * `wp hooks doctor` — post-install plugin health verification.
 *
 * Verifies the agent-kit plugin installation is healthy:
 * - all hook bins exist
 * - bins are executable (skip on win32)
 * - bins respond to empty stdin with exit 0 + JSON
 * - plugin.json exists and references only paths that exist
 * - MCP server starts and responds to tools/list (soft-fail)
 * - installed host CLIs (Codex/OpenCode/Claude) can see the expected surfaces
 */

import { accessSync, constants, lstatSync, readFileSync, statSync } from 'node:fs'
import { spawn } from 'node:child_process'
import { platform } from 'node:os'
import { join, resolve } from 'node:path'

import {
  PROBE_ROWS,
  assertConformance,
  type ConformanceRow,
} from '#hooks/__conformance__/matrix.js'

import type { HooksMap } from '#cli/commands/init/scaffolders/agent-hooks/ir.js'
import {
  diffHooksManifest,
  readHooksManifest,
} from '#cli/commands/init/scaffolders/agent-hooks/manifest.js'
import { setupCommandForRepo } from '#cli/commands/init/detect-consumer.js'
import {
  findAgentKitPackageRoot,
  resolveAgentKitPackageRoot,
  type ResolveAgentKitPackageRootOptions,
} from '#cli/commands/init/package-root'
import {
  expectedRootWpBinRelativePath,
  formatRootLauncherContractFailure,
  rootContractMode,
  validateRootLauncherContract,
} from '#launcher/root-contract.js'
import {
  formatRuntimeTypecheckParityFailures,
  probeRuntimeTypecheckParity,
} from '#typecheck/runtime-parity.js'
import { isMcpReady } from './shared/mcp-sentinel.js'

export interface DoctorCheck {
  name: string
  ok: boolean
  detail?: string
  /** Advisory checks surface a warning but do not flip the doctor's exit code. */
  advisory?: boolean
}

export interface DoctorResult {
  ok: boolean
  checks: DoctorCheck[]
}

interface NativePluginRuntimeStatus {
  readonly launchMode: 'native' | 'stale-node-launcher' | 'custom' | 'missing'
  readonly targetId?: string
  readonly manifestPath?: string
  readonly stagedBinPath?: string
  readonly runtimeTargetPath?: string
  readonly runtimeCandidates?: readonly string[]
  readonly reason?: string
}

interface RuntimeManifestTarget {
  readonly id?: string
  readonly os?: string
  readonly cpu?: string
  readonly packageName?: string
}

interface RuntimeManifestLike {
  readonly binaryName?: string
  readonly targets?: RuntimeManifestTarget[]
}

const RTK_REQUESTED_MARKER = join('.agent', '.rtk-requested')
const RTK_INSTALL_HINT = 'rtk requested via --with rtk but not on PATH; brew install rtk'
const HOST_SMOKE_ENV = 'WP_RUN_HOST_SMOKE'
const OPERATOR_PRECEDENCE_DETAIL =
  'MCP first (`wp_*` tools), direct `wp` only as fallback, and never `bun run wp` / `pnpm run wp` / `npm run wp` / `yarn wp` / `vp run wp`'

/** Hook bin definitions */
const HOOK_BINS: { name: string; hookName: string; checkStdin: boolean }[] = [
  { name: 'pretool-guard', hookName: 'pretool-guard', checkStdin: true },
  { name: 'post-tool (lint-after-edit)', hookName: 'post-tool', checkStdin: false },
  { name: 'stop (qa-changed-files)', hookName: 'stop-qa', checkStdin: false },
  { name: 'guard-switch', hookName: 'guard-switch', checkStdin: true },
  { name: 'sessionstart', hookName: 'sessionstart-routing', checkStdin: true },
  { name: 'precompact-snapshot', hookName: 'precompact-snapshot', checkStdin: true },
  { name: 'test-quality-check', hookName: 'test-quality-check', checkStdin: false },
]

type HostCheckMode = 'auto' | 'skip' | 'required'

export interface RunHooksDoctorOptions {
  skipMcp?: boolean
  fix?: boolean
  hosts?: HostCheckMode
  hostNames?: Array<'codex' | 'opencode' | 'claude'>
  /** Override the working directory used to detect RTK marker files. Defaults to process.cwd(). */
  cwd?: string
  /** Test seam for the safe restore path used by `wp hooks doctor --fix`. */
  runRestoreFix?: (cwd: string) => Promise<number>
  /**
   * Fire the smallest allow/deny conformance rows (PROBE_ROWS) against the real
   * pretool-guard and assert the routing decision. Off by default — the default
   * doctor stays cheap (empty-stdin liveness only). This is operator-side
   * semantic confirmation; CI already enforces decisions via the conformance
   * matrix boundary suite.
   */
  probeDecisions?: boolean
}

export type HookFixStatus = 'fixed' | 'prepared' | 'requires-approval' | 'blocked'

export interface HookFixResult {
  readonly status: HookFixStatus
  readonly detail: string
  readonly preservedFiles?: readonly string[]
  readonly nextCommand?: string
}

interface CodexHooksFile {
  hooks?: Record<string, Array<{ matcher?: string; hooks?: Array<{ command?: string }> }>>
}

function resolvePackageRoot(): string | null {
  return resolvePackageRootForRuntime()
}

export interface ResolvePackageRootForRuntimeOptions {
  readonly moduleUrl?: string
  readonly execPath?: string
  readonly argv0?: string
  readonly argv1?: string
  readonly pathEnv?: string
  readonly pathExtEnv?: string
  readonly platform?: NodeJS.Platform
}

export function resolvePackageRootForRuntime(
  options: ResolvePackageRootForRuntimeOptions = {},
): string | null {
  return resolveAgentKitPackageRoot(options satisfies ResolveAgentKitPackageRootOptions)
}

export function findOwningPackageRoot(startDir: string): string | null {
  return findAgentKitPackageRoot(startDir)
}

function resolveWpCliCommand(): { command: string; args: string[] } | null {
  const root = resolvePackageRoot()
  if (!root) return null
  const candidate = join(root, 'bin', process.platform === 'win32' ? 'wp.cmd' : 'wp')
  if (tryAccess(candidate)) return { command: candidate, args: [] }

  const builtCli = join(root, 'dist', 'esm', 'cli', 'cli.js')
  if (tryAccess(builtCli)) return { command: 'node', args: [builtCli] }

  const sourceCli = join(root, 'src', 'cli', 'cli.ts')
  if (tryAccess(sourceCli)) return { command: 'bun', args: [sourceCli] }

  return null
}

function operatorPrecedenceCheck(): DoctorCheck {
  return {
    name: 'operator flow',
    ok: true,
    advisory: true,
    detail: OPERATOR_PRECEDENCE_DETAIL,
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

const ABS_BIN_PATTERN = /["'](?<path>\/[^"']*node_modules\/\.bin\/wp-[\w-]+)["']/gu
const REL_BIN_PATTERN = /["'](?<path>\.\/node_modules\/\.bin\/wp-[\w-]+)["']/gu

function extractOwnedCodexHookBinPaths(command: string, cwd: string): string[] {
  const paths = new Set<string>()
  for (const match of command.matchAll(ABS_BIN_PATTERN)) {
    const p = match.groups?.path
    if (p) paths.add(p)
  }
  for (const match of command.matchAll(REL_BIN_PATTERN)) {
    const p = match.groups?.path
    if (p) paths.add(resolve(cwd, p))
  }
  return [...paths]
}

function checkConsumerCodexHookPaths(cwd = process.cwd()): DoctorCheck {
  const hooksPath = join(cwd, '.codex', 'hooks.json')
  if (!tryAccess(hooksPath)) {
    return {
      name: 'consumer codex hook command paths',
      ok: true,
      detail: 'skipped (no .codex/hooks.json)',
    }
  }

  try {
    const parsed = JSON.parse(readFileSync(hooksPath, 'utf-8')) as CodexHooksFile
    const commandPaths = new Set<string>()
    for (const groups of Object.values(parsed.hooks ?? {})) {
      for (const group of groups ?? []) {
        for (const hook of group.hooks ?? []) {
          if (typeof hook.command !== 'string') continue
          for (const path of extractOwnedCodexHookBinPaths(hook.command, cwd)) {
            commandPaths.add(path)
          }
        }
      }
    }

    if (commandPaths.size === 0) {
      return {
        name: 'consumer codex hook command paths',
        ok: true,
        detail: 'no wp-* node_modules hook paths found in .codex/hooks.json',
      }
    }

    const missing: string[] = []
    for (const binPath of commandPaths) {
      if (!tryAccess(binPath) || (platform() !== 'win32' && !isExecutable(binPath))) {
        missing.push(binPath)
      }
    }

    if (missing.length > 0) {
      const preview = missing.slice(0, 3).join(', ')
      return {
        name: 'consumer codex hook command paths',
        ok: false,
        detail: `missing/non-executable hook bins (${missing.length}): ${preview}`,
      }
    }

    return {
      name: 'consumer codex hook command paths',
      ok: true,
      detail: `${commandPaths.size} hook bin path(s) resolvable`,
    }
  } catch (error) {
    return {
      name: 'consumer codex hook command paths',
      ok: false,
      detail: `failed to parse .codex/hooks.json: ${error instanceof Error ? error.message : String(error)}`,
    }
  }
}

function wasRtkRequested(cwd = process.cwd()): boolean {
  return tryAccess(join(cwd, RTK_REQUESTED_MARKER))
}

function shouldRunHostChecks(mode: HostCheckMode): boolean {
  if (mode === 'skip') return false
  if (mode === 'required') return true
  return process.env[HOST_SMOKE_ENV] === '1'
}

function shouldRequireHost(mode: HostCheckMode): boolean {
  return mode === 'required'
}

const ANSI_ESCAPE_PATTERN = new RegExp(String.raw`\u001B\[[0-9;]*m`, 'g')

function stripAnsi(text: string): string {
  return text.replace(ANSI_ESCAPE_PATTERN, '')
}

function resolveRequestedHosts(
  mode: HostCheckMode,
  hostNames?: Array<'codex' | 'opencode' | 'claude'>,
) {
  const defaults: Array<'codex' | 'opencode' | 'claude'> = ['codex', 'opencode', 'claude']
  return mode === 'skip' ? [] : hostNames && hostNames.length > 0 ? hostNames : defaults
}

export function checkRtkOnPath(cwd?: string): Promise<DoctorCheck | null> {
  if (!wasRtkRequested(cwd)) return Promise.resolve(null)

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

async function probeHookBin(
  wpCli: { command: string; args: string[] },
  hookName: string,
  checkStdin: boolean,
): Promise<{ ok: boolean; detail?: string }> {
  if ((wpCli.command.includes('/') || wpCli.command.includes('\\')) && !tryAccess(wpCli.command)) {
    return { ok: false, detail: 'file not found' }
  }

  if (
    platform() !== 'win32' &&
    (wpCli.command.includes('/') || wpCli.command.includes('\\')) &&
    !isExecutable(wpCli.command)
  ) {
    return { ok: false, detail: 'not executable' }
  }

  if (!checkStdin) {
    return probeExitZero(wpCli, hookName)
  }

  return probeJsonStdin(wpCli, hookName)
}

function probeExitZero(
  wpCli: { command: string; args: string[] },
  hookName: string,
): Promise<{ ok: boolean; detail?: string }> {
  return new Promise<{ ok: boolean; detail?: string }>((resolve) => {
    const child = spawn(wpCli.command, [...wpCli.args, 'hook', hookName], {
      stdio: ['pipe', 'pipe', 'pipe'],
    })
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

function probeJsonStdin(
  wpCli: { command: string; args: string[] },
  hookName: string,
): Promise<{ ok: boolean; detail?: string }> {
  return new Promise<{ ok: boolean; detail?: string }>((resolve) => {
    const child = spawn(wpCli.command, [...wpCli.args, 'hook', hookName], {
      stdio: ['pipe', 'pipe', 'pipe'],
    })
    let stdout = ''
    let stderr = ''
    let settled = false
    const settle = (result: { ok: boolean; detail?: string }) => {
      if (settled) return
      settled = true
      resolve(result)
    }
    child.stdout.on('data', (chunk) => {
      stdout += String(chunk)
    })
    child.stderr?.on('data', (chunk) => {
      stderr += String(chunk)
    })
    child.stdin.on?.('error', (err) => {
      settle({ ok: false, detail: `stdin write failed: ${err.message}` })
    })
    child.stdin.write('{}\n', () => {
      child.stdin.end()
    })
    child.on('error', (err) => {
      settle({ ok: false, detail: String(err.message) })
    })
    child.on('close', (code) => {
      if (code !== 0) {
        settle({ ok: false, detail: `exit ${code}${stderr ? `: ${stderr.trim()}` : ''}` })
        return
      }
      try {
        JSON.parse(stdout.trim())
        settle({ ok: true })
      } catch {
        settle({ ok: false, detail: `invalid JSON on stdout: ${stdout.trim().slice(0, 80)}` })
      }
    })
  })
}

/**
 * Fire one conformance row's stdin at the real `wp hook <sub>` and assert the
 * routing decision via the shared conformance matrix. Returns ok=false (never
 * throws) so a single bad row degrades to a failing check, not a doctor crash.
 */
function probeDecisionRow(
  wpCli: { command: string; args: string[] },
  row: ConformanceRow,
): Promise<{ ok: boolean; detail?: string }> {
  const hookName = row.hookBin.replace(/^wp-/u, '')
  return new Promise<{ ok: boolean; detail?: string }>((resolve) => {
    const child = spawn(wpCli.command, [...wpCli.args, 'hook', hookName], {
      stdio: ['pipe', 'pipe', 'pipe'],
    })
    let stdout = ''
    let settled = false
    const settle = (result: { ok: boolean; detail?: string }) => {
      if (settled) return
      settled = true
      resolve(result)
    }
    child.stdout.on('data', (chunk) => {
      stdout += String(chunk)
    })
    child.stdin.on?.('error', (err) => {
      settle({ ok: false, detail: `stdin write failed: ${err.message}` })
    })
    child.stdin.write(`${row.stdin}\n`, () => {
      child.stdin.end()
    })
    child.on('error', (err) => {
      settle({ ok: false, detail: String(err.message) })
    })
    child.on('close', (code) => {
      try {
        assertConformance(row, { stdout, exitCode: code })
        settle({ ok: true })
      } catch (error) {
        settle({ ok: false, detail: error instanceof Error ? error.message : String(error) })
      }
    })
  })
}

function checkPluginJson(): { ok: boolean; detail?: string } {
  const root = resolvePluginRoot()
  if (!root) {
    return { ok: false, detail: 'plugin root not found (wp not in PATH)' }
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

function formatNativeRuntimeDetail(status: NativePluginRuntimeStatus): string {
  return [
    `launchMode=${status.launchMode}`,
    status.targetId ? `targetId=${status.targetId}` : null,
    status.manifestPath ? `manifest=${status.manifestPath}` : null,
    status.stagedBinPath ? `stagedBin=${status.stagedBinPath}` : null,
    status.runtimeTargetPath ? `targetBin=${status.runtimeTargetPath}` : null,
    status.runtimeCandidates && status.runtimeCandidates.length > 0
      ? `candidates=${status.runtimeCandidates.join('|')}`
      : null,
    status.reason ? `reason=${status.reason}` : null,
  ]
    .filter((value): value is string => value !== null)
    .join(', ')
}

function inspectNativePluginRuntime(): NativePluginRuntimeStatus {
  const root = resolvePluginRoot()
  if (!root) {
    return {
      launchMode: 'missing',
      reason: 'plugin root not found',
    }
  }

  const pluginJsonPath = join(root, '.claude-plugin', 'plugin.json')
  const manifestPath = join(root, 'bin', 'runtime-manifest.json')
  const stagedBinPath = join(root, 'bin', 'wp')

  if (!tryAccess(pluginJsonPath)) {
    return {
      launchMode: 'missing',
      manifestPath,
      stagedBinPath,
      reason: 'plugin manifest missing',
    }
  }

  try {
    const pluginManifest = JSON.parse(readFileSync(pluginJsonPath, 'utf-8')) as {
      mcpServers?: Record<string, { command?: string; args?: string[] }>
    }
    const server = pluginManifest.mcpServers?.webpresso
    const launchMode: NativePluginRuntimeStatus['launchMode'] =
      server?.command === '${CLAUDE_PLUGIN_ROOT}/bin/wp' &&
      Array.isArray(server.args) &&
      server.args.length === 1 &&
      server.args[0] === 'mcp'
        ? 'native'
        : server?.command === 'node' || (server?.args ?? []).some((arg) => arg.endsWith('wp.js'))
          ? 'stale-node-launcher'
          : server
            ? 'custom'
            : 'missing'

    if (!tryAccess(manifestPath)) {
      return {
        launchMode,
        manifestPath,
        stagedBinPath,
        reason: 'runtime manifest missing',
      }
    }

    const manifest = JSON.parse(readFileSync(manifestPath, 'utf8')) as RuntimeManifestLike
    const target = manifest.targets?.find(
      (candidate) => candidate.os === process.platform && candidate.cpu === process.arch,
    )
    const targetId = target?.id
    const runtimeCandidates = target ? resolveRuntimeBinaryCandidates(root, manifest, target) : []
    const runtimeTargetPath = runtimeCandidates.find((candidate) => tryAccess(candidate))

    if (!targetId) {
      return {
        launchMode,
        manifestPath,
        stagedBinPath,
        runtimeCandidates,
        reason: `no runtime target for ${process.platform}/${process.arch}`,
      }
    }

    if (!tryAccess(stagedBinPath)) {
      return {
        launchMode,
        targetId,
        manifestPath,
        stagedBinPath,
        runtimeTargetPath,
        runtimeCandidates,
        reason: 'staged native launcher missing',
      }
    }

    if (lstatSync(stagedBinPath).isSymbolicLink()) {
      return {
        launchMode,
        targetId,
        manifestPath,
        stagedBinPath,
        runtimeTargetPath,
        runtimeCandidates,
        reason: 'staged native launcher is a symlink',
      }
    }

    if (!runtimeTargetPath) {
      if (launchMode === 'native' && isSourceCheckoutWithRuntimeTooling(root)) {
        return {
          launchMode,
          targetId,
          manifestPath,
          stagedBinPath,
          runtimeCandidates,
          reason:
            'skipped (source checkout runtime payload not staged; run build:runtime-binaries then stage:plugin-runtime to verify the plugin-native lane locally)',
        }
      }

      return {
        launchMode,
        targetId,
        manifestPath,
        stagedBinPath,
        runtimeCandidates,
        reason: `native runtime payload missing; checked ${runtimeCandidates.join(', ')}`,
      }
    }

    if (launchMode !== 'native') {
      return {
        launchMode,
        targetId,
        manifestPath,
        stagedBinPath,
        runtimeTargetPath,
        runtimeCandidates,
        reason: 'plugin manifest is not using the native launcher',
      }
    }

    return {
      launchMode,
      targetId,
      manifestPath,
      stagedBinPath,
      runtimeTargetPath,
      runtimeCandidates,
    }
  } catch (error) {
    return {
      launchMode: 'missing',
      manifestPath,
      stagedBinPath,
      reason: error instanceof Error ? error.message : String(error),
    }
  }
}

function isSourceCheckoutWithRuntimeTooling(root: string): boolean {
  return (
    tryAccess(join(root, 'src', 'cli', 'cli.ts')) &&
    tryAccess(join(root, 'scripts', 'build-runtime-binaries.ts')) &&
    tryAccess(join(root, 'scripts', 'stage-plugin-runtime-artifacts.ts'))
  )
}

function runtimeBinaryFilename(
  manifest: RuntimeManifestLike,
  target: RuntimeManifestTarget,
): string {
  const binaryName = typeof manifest.binaryName === 'string' ? manifest.binaryName : 'wp'
  return target.os === 'win32' ? `${binaryName}.exe` : binaryName
}

function runtimePackageDirName(packageName: string): string {
  return packageName.split('/').at(-1) ?? packageName
}

function runtimePackageNameForTarget(target: RuntimeManifestTarget): string | null {
  if (target.packageName) return target.packageName
  return target.id ? `@webpresso/agent-kit-runtime-${target.id}` : null
}

function resolveRuntimeBinaryCandidates(
  root: string,
  manifest: RuntimeManifestLike,
  target: RuntimeManifestTarget,
): string[] {
  const packageName = runtimePackageNameForTarget(target)
  if (!target.id || !packageName) return []
  const filename = runtimeBinaryFilename(manifest, target)
  const packageDir = runtimePackageDirName(packageName)
  return [
    join(root, 'bin', 'runtime', target.id, filename),
    join(root, 'dist', 'runtime', target.id, filename),
    join(root, '..', packageDir, 'bin', filename),
    join(root, 'node_modules', '@webpresso', packageDir, 'bin', filename),
  ]
}

export function checkRootLauncherContract(): DoctorCheck {
  const root = resolvePackageRoot()
  if (!root) {
    return {
      name: 'root launcher contract',
      ok: false,
      detail: `contract=${rootContractMode}, expected=${expectedRootWpBinRelativePath}, reason=package root not found`,
    }
  }

  const launcherPath = join(root, expectedRootWpBinRelativePath)
  const status = validateRootLauncherContract(launcherPath)
  const detail = [
    `contract=${rootContractMode}`,
    `expected=${expectedRootWpBinRelativePath}`,
    status.ok
      ? 'root bin/wp is the JS selector for runtime-required, phase2-runtime, and JS/Bun holdback lanes'
      : `reason=${formatRootLauncherContractFailure(status, expectedRootWpBinRelativePath)}`,
  ].join(', ')

  return { name: 'root launcher contract', ok: status.ok, detail }
}

export function checkOmxPluginCacheStaleSurfaceRepair(
  options: {
    codexHome?: string
    nodeBinary?: string
    repair?: (codexHome: string, nodeBinary: string) => string[]
  } = {},
): DoctorCheck {
  const codexHome =
    options.codexHome ?? process.env.CODEX_HOME ?? join(process.env.HOME || '', '.codex')
  if (!codexHome) {
    return {
      name: 'OMX plugin-cache stale-surface repair',
      ok: true,
      detail:
        'skipped (CODEX_HOME/HOME unavailable; durable ownership belongs to OMX setup/plugin generation)',
    }
  }

  const nodeBinary = options.nodeBinary ?? process.execPath
  if (!nodeBinary) {
    return {
      name: 'OMX plugin-cache stale-surface repair',
      ok: true,
      detail:
        'skipped (absolute node path unavailable; durable ownership belongs to OMX setup/plugin generation)',
    }
  }

  const repair = options.repair
  let repairedPaths: string[]
  try {
    repairedPaths = repair ? repair(codexHome, nodeBinary) : []
  } catch {
    return {
      name: 'OMX plugin-cache stale-surface repair',
      ok: true,
      detail:
        'skipped (could not inspect OMX plugin-cache hooks; durable ownership belongs to OMX setup/plugin generation)',
    }
  }
  if (repairedPaths.length === 0) {
    return {
      name: 'OMX plugin-cache stale-surface repair',
      ok: true,
      detail:
        'no positively identified stale OMX plugin-cache hook surfaces; durable ownership belongs to OMX setup/plugin generation',
    }
  }

  return {
    name: 'OMX plugin-cache stale-surface repair',
    ok: true,
    detail:
      `bounded stale-surface repair rewrote ${repairedPaths.length} positively identified stale ` +
      'OMX plugin-cache hook surface(s); durable ownership belongs to OMX setup/plugin generation',
  }
}

export function checkNativePluginRuntime(): DoctorCheck {
  const status = inspectNativePluginRuntime()
  const isSourceCheckoutSkip =
    status.launchMode === 'native' && status.reason?.startsWith('skipped (source checkout') === true
  return {
    name: 'native plugin runtime',
    ok: (status.launchMode === 'native' && !status.reason) || isSourceCheckoutSkip,
    detail: formatNativeRuntimeDetail(status),
  }
}

export function checkPhase2RuntimeTypecheckParity(): DoctorCheck {
  const status = inspectNativePluginRuntime()
  if (status.launchMode !== 'native' || !status.runtimeTargetPath) {
    return {
      name: 'phase2 runtime typecheck parity',
      ok: true,
      detail: 'skipped (native runtime not available for parity probe; see native plugin runtime)',
    }
  }

  const probe = probeRuntimeTypecheckParity({
    command: status.runtimeTargetPath,
    env: {
      ...process.env,
      WP_SKIP_UPDATE_CHECK: '1',
    },
  })

  return probe.ok
    ? {
        name: 'phase2 runtime typecheck parity',
        ok: true,
        detail: `host runtime ${status.targetId ?? 'unknown-target'} exposes --file/--package and resolved scopes`,
      }
    : {
        name: 'phase2 runtime typecheck parity',
        ok: false,
        detail: `runtime surface mismatch: ${formatRuntimeTypecheckParityFailures(probe)}`,
      }
}

async function checkMcpServer(): Promise<{ ok: boolean; detail?: string; skipped?: boolean }> {
  if (isMcpReady()) {
    return { ok: true, detail: 'MCP server already running (sentinel found)', skipped: true }
  }

  const timeoutMs = Number(process.env.WP_DOCTOR_MCP_TIMEOUT_MS ?? 5000)
  const probeCommand = resolveMcpProbeCommand()

  if (!probeCommand) {
    return { ok: false, detail: 'MCP server (wp) not found in .bin' }
  }

  return new Promise<{ ok: boolean; detail?: string; skipped?: boolean }>((resolve) => {
    const child = spawn(probeCommand.command, probeCommand.args, {
      stdio: ['pipe', 'pipe', 'pipe'],
      env: { ...process.env, WP_DOCTOR_MCP_TIMEOUT_MS: String(timeoutMs) },
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
          } catch {}
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
          clientInfo: { name: 'webpresso-hooks-doctor', version: '0.0.0' },
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
      child.stdin.write(toolsListRequest, () => {})
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

function runCommand(
  command: string,
  args: string[],
  cwd = process.cwd(),
): Promise<{ ok: boolean; stdout: string; stderr: string; code: number | null }> {
  return new Promise((resolve) => {
    const child = spawn(command, args, { cwd, stdio: ['ignore', 'pipe', 'pipe'] })
    let stdout = ''
    let stderr = ''
    child.stdout.on('data', (chunk) => {
      stdout += String(chunk)
    })
    child.stderr.on('data', (chunk) => {
      stderr += String(chunk)
    })
    child.on('error', (err) => {
      resolve({ ok: false, stdout, stderr: err.message, code: null })
    })
    child.on('close', (code) => {
      resolve({ ok: code === 0, stdout, stderr, code })
    })
  })
}

async function checkCodexHost(): Promise<DoctorCheck> {
  const available = await runCommand('codex', ['--version'])
  if (!available.ok) {
    return { name: 'Codex host integration', ok: true, detail: 'skipped (codex not on PATH)' }
  }

  const result = await runCommand('codex', ['mcp', 'list'])
  if (!result.ok) {
    return {
      name: 'Codex host integration',
      ok: false,
      detail: result.stderr.trim() || `exit ${result.code}`,
    }
  }

  const hasAgentKit = result.stdout.includes('webpresso')
  return hasAgentKit
    ? { name: 'Codex host integration', ok: true, detail: 'webpresso MCP visible' }
    : {
        name: 'Codex host integration',
        ok: false,
        detail: `missing MCP entry (webpresso=${hasAgentKit})`,
      }
}

async function checkOpenCodeHost(cwd = process.cwd()): Promise<DoctorCheck> {
  const available = await runCommand('opencode', ['--version'])
  if (!available.ok) {
    return { name: 'OpenCode host integration', ok: true, detail: 'skipped (opencode not on PATH)' }
  }

  const result = await runCommand('opencode', ['mcp', 'list'], cwd)
  if (!result.ok) {
    return {
      name: 'OpenCode host integration',
      ok: false,
      detail: result.stderr.trim() || `exit ${result.code}`,
    }
  }

  const stdout = stripAnsi(result.stdout)
  const hasAgentKit = stdout.includes('webpresso')
  const agentKitConnected = /✓\s+webpresso\b/.test(stdout)

  if (!hasAgentKit) {
    return {
      name: 'OpenCode host integration',
      ok: false,
      detail: `missing MCP entry (webpresso=${hasAgentKit})`,
    }
  }

  return agentKitConnected
    ? {
        name: 'OpenCode host integration',
        ok: true,
        detail: 'webpresso MCP connected',
      }
    : {
        name: 'OpenCode host integration',
        ok: false,
        detail: `MCP not connected (webpresso=${agentKitConnected})`,
      }
}

async function checkClaudeHost(): Promise<DoctorCheck> {
  const available = await runCommand('claude', ['--version'])
  if (!available.ok) {
    return { name: 'Claude host integration', ok: true, detail: 'skipped (claude not on PATH)' }
  }

  const root = resolvePluginRoot()
  if (!root) {
    return {
      name: 'Claude host integration',
      ok: true,
      detail: 'skipped (plugin root not available in this repo)',
    }
  }

  const result = await runCommand('claude', ['plugin', 'validate', root])
  return result.ok
    ? { name: 'Claude host integration', ok: true, detail: 'plugin validate passed' }
    : {
        name: 'Claude host integration',
        ok: false,
        detail: result.stderr.trim() || result.stdout.trim() || `exit ${result.code}`,
      }
}

// Markers for the direct hook commands `wp setup` writes into
// `.claude/settings.json`. The plugin manifest no longer ships hooks (they
// double-fired against settings.json and were the less reliable surface), so
// settings.json is the single source — if it does not reference the direct
// `bin/wp hook pretool-guard` command, the hooks are not installed.
const AGENT_KIT_HOOK_MARKERS = ['bin/wp', ' hook pretool-guard'] as const
const CODEX_PLUGIN_ARTIFACTS = [
  'hooks/hooks.json',
  'codex.mcp.json',
  '.codex-plugin/plugin.json',
] as const

function readJsonRecord(filePath: string): Record<string, unknown> | null {
  try {
    const value = JSON.parse(readFileSync(filePath, 'utf-8')) as unknown
    return value && typeof value === 'object' && !Array.isArray(value)
      ? (value as Record<string, unknown>)
      : null
  } catch {
    return null
  }
}

function stringArrayEquals(value: unknown, expected: readonly string[]): boolean {
  return (
    Array.isArray(value) &&
    value.length === expected.length &&
    value.every((item, index) => item === expected[index])
  )
}

export function checkPackagedHostArtifacts(cwd = process.cwd()): DoctorCheck {
  const missingCodexArtifacts = CODEX_PLUGIN_ARTIFACTS.filter(
    (artifactPath) => !tryAccess(join(cwd, artifactPath)),
  )
  const claudePluginPath = join(cwd, '.claude-plugin', 'plugin.json')
  const hasClaudePlugin = tryAccess(claudePluginPath)

  const failures: string[] = []
  if (missingCodexArtifacts.length > 0) {
    failures.push(`missing Codex artifact(s): ${missingCodexArtifacts.join(', ')}`)
  }
  if (!hasClaudePlugin) failures.push('missing Claude artifact: .claude-plugin/plugin.json')

  const codexPluginPath = join(cwd, '.codex-plugin', 'plugin.json')
  const codexMcpPath = join(cwd, 'codex.mcp.json')
  const codexHooksPath = join(cwd, 'hooks', 'hooks.json')
  const codexPlugin = tryAccess(codexPluginPath) ? readJsonRecord(codexPluginPath) : null
  const codexMcp = tryAccess(codexMcpPath) ? readJsonRecord(codexMcpPath) : null
  const codexHooks = tryAccess(codexHooksPath) ? readJsonRecord(codexHooksPath) : null

  if (tryAccess(codexPluginPath) && !codexPlugin) {
    failures.push('Codex artifact is not valid JSON: .codex-plugin/plugin.json')
  }
  if (tryAccess(codexMcpPath) && !codexMcp) {
    failures.push('Codex artifact is not valid JSON: codex.mcp.json')
  }
  if (tryAccess(codexHooksPath) && !codexHooks) {
    failures.push('Codex artifact is not valid JSON: hooks/hooks.json')
  }

  if (codexPlugin) {
    if (codexPlugin.mcpServers !== './codex.mcp.json') {
      failures.push('Codex plugin manifest must point mcpServers at codex.mcp.json')
    }
    if (codexPlugin.hooks !== './hooks/hooks.json') {
      failures.push('Codex plugin manifest must point hooks at hooks/hooks.json')
    }
  }

  if (codexMcp) {
    const server = codexMcp.webpresso
    const serverRecord =
      server && typeof server === 'object' && !Array.isArray(server)
        ? (server as Record<string, unknown>)
        : null
    if (
      serverRecord?.command !== '${PLUGIN_ROOT}/bin/wp' ||
      !stringArrayEquals(serverRecord.args, ['mcp'])
    ) {
      failures.push(
        'Codex MCP artifact must expose direct webpresso server map launching ${PLUGIN_ROOT}/bin/wp mcp',
      )
    }
  }

  if (codexHooks) {
    const hooks = codexHooks.hooks
    const hookKeys =
      hooks && typeof hooks === 'object' && !Array.isArray(hooks) ? Object.keys(hooks) : null
    if (!hookKeys || hookKeys.length > 0) {
      failures.push('Codex packaged hook artifact must remain inert; setup owns active hooks')
    }
  }

  const present = [
    hasClaudePlugin ? '.claude-plugin/plugin.json' : null,
    ...CODEX_PLUGIN_ARTIFACTS.filter((artifactPath) => tryAccess(join(cwd, artifactPath))),
  ].filter((value): value is string => value !== null)

  const repairHint =
    'Codex repair: run `wp setup`; package repair: rebuild the public artifact from source'
  return failures.length === 0
    ? {
        name: 'packaged host artifacts',
        ok: true,
        detail: `packaged artifacts visible: ${present.join(', ')}; ${repairHint}`,
      }
    : {
        name: 'packaged host artifacts',
        ok: false,
        detail: `${failures.join('; ')}; ${repairHint}`,
      }
}

export function checkHostArtifactOwnership(cwd = process.cwd()): DoctorCheck {
  const opencodePath = '.opencode/plugins/webpresso-hooks.js'
  const opencodeInstalled = tryAccess(join(cwd, opencodePath))
  return {
    name: 'host artifact ownership',
    ok: true,
    detail: [
      'Claude active hooks stay setup-managed in .claude/settings.json',
      'Codex active hooks stay setup-managed in .codex/hooks.json',
      'hooks/hooks.json is package metadata only; active hooks require wp setup',
      opencodeInstalled
        ? 'OpenCode bridge is degraded and installed at .opencode/plugins/webpresso-hooks.js'
        : 'OpenCode bridge is degraded and not installed',
      'run `wp setup --host opencode` to refresh the OpenCode bridge',
    ].join('; '),
  }
}

export function checkHostLifecycleDepth(): DoctorCheck {
  return {
    name: 'host lifecycle depth',
    ok: true,
    detail:
      'Claude/Codex managed hooks: full for replacement-critical lifecycle events; Cursor/OpenCode: degraded with host-specific lifecycle depth',
  }
}

/**
 * Verify the consumer's `.claude/settings.json` carries the direct agent-kit
 * hook commands. Since the hooks are single-sourced there (not in the plugin
 * manifest), a missing reference means a plugin-only install that never ran
 * `wp setup` — i.e. no agent-kit hooks are active.
 */
export function checkManagedHooksInstalled(cwd = process.cwd()): {
  ok: boolean
  detail?: string
} {
  const settingsPath = join(cwd, '.claude', 'settings.json')
  if (!tryAccess(settingsPath)) {
    return {
      ok: false,
      detail: 'no .claude/settings.json — run `wp setup` to install the agent-kit hooks',
    }
  }
  try {
    const raw = readFileSync(settingsPath, 'utf-8')
    if (!AGENT_KIT_HOOK_MARKERS.every((marker) => raw.includes(marker))) {
      return {
        ok: false,
        detail: 'agent-kit hooks not found in .claude/settings.json — run `wp setup`',
      }
    }
    return { ok: true }
  } catch (err) {
    return { ok: false, detail: `failed to read .claude/settings.json: ${String(err)}` }
  }
}

/**
 * Parse the installed hooks from `.claude/settings.json` into a HooksMap.
 * Returns an empty map when the file is absent or unparseable.
 */
function readInstalledClaudeHooks(cwd: string): HooksMap {
  const settingsPath = join(cwd, '.claude', 'settings.json')
  if (!tryAccess(settingsPath)) return {}
  try {
    const raw = readFileSync(settingsPath, 'utf-8')
    const parsed = JSON.parse(raw) as {
      hooks?: Record<
        string,
        Array<{
          matcher?: string
          hooks?: Array<{ type?: string; command?: string; timeout?: number }>
        }>
      >
    }
    const result: HooksMap = {}
    for (const [event, groups] of Object.entries(parsed.hooks ?? {})) {
      result[event] = (groups ?? []).map((g) => ({
        ...(g.matcher !== undefined ? { matcher: g.matcher } : {}),
        hooks: (g.hooks ?? []).map((h) => ({
          type: h.type ?? 'command',
          command: h.command ?? '',
          ...(h.timeout !== undefined ? { timeout: h.timeout } : {}),
        })),
      }))
    }
    return result
  } catch {
    return {}
  }
}

/**
 * Parse the installed hooks from `.codex/hooks.json` into a HooksMap.
 * Returns an empty map when the file is absent or unparseable.
 */
function readInstalledCodexHooks(cwd: string): HooksMap {
  const hooksPath = join(cwd, '.codex', 'hooks.json')
  if (!tryAccess(hooksPath)) return {}
  try {
    const raw = readFileSync(hooksPath, 'utf-8')
    const parsed = JSON.parse(raw) as {
      hooks?: Record<
        string,
        Array<{
          matcher?: string
          hooks?: Array<{ type?: string; command?: string; timeout?: number }>
        }>
      >
    }
    const result: HooksMap = {}
    for (const [event, groups] of Object.entries(parsed.hooks ?? {})) {
      result[event] = (groups ?? []).map((g) => ({
        ...(g.matcher !== undefined ? { matcher: g.matcher } : {}),
        hooks: (g.hooks ?? []).map((h) => ({
          type: h.type ?? 'command',
          command: h.command ?? '',
          ...(h.timeout !== undefined ? { timeout: h.timeout } : {}),
        })),
      }))
    }
    return result
  } catch {
    return {}
  }
}

/**
 * Compare the installed hooks against the `.webpresso/hooks-manifest.json`.
 * Reports advisory findings per hook entry (ok / missing / unknown).
 * When the manifest is absent, emits a single info-level advisory prompting
 * the user to run `wp setup`.
 */
export function checkHooksManifest(cwd = process.cwd()): DoctorCheck {
  const manifest = readHooksManifest(cwd)
  if (manifest === null) {
    const setupCommand = setupCommandForRepo(cwd)
    return {
      name: 'hooks manifest',
      ok: true,
      advisory: true,
      detail: `no .webpresso/hooks-manifest.json — run \`${setupCommand}\` to generate it`,
    }
  }

  const installedClaude = readInstalledClaudeHooks(cwd)
  const installedCodex = readInstalledCodexHooks(cwd)
  const diffs = diffHooksManifest(manifest, { claude: installedClaude, codex: installedCodex })

  const missing = diffs.filter((d) => d.verdict === 'missing')
  const unknown = diffs.filter((d) => d.verdict === 'unknown')

  if (missing.length === 0 && unknown.length === 0) {
    return {
      name: 'hooks manifest',
      ok: true,
      advisory: true,
      detail: `${diffs.length} hook entry/entries match manifest`,
    }
  }

  const parts: string[] = []
  if (missing.length > 0) {
    const restoreCommand = setupCommandForRepo(cwd, { restoreHooks: true })
    const preview = missing
      .slice(0, 2)
      .map((d) => `${d.vendor}/${d.event}`)
      .join(', ')
    parts.push(
      `${missing.length} missing (${preview}${missing.length > 2 ? ', …' : ''}) — run \`${restoreCommand}\``,
    )
  }
  if (unknown.length > 0) {
    const preview = unknown
      .slice(0, 2)
      .map((d) => `${d.vendor}/${d.event}`)
      .join(', ')
    parts.push(
      `${unknown.length} unknown (${preview}${unknown.length > 2 ? ', …' : ''}) — hand-edited? review with \`wp hooks status\``,
    )
  }

  return {
    name: 'hooks manifest',
    ok: false,
    advisory: true,
    detail: parts.join('; '),
  }
}

function hooksConfigPath(vendor: 'claude' | 'codex', cwd: string): string {
  return vendor === 'claude'
    ? join(cwd, '.claude', 'settings.json')
    : join(cwd, '.codex', 'hooks.json')
}

function existingHookConfigPaths(cwd: string): readonly string[] {
  return (['claude', 'codex'] as const)
    .map((vendor) => hooksConfigPath(vendor, cwd))
    .filter((filePath) => tryAccess(filePath))
}

async function defaultRunRestoreFix(cwd: string): Promise<number> {
  const { runInit } = await import('#cli/commands/init/index.js')
  return await runInit(
    {
      cwd,
      yes: true,
      restoreHooks: true,
      sourceMaintenance: setupCommandForRepo(cwd).startsWith('WP_FORCE_SOURCE=1 '),
    },
    { stdout: { write: () => true } },
  )
}

export function buildHooksDoctorFixPlan(cwd = process.cwd()): HookFixResult {
  const manifest = readHooksManifest(cwd)
  const preservedFiles = existingHookConfigPaths(cwd)

  if (manifest === null) {
    const setupCommand = setupCommandForRepo(cwd)
    return {
      status: 'requires-approval',
      detail:
        'no hooks manifest exists; doctor will not run full `wp setup` automatically because that can rewrite broader repo-managed surfaces',
      preservedFiles,
      nextCommand: setupCommand,
    }
  }

  const installedClaude = readInstalledClaudeHooks(cwd)
  const installedCodex = readInstalledCodexHooks(cwd)
  const diffs = diffHooksManifest(manifest, { claude: installedClaude, codex: installedCodex })
  const missing = diffs.filter((d) => d.verdict === 'missing')
  const unknown = diffs.filter((d) => d.verdict === 'unknown')

  if (unknown.length > 0) {
    const affectedFiles = [...new Set(unknown.map((diff) => hooksConfigPath(diff.vendor, cwd)))]
    return {
      status: 'blocked',
      detail:
        'installed hooks exist outside the manifest; doctor will not overwrite potentially hand-edited hook config automatically',
      preservedFiles: affectedFiles,
      nextCommand: 'wp hooks status',
    }
  }

  if (missing.length === 0) {
    return {
      status: 'fixed',
      detail: 'managed hooks already match the manifest; no hook restore was needed',
    }
  }

  return {
    status: 'prepared',
    detail:
      'managed hooks are missing but the manifest is present and there are no unknown installed hooks; safe restore path is ready',
    preservedFiles,
    nextCommand: setupCommandForRepo(cwd, { restoreHooks: true }),
  }
}

/**
 * Detect competing hook plugins (e.g. oh-my-claudecode / OMC) in the Claude
 * plugin registry and report the expected coexistence model.
 *
 * wp hooks live in `.claude/settings.json` (user-owned). Third-party plugin
 * hooks live inside each plugin's own cache directory. `omc update` replaces
 * the plugin cache but never touches `settings.json`, so wp hooks survive
 * by design. When both run, Claude Code fires all matching PreToolUse hooks
 * concurrently; a deny from either wins.
 */
export function checkThirdPartyHookCoexistence(
  options: {
    claudeConfigDir?: string
  } = {},
): DoctorCheck {
  const configDir =
    options.claudeConfigDir ??
    process.env.CLAUDE_CONFIG_DIR ??
    join(process.env.HOME ?? '', '.claude')
  const registryPath = join(configDir, 'plugins', 'installed_plugins.json')

  if (!tryAccess(registryPath)) {
    return {
      name: 'third-party hook coexistence',
      ok: true,
      detail: 'no Claude plugin registry found; single-plugin mode',
    }
  }

  let omcVersion: string | undefined
  try {
    const raw = readFileSync(registryPath, 'utf-8')
    const parsed = JSON.parse(raw) as {
      plugins?: Record<string, Array<{ version?: string; scope?: string }>>
    }
    const omcEntries = parsed.plugins?.['oh-my-claudecode@omc']
    if (Array.isArray(omcEntries) && omcEntries.length > 0) {
      // Prefer user-scope entry for version label; fall back to first entry
      const userEntry = omcEntries.find((e) => e.scope === 'user') ?? omcEntries[0]
      omcVersion = userEntry?.version
    }
  } catch {
    return {
      name: 'third-party hook coexistence',
      ok: true,
      detail: 'could not read plugin registry; skipped',
    }
  }

  if (!omcVersion) {
    return {
      name: 'third-party hook coexistence',
      ok: true,
      detail: 'no competing hook plugins detected',
    }
  }

  return {
    name: 'third-party hook coexistence',
    ok: true,
    // Concurrent double-fire on PreToolUse is expected: Claude runs all matching
    // hooks from all sources simultaneously; a deny from either wins. wp hooks in
    // settings.json survive omc update because that command only replaces the
    // plugin cache directory, not settings.json.
    detail:
      `OMC ${omcVersion} detected — concurrent PreToolUse double-fire is expected and idempotent; ` +
      'wp hooks in settings.json survive omc update (separate files)',
  }
}

async function applyHooksDoctorFixPlan(
  plan: HookFixResult,
  cwd: string,
  runRestoreFix: (cwd: string) => Promise<number>,
): Promise<HookFixResult> {
  if (plan.status !== 'prepared') return plan

  const exitCode = await runRestoreFix(cwd)
  if (exitCode === 0) {
    return {
      status: 'fixed',
      detail: `restored managed hooks from the manifest via \`${setupCommandForRepo(cwd, { restoreHooks: true })}\``,
      preservedFiles: plan.preservedFiles,
    }
  }

  return {
    status: 'blocked',
    detail: `safe restore path failed with exit code ${exitCode}`,
    preservedFiles: plan.preservedFiles,
    nextCommand: plan.nextCommand,
  }
}

export async function runHooksDoctor(opts: RunHooksDoctorOptions = {}): Promise<DoctorResult> {
  const checks: DoctorCheck[] = []
  const isWin = platform() === 'win32'
  const wpCli = resolveWpCliCommand()

  for (const bin of HOOK_BINS) {
    if (!wpCli) {
      checks.push({ name: bin.name, ok: false, detail: "repo 'wp' launcher not found" })
      continue
    }

    if (
      !isWin &&
      (wpCli.command.includes('/') || wpCli.command.includes('\\')) &&
      !isExecutable(wpCli.command)
    ) {
      checks.push({ name: bin.name, ok: false, detail: 'exists but not executable' })
      continue
    }

    const probe = await probeHookBin(wpCli, bin.hookName, bin.checkStdin)
    checks.push({ name: bin.name, ok: probe.ok, detail: probe.detail })
  }

  if (opts.probeDecisions && wpCli) {
    for (const row of PROBE_ROWS) {
      const decision = await probeDecisionRow(wpCli, row)
      checks.push({
        name: `decision probe: ${row.name}`,
        ok: decision.ok,
        detail: decision.detail ?? 'decision matches conformance matrix',
      })
    }
  }

  checks.push(checkConsumerCodexHookPaths(opts.cwd))

  checks.push({ name: 'plugin.json integrity', ...checkPluginJson() })
  checks.push({ advisory: true, ...checkRootLauncherContract() })
  checks.push({ advisory: true, ...checkNativePluginRuntime() })
  checks.push({ advisory: true, ...checkPhase2RuntimeTypecheckParity() })
  checks.push({ advisory: true, ...checkOmxPluginCacheStaleSurfaceRepair() })
  checks.push({ advisory: true, ...checkThirdPartyHookCoexistence() })
  checks.push({ advisory: true, ...checkPackagedHostArtifacts(opts.cwd) })
  checks.push({ advisory: true, ...checkHostArtifactOwnership(opts.cwd) })
  checks.push({ advisory: true, ...checkHostLifecycleDepth() })
  checks.push(operatorPrecedenceCheck())
  checks.push({
    name: 'managed hooks installed (.claude/settings.json)',
    advisory: true,
    ...checkManagedHooksInstalled(opts.cwd),
  })

  if (opts.skipMcp) {
    checks.push({ name: 'MCP server liveness', ok: true, detail: 'skipped (--skip-mcp)' })
  } else {
    const mcpResult = await checkMcpServer()
    checks.push({
      name: 'MCP server liveness',
      ok: true,
      detail: mcpResult.skipped
        ? mcpResult.detail
        : mcpResult.ok
          ? mcpResult.detail
          : `WARNING: ${mcpResult.detail}`,
    })
  }

  const rtkCheck = await checkRtkOnPath(opts.cwd)
  if (rtkCheck) checks.push(rtkCheck)

  const hostMode = opts.hosts ?? 'auto'
  if (shouldRunHostChecks(hostMode)) {
    for (const host of resolveRequestedHosts(hostMode, opts.hostNames)) {
      if (host === 'codex') {
        checks.push(await checkCodexHost())
      }
      if (host === 'opencode') {
        checks.push(await checkOpenCodeHost())
      }
      if (host === 'claude') {
        checks.push(await checkClaudeHost())
      }
    }
  }

  const requiredHosts = shouldRequireHost(hostMode)
  if (requiredHosts) {
    for (const host of resolveRequestedHosts(hostMode, opts.hostNames)) {
      if (host === 'codex') {
        const available = await runCommand('codex', ['--version'])
        if (!available.ok)
          checks.push({
            name: 'Codex host integration',
            ok: false,
            detail: 'codex required but not on PATH',
          })
      }
      if (host === 'opencode') {
        const available = await runCommand('opencode', ['--version'])
        if (!available.ok)
          checks.push({
            name: 'OpenCode host integration',
            ok: false,
            detail: 'opencode required but not on PATH',
          })
      }
      if (host === 'claude') {
        const available = await runCommand('claude', ['--version'])
        if (!available.ok)
          checks.push({
            name: 'Claude host integration',
            ok: false,
            detail: 'claude required but not on PATH',
          })
      }
    }
  }

  checks.push(checkHooksManifest(opts.cwd))

  const nonMcpChecks = checks.filter((c) => !c.name.startsWith('MCP ') && !c.advisory)
  const overallOk = nonMcpChecks.every((c) => c.ok)

  return { ok: overallOk, checks }
}

export async function printHooksDoctor(opts: RunHooksDoctorOptions = {}): Promise<number> {
  let result = await runHooksDoctor(opts)
  let fixResult: HookFixResult | null = null

  if (opts.fix) {
    const cwd = opts.cwd ?? process.cwd()
    if (result.ok) {
      fixResult = {
        status: 'fixed',
        detail: 'doctor found no failing non-advisory checks; no changes were needed',
      }
    } else {
      const plan = buildHooksDoctorFixPlan(cwd)
      fixResult =
        plan.status === 'fixed'
          ? {
              status: 'blocked',
              detail:
                'doctor found failing checks outside the safe manifest-restore path; no automatic fix was applied',
              nextCommand: 'wp hooks doctor',
            }
          : await applyHooksDoctorFixPlan(plan, cwd, opts.runRestoreFix ?? defaultRunRestoreFix)

      if (fixResult.status === 'fixed') {
        result = await runHooksDoctor({ ...opts, fix: false, runRestoreFix: undefined })
      }
    }
  }

  for (const check of result.checks) {
    const icon = check.ok ? '[x]' : '[ ]'
    const detail = check.detail ? `: ${check.detail}` : ''
    console.error(`${icon} ${check.name}${detail}`)
  }

  if (fixResult) {
    console.error('')
    console.error(`[~] hooks fix: ${fixResult.status}: ${fixResult.detail}`)
    if ((fixResult.preservedFiles?.length ?? 0) > 0) {
      console.error(`    preserved: ${fixResult.preservedFiles!.join(', ')}`)
    }
    if (fixResult.nextCommand) {
      console.error(`    next: ${fixResult.nextCommand}`)
    }
  }

  console.error('')
  console.error('Operator flow:')
  console.error(`  • ${OPERATOR_PRECEDENCE_DETAIL}`)
  console.error('  • After `wp setup`, run `wp hooks doctor` as the canonical success check.')
  console.error(
    '  • First host success: ask Claude or Codex to run `wp_audit(kind="docs-frontmatter")`.',
  )

  if (!result.ok) {
    console.error('')
    console.error('Repair hints:')
    console.error(
      `  • Refresh local hook/plugin surfaces: \`${setupCommandForRepo(opts.cwd ?? process.cwd())}\``,
    )
    console.error(
      '  • Consumers: run `vp install -g @webpresso/agent-kit && wp setup`; source checkout: run `WP_FORCE_SOURCE=1 wp setup --source-maintenance`.',
    )
    console.error(
      '  • If install failed resolving @webpresso/agent-kit: make sure this repo uses the public npm registry, then rerun `vp install`',
    )
  }

  return result.ok ? 0 : 1
}
