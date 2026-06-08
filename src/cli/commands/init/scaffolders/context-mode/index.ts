import { spawnSync } from 'node:child_process'
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs'
import { homedir } from 'node:os'
import { basename, dirname, join } from 'node:path'

import { patchJsonFile, type MergeOptions, type MergeResult } from '#cli/commands/init/merge'
import {
  agentKitMcpLaunchCommand,
  findWebpressoMcpEntry,
} from '#cli/commands/init/scaffolders/codex-mcp/index'
import {
  defaultCodexHooksPathFromConfig,
  normalizeGlobalCodexHooksFile,
  resolveBinaryOnPath,
} from '#cli/commands/init/scaffolders/agent-hooks/codex-global-normalize'
import { makeNoopSpinnerFactory, type SpinnerFactory } from '#cli/commands/init/scaffolders/spinner'
import { checkVersionPin } from '#cli/commands/init/scaffolders/version-pin'

export interface EnsureContextModeInput {
  repoRoot: string
  options: MergeOptions
  spawn?: typeof spawnSync
  codexConfigPath?: string
  claudeSettingsPath?: string
  opencodeConfigPath?: string
  pinFilePath?: string
  nodeBinary?: string
  strict?: boolean
  spinnerFactory?: SpinnerFactory
  globalInstall?: boolean
}

export type EnsureContextModeResult = {
  codexFeatures: MergeResult
  codexGlobalHooks: MergeResult
  claudeGlobalHooks: MergeResult
  opencodeConfig: MergeResult
  installed: boolean
}

const CODEX_CONTEXT_MODE_FEATURES: Record<string, string> = {
  plugin_hooks: 'true',
  hooks: 'true',
}

function defaultCodexConfigPath(): string {
  const codexHome = process.env.CODEX_HOME || join(process.env.HOME || homedir(), '.codex')
  return join(codexHome, 'config.toml')
}

function defaultOpenCodeConfigPath(repoRoot: string): string {
  return join(repoRoot, 'opencode.json')
}

function defaultClaudeSettingsPath(): string {
  return join(process.env.HOME || homedir(), '.claude', 'settings.json')
}

function quoteShell(value: string): string {
  return `'${value.replaceAll("'", `'\\''`)}'`
}

function stripOuterQuotes(value: string): string {
  if (
    value.length >= 2 &&
    ((value.startsWith('"') && value.endsWith('"')) ||
      (value.startsWith("'") && value.endsWith("'")))
  ) {
    return value.slice(1, -1)
  }
  return value
}

function resolveNodeBinaryOverride(explicit: string | undefined): string | null {
  if (explicit) return explicit
  if (basename(process.execPath).startsWith('node')) return process.execPath
  return resolveBinaryOnPath('node')
}

function normalizeClaudeContextModeCommand(
  command: string,
  nodeBinary: string,
  scriptPath: string,
): string {
  const trimmed = command.trim()
  const desired = `${quoteShell(nodeBinary)} ${quoteShell(scriptPath)}`
  if (trimmed === desired) return command

  if (stripOuterQuotes(trimmed) === scriptPath) return desired

  const bareNodeMatch = /^node\s+(.+)$/u.exec(trimmed)
  if (bareNodeMatch && stripOuterQuotes(bareNodeMatch[1]!.trim()) === scriptPath) {
    return desired
  }

  return command
}

function normalizeClaudeContextModeHooks(
  settingsPath: string,
  nodeBinary: string | null,
  options: MergeOptions,
): MergeResult {
  if (!existsSync(settingsPath) || !nodeBinary) {
    return { targetPath: settingsPath, action: options.dryRun ? 'skipped-dry' : 'identical' }
  }

  const scriptPath = join(dirname(settingsPath), 'hooks', 'context-mode-cache-heal.mjs')
  const raw = readFileSync(settingsPath, 'utf8')
  const parsed = JSON.parse(raw) as Record<string, unknown>
  const hooksRoot =
    parsed.hooks && typeof parsed.hooks === 'object' && !Array.isArray(parsed.hooks)
      ? { ...(parsed.hooks as Record<string, unknown>) }
      : null
  const sessionStart = Array.isArray(hooksRoot?.SessionStart) ? hooksRoot.SessionStart : null
  if (!hooksRoot || !sessionStart) {
    return { targetPath: settingsPath, action: 'identical' }
  }

  let changed = false
  const nextSessionStart = sessionStart.map((group) => {
    if (
      !group ||
      typeof group !== 'object' ||
      !Array.isArray((group as { hooks?: unknown }).hooks)
    ) {
      return group
    }

    const hooks = (group as { hooks: Array<Record<string, unknown>> }).hooks
    let groupChanged = false
    const nextHooks = hooks.map((hook) => {
      const command = typeof hook.command === 'string' ? hook.command : null
      if (!command) return hook
      const nextCommand = normalizeClaudeContextModeCommand(command, nodeBinary, scriptPath)
      if (nextCommand === command) return hook
      changed = true
      groupChanged = true
      return { ...hook, command: nextCommand }
    })

    return groupChanged ? { ...group, hooks: nextHooks } : group
  })

  if (!changed) return { targetPath: settingsPath, action: 'identical' }
  if (options.dryRun) return { targetPath: settingsPath, action: 'skipped-dry' }

  const next = {
    ...parsed,
    hooks: {
      ...hooksRoot,
      SessionStart: nextSessionStart,
    },
  }
  writeFileSync(settingsPath, `${JSON.stringify(next, null, 2)}\n`, 'utf8')
  return { targetPath: settingsPath, action: 'overwritten' }
}

export function upsertCodexContextModeFeatures(raw: string): string {
  const trimmed = raw.trimEnd()
  const lines = trimmed.length > 0 ? trimmed.split(/\r?\n/) : []
  const hasContent = raw.trim().length > 0
  const start = lines.findIndex((line) => line.trim() === '[features]')

  if (start === -1) {
    const prefix = hasContent ? `${raw.trimEnd()}\n\n` : ''
    return `${prefix}[features]\n${Object.entries(CODEX_CONTEXT_MODE_FEATURES)
      .map(([key, value]) => `${key} = ${value}`)
      .join('\n')}\n`
  }

  let end = lines.length
  for (let i = start + 1; i < lines.length; i += 1) {
    if (lines[i]!.trim().startsWith('[')) {
      end = i
      break
    }
  }

  const seen = new Set<string>()
  const body = lines.slice(start + 1, end).map((line) => {
    const match = line.match(/^(\s*)(hooks|plugin_hooks)\s*=/)
    if (!match) return line
    const key = match[2]!
    seen.add(key)
    return `${match[1]}${key} = ${CODEX_CONTEXT_MODE_FEATURES[key]}`
  })
  const trailingBlankLines: string[] = []
  while (body.length > 0 && body[body.length - 1]?.trim() === '') {
    trailingBlankLines.unshift(body.pop()!)
  }
  for (const [key, value] of Object.entries(CODEX_CONTEXT_MODE_FEATURES)) {
    if (!seen.has(key)) body.push(`${key} = ${value}`)
  }
  body.push(...trailingBlankLines)

  return [...lines.slice(0, start + 1), ...body, ...lines.slice(end)].join('\n') + '\n'
}

export function patchOpenCodeContextModeConfig(
  existing: Record<string, unknown>,
  agentKitCommand: string[] = ['vp', 'exec', 'wp', 'mcp'],
): Record<string, unknown> {
  const currentMcp =
    existing.mcp && typeof existing.mcp === 'object' && !Array.isArray(existing.mcp)
      ? { ...(existing.mcp as Record<string, unknown>) }
      : {}
  currentMcp['context-mode'] = {
    type: 'local',
    command: ['context-mode'],
  }
  currentMcp['webpresso'] = {
    type: 'local',
    command: agentKitCommand,
  }

  const currentPlugins = Array.isArray(existing.plugin)
    ? existing.plugin.filter((value): value is string => typeof value === 'string')
    : []
  const plugins = currentPlugins.includes('context-mode')
    ? currentPlugins
    : [...currentPlugins, 'context-mode']

  return {
    ...existing,
    $schema: 'https://opencode.ai/config.json',
    mcp: currentMcp,
    plugin: plugins,
  }
}

function resolveOpenCodeWebpressoCommand(repoRoot: string, globalInstall = false): string[] {
  const repoLocalRoot = join(repoRoot, 'node_modules', '@webpresso', 'webpresso')
  const entryPath =
    findWebpressoMcpEntry({ candidates: [repoLocalRoot] }) ?? findWebpressoMcpEntry()
  if (!entryPath) return globalInstall ? ['wp', 'mcp'] : ['vp', 'exec', 'wp', 'mcp']
  const launch = agentKitMcpLaunchCommand(entryPath)
  return [launch.command, ...launch.args]
}

function ensureCodexContextModeFeatures(configPath: string, options: MergeOptions): MergeResult {
  if (options.dryRun) return { targetPath: configPath, action: 'skipped-dry' }
  const existed = existsSync(configPath)
  const existing = existed ? readFileSync(configPath, 'utf8') : ''
  const next = upsertCodexContextModeFeatures(existing)
  if (next === existing) return { targetPath: configPath, action: 'identical' }
  mkdirSync(dirname(configPath), { recursive: true })
  writeFileSync(configPath, next, 'utf8')
  return { targetPath: configPath, action: existed ? 'overwritten' : 'created' }
}

const CONTEXT_MODE_NOT_FOUND_HINT =
  'context-mode is not on PATH after `vp install -g context-mode`. Install it manually and re-run.'

function ensureContextModeBinary(
  spawn: typeof spawnSync,
  spinner: { start(): void; succeed(t?: string): void; fail(t?: string): void },
): { installed: boolean; version: string; binaryPath: string } {
  let installed = false
  spinner.start()
  let probe = spawn('context-mode', ['--help'], { stdio: 'ignore' })
  if (probe.error || (probe.status !== null && probe.status !== 0)) {
    const install = spawn('vp', ['install', '-g', 'context-mode'], { stdio: 'inherit' })
    if (install.status !== 0) {
      spinner.fail('context-mode install failed')
      throw new Error(CONTEXT_MODE_NOT_FOUND_HINT)
    }

    installed = true
    probe = spawn('context-mode', ['--help'], { stdio: 'ignore' })
    if (probe.error || (probe.status !== null && probe.status !== 0)) {
      spinner.fail('context-mode not found after install')
      throw new Error(CONTEXT_MODE_NOT_FOUND_HINT)
    }
  } else {
    spawn('vp', ['update', '-g', 'context-mode'], { stdio: 'inherit' })
  }

  // Detect installed version for pin check
  const versionProbe = spawn('context-mode', ['--version'], { encoding: 'utf8' })
  const version = String(versionProbe.stdout ?? '').trim()
  const binaryPath = resolveBinaryOnPath('context-mode')
  if (binaryPath === null) {
    spinner.fail('context-mode path not resolvable after install')
    throw new Error(CONTEXT_MODE_NOT_FOUND_HINT)
  }

  spinner.succeed('context-mode ready')
  return { installed, version, binaryPath }
}

export function ensureContextMode(input: EnsureContextModeInput): EnsureContextModeResult {
  const codexConfigPath = input.codexConfigPath ?? defaultCodexConfigPath()
  const opencodeConfigPath = input.opencodeConfigPath ?? defaultOpenCodeConfigPath(input.repoRoot)
  const claudeSettingsPath = input.claudeSettingsPath ?? defaultClaudeSettingsPath()
  const codexHooksPath = defaultCodexHooksPathFromConfig(codexConfigPath)

  if (input.options.dryRun) {
    return {
      codexFeatures: { targetPath: codexConfigPath, action: 'skipped-dry' },
      codexGlobalHooks: { targetPath: codexHooksPath, action: 'skipped-dry' },
      claudeGlobalHooks: { targetPath: claudeSettingsPath, action: 'skipped-dry' },
      opencodeConfig: { targetPath: opencodeConfigPath, action: 'skipped-dry' },
      installed: false,
    }
  }

  const spawn = input.spawn ?? spawnSync
  const spinner = (input.spinnerFactory ?? makeNoopSpinnerFactory())('context-mode')
  const { installed, version, binaryPath } = ensureContextModeBinary(spawn, spinner)

  const pinCheck = checkVersionPin(
    'context_mode',
    version,
    input.pinFilePath ?? join(input.repoRoot, 'compatible-versions.json'),
  )
  if (!pinCheck.ok) {
    if (input.strict) {
      throw new Error(pinCheck.warning)
    }
    console.warn(pinCheck.warning)
  }

  return {
    codexFeatures: ensureCodexContextModeFeatures(codexConfigPath, input.options),
    codexGlobalHooks: normalizeGlobalCodexHooksFile(
      codexHooksPath,
      { contextModeBinary: binaryPath },
      input.options,
    ),
    claudeGlobalHooks: normalizeClaudeContextModeHooks(
      claudeSettingsPath,
      resolveNodeBinaryOverride(input.nodeBinary),
      input.options,
    ),
    opencodeConfig: patchJsonFile(
      opencodeConfigPath,
      (existing) =>
        patchOpenCodeContextModeConfig(
          existing,
          resolveOpenCodeWebpressoCommand(input.repoRoot, input.globalInstall),
        ),
      input.options,
    ),
    installed,
  }
}
