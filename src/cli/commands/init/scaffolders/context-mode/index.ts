import { spawnSync } from 'node:child_process'
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs'
import { homedir } from 'node:os'
import { dirname, join } from 'node:path'

import { patchJsonFile, type MergeOptions, type MergeResult } from '#cli/commands/init/merge'
import { hoistTopLevelEvents } from '#cli/commands/init/scaffolders/agent-hooks/index'
import {
  agentKitMcpLaunchCommand,
  findAgentKitMcpEntry,
} from '#cli/commands/init/scaffolders/codex-mcp/index'
import { makeNoopSpinnerFactory, type SpinnerFactory } from '#cli/commands/init/scaffolders/spinner'
import { checkVersionPin } from '#cli/commands/init/scaffolders/version-pin'

export interface EnsureContextModeInput {
  repoRoot: string
  options: MergeOptions
  spawn?: typeof spawnSync
  codexConfigPath?: string
  codexHooksPath?: string
  opencodeConfigPath?: string
  pinFilePath?: string
  strict?: boolean
  spinnerFactory?: SpinnerFactory
  globalInstall?: boolean
}

export type EnsureContextModeResult = {
  codexMcp: MergeResult
  codexHooks: MergeResult
  opencodeConfig: MergeResult
  installed: boolean
}

const CONTEXT_MODE_MCP_SERVER_NAME = 'context-mode'
const CONTEXT_MODE_MCP_HEADER = `[mcp_servers.${CONTEXT_MODE_MCP_SERVER_NAME}]`
const CONTEXT_MODE_MCP_BLOCK = `${CONTEXT_MODE_MCP_HEADER}
command = "context-mode"
`

const CONTEXT_MODE_CODEX_PRETOOL_MATCHER =
  'local_shell|shell|shell_command|exec_command|container.exec|Bash|Shell|grep_files|mcp__plugin_context-mode_context-mode__ctx_execute|mcp__plugin_context-mode_context-mode__ctx_execute_file|mcp__plugin_context-mode_context-mode__ctx_batch_execute'

type HookEntry = { type: string; command: string; timeout?: number }
type HookGroup = { matcher?: string; hooks: HookEntry[] }
type HooksMap = Record<string, HookGroup[]>

function defaultCodexConfigPath(): string {
  const codexHome = process.env.CODEX_HOME || join(process.env.HOME || homedir(), '.codex')
  return join(codexHome, 'config.toml')
}

function defaultCodexHooksPath(): string {
  const codexHome = process.env.CODEX_HOME || join(process.env.HOME || homedir(), '.codex')
  return join(codexHome, 'hooks.json')
}

function defaultOpenCodeConfigPath(repoRoot: string): string {
  return join(repoRoot, 'opencode.json')
}

function ensureGroup(groups: HookGroup[], group: HookGroup): HookGroup[] {
  const command = group.hooks[0]?.command
  if (!command) return groups
  const exists = groups.some(
    (candidate) =>
      candidate.matcher === group.matcher &&
      candidate.hooks.some((hook) => hook.command === command),
  )
  return exists ? groups : [...groups, group]
}

export function upsertContextModeMcpServer(raw: string): string {
  const lines = raw.trimEnd().split(/\r?\n/)
  const hasContent = raw.trim().length > 0
  const start = lines.findIndex((line) => line.trim() === CONTEXT_MODE_MCP_HEADER)

  if (start === -1) {
    const prefix = hasContent ? `${raw.trimEnd()}\n\n` : ''
    return `${prefix}${CONTEXT_MODE_MCP_BLOCK}`
  }

  let end = lines.length
  for (let i = start + 1; i < lines.length; i += 1) {
    if (lines[i]!.trim().startsWith('[')) {
      end = i
      break
    }
  }

  return (
    [
      ...lines.slice(0, start),
      ...CONTEXT_MODE_MCP_BLOCK.trimEnd().split('\n'),
      ...lines.slice(end),
    ].join('\n') + '\n'
  )
}

// Codex hooks are enabled by default — do NOT write `[features].hooks = true`
// (context-mode README is stale on this; upstream developers.openai.com/codex/hooks
// is authoritative — the flag is a disable-only toggle). PreToolUse in Codex is
// deny-only until openai/codex#18491 lands `updatedInput`. PreCompact requires
// Codex 0.130.0+. `additionalContext` injection routes via PostToolUse/SessionStart
// (handled by context-mode's codex formatter automatically).
export function patchCodexContextModeHooks(
  existing: Record<string, unknown>,
): Record<string, unknown> {
  const migrated = hoistTopLevelEvents(existing)
  const hooks = { ...((migrated.hooks ?? {}) as HooksMap) }

  hooks.PreToolUse = ensureGroup(hooks.PreToolUse ?? [], {
    matcher: CONTEXT_MODE_CODEX_PRETOOL_MATCHER,
    hooks: [{ type: 'command', command: 'context-mode hook codex pretooluse' }],
  })
  hooks.PostToolUse = ensureGroup(hooks.PostToolUse ?? [], {
    hooks: [{ type: 'command', command: 'context-mode hook codex posttooluse' }],
  })
  hooks.SessionStart = ensureGroup(hooks.SessionStart ?? [], {
    hooks: [{ type: 'command', command: 'context-mode hook codex sessionstart' }],
  })
  hooks.UserPromptSubmit = ensureGroup(hooks.UserPromptSubmit ?? [], {
    hooks: [{ type: 'command', command: 'context-mode hook codex userpromptsubmit' }],
  })
  hooks.Stop = ensureGroup(hooks.Stop ?? [], {
    hooks: [{ type: 'command', command: 'context-mode hook codex stop' }],
  })
  hooks.PreCompact = ensureGroup(hooks.PreCompact ?? [], {
    hooks: [{ type: 'command', command: 'context-mode hook codex precompact' }],
  })
  hooks.PostCompact = ensureGroup(hooks.PostCompact ?? [], {
    hooks: [{ type: 'command', command: 'context-mode hook codex postcompact' }],
  })

  return {
    ...migrated,
    hooks,
  }
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
  currentMcp['agent-kit'] = {
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

function resolveOpenCodeAgentKitCommand(repoRoot: string, globalInstall = false): string[] {
  const repoLocalRoot = join(repoRoot, 'node_modules', '@webpresso', 'agent-kit')
  const entryPath = findAgentKitMcpEntry({ candidates: [repoLocalRoot] }) ?? findAgentKitMcpEntry()
  if (!entryPath) return globalInstall ? ['wp', 'mcp'] : ['vp', 'exec', 'wp', 'mcp']
  const launch = agentKitMcpLaunchCommand(entryPath)
  return [launch.command, ...launch.args]
}

function ensureCodexContextModeMcp(configPath: string, options: MergeOptions): MergeResult {
  if (options.dryRun) return { targetPath: configPath, action: 'skipped-dry' }
  const existed = existsSync(configPath)
  const existing = existed ? readFileSync(configPath, 'utf8') : ''
  const next = upsertContextModeMcpServer(existing)
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
): { installed: boolean; version: string } {
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
  }

  // Detect installed version for pin check
  const versionProbe = spawn('context-mode', ['--version'], { encoding: 'utf8' })
  const version = String(versionProbe.stdout ?? '').trim()

  spinner.succeed('context-mode ready')
  return { installed, version }
}

export function ensureContextMode(input: EnsureContextModeInput): EnsureContextModeResult {
  const spawn = input.spawn ?? spawnSync
  const spinner = (input.spinnerFactory ?? makeNoopSpinnerFactory())('context-mode')
  const { installed, version } = ensureContextModeBinary(spawn, spinner)

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

  const codexConfigPath = input.codexConfigPath ?? defaultCodexConfigPath()
  const codexHooksPath = input.codexHooksPath ?? defaultCodexHooksPath()
  const opencodeConfigPath = input.opencodeConfigPath ?? defaultOpenCodeConfigPath(input.repoRoot)

  return {
    codexMcp: ensureCodexContextModeMcp(codexConfigPath, input.options),
    codexHooks: patchJsonFile(codexHooksPath, patchCodexContextModeHooks, input.options),
    opencodeConfig: patchJsonFile(
      opencodeConfigPath,
      (existing) =>
        patchOpenCodeContextModeConfig(
          existing,
          resolveOpenCodeAgentKitCommand(input.repoRoot, input.globalInstall),
        ),
      input.options,
    ),
    installed,
  }
}
