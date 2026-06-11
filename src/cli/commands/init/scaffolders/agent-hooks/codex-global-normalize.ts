import {
  accessSync,
  constants,
  existsSync,
  mkdirSync,
  readdirSync,
  readFileSync,
  statSync,
  writeFileSync,
} from 'node:fs'
import { homedir } from 'node:os'
import { basename, delimiter, dirname, join } from 'node:path'

import type { MergeOptions, MergeResult } from '#cli/commands/init/merge'
import { stripSingleShellQuotePair } from './shell-identity.js'

type HookEntry = { type?: string; command?: string; timeout?: number }
type HookGroup = { matcher?: string; hooks?: HookEntry[] }
type HooksMap = Record<string, HookGroup[]>

type CodexHooksFile = {
  hooks?: HooksMap
  state?: Record<string, unknown>
}

export interface NormalizeGlobalCodexHooksOptions {
  readonly contextModeBinary?: string | null
  readonly nodeBinary?: string | null
  readonly omxScriptPath?: string | null
}

export const MANAGED_GLOBAL_CODEX_HOOK_DIRNAME = 'managed-hooks'
export const MANAGED_OMX_GLOBAL_HOOK_BASENAME = 'wp-global-codex-omx-hook.sh'

export const MANAGED_CONTEXT_MODE_GLOBAL_HOOK_BASENAMES = [
  'wp-global-codex-context-mode-sessionstart.sh',
  'wp-global-codex-context-mode-pretooluse.sh',
  'wp-global-codex-context-mode-posttooluse.sh',
  'wp-global-codex-context-mode-userpromptsubmit.sh',
  'wp-global-codex-context-mode-stop.sh',
  'wp-global-codex-context-mode-precompact.sh',
  'wp-global-codex-context-mode-postcompact.sh',
] as const

const MANAGED_CONTEXT_MODE_GLOBAL_HOOK_BASENAME_SET = new Set<string>(
  MANAGED_CONTEXT_MODE_GLOBAL_HOOK_BASENAMES,
)

const CONTEXT_MODE_CODEX_EVENTS = [
  { event: 'SessionStart', subcommand: 'sessionstart' },
  { event: 'PreToolUse', subcommand: 'pretooluse' },
  { event: 'PostToolUse', subcommand: 'posttooluse' },
  { event: 'UserPromptSubmit', subcommand: 'userpromptsubmit' },
  { event: 'Stop', subcommand: 'stop' },
  { event: 'PreCompact', subcommand: 'precompact' },
  { event: 'PostCompact', subcommand: 'postcompact' },
] as const

type LauncherFile = {
  readonly path: string
  readonly content: string
}

const CODEX_JSON_PASSTHROUGH = `printf '%s\\n' '{}'`

export function resolveBinaryOnPath(
  command: string,
  pathValue: string = process.env.PATH ?? '',
  platformValue: NodeJS.Platform = process.platform,
): string | null {
  if (command.trim() === '') return null
  const pathEntries = pathValue.split(delimiter).filter((entry) => entry.length > 0)
  const candidateNames =
    platformValue === 'win32'
      ? [command, `${command}.exe`, `${command}.cmd`, `${command}.bat`]
      : [command]

  for (const entry of pathEntries) {
    for (const name of candidateNames) {
      const candidate = join(entry, name)
      if (!existsSync(candidate)) continue
      try {
        const stat = statSync(candidate)
        if (!stat.isFile()) continue
        if (platformValue !== 'win32') accessSync(candidate, constants.X_OK)
        return candidate
      } catch {
        continue
      }
    }
  }

  return null
}

export function resolveInstalledOmxHookScriptPath(
  homeDir: string = process.env.HOME || homedir(),
): string | null {
  const stableCandidates = [
    join(
      homeDir,
      '.vite-plus',
      'packages',
      'oh-my-codex',
      'lib',
      'node_modules',
      'oh-my-codex',
      'dist',
      'scripts',
      'codex-native-hook.js',
    ),
    join(
      homeDir,
      '.bun',
      'install',
      'global',
      'node_modules',
      'oh-my-codex',
      'dist',
      'scripts',
      'codex-native-hook.js',
    ),
  ]
  for (const candidate of stableCandidates) {
    if (existsSync(candidate)) return candidate
  }

  const legacyRoot = join(homeDir, '.vite-plus', 'js_runtime', 'node')
  if (!existsSync(legacyRoot)) return null

  const versions = readdirSync(legacyRoot, { withFileTypes: true })
    .filter((entry) => entry.isDirectory())
    .map((entry) => entry.name)
    .sort((left, right) => right.localeCompare(left, undefined, { numeric: true }))

  for (const version of versions) {
    const candidate = join(
      legacyRoot,
      version,
      'lib',
      'node_modules',
      'oh-my-codex',
      'dist',
      'scripts',
      'codex-native-hook.js',
    )
    if (existsSync(candidate)) return candidate
  }

  return null
}

export function normalizeGlobalCodexHooksJson(
  raw: Record<string, unknown>,
  options: NormalizeGlobalCodexHooksOptions,
  managedHooksDir?: string,
): { readonly changed: boolean; readonly value: Record<string, unknown> } {
  const hooks = raw.hooks
  if (!hooks || typeof hooks !== 'object' || Array.isArray(hooks)) {
    return { changed: false, value: raw }
  }

  let changed = false
  const nextHooks: HooksMap = {}

  for (const [event, groups] of Object.entries(hooks as HooksMap)) {
    const seen = new Set<string>()
    const deduped: HookGroup[] = []

    for (const group of groups ?? []) {
      const normalizedHooks = (group.hooks ?? []).map((hook) => {
        const nextCommand = normalizeGlobalCodexHookCommand(hook.command, options, managedHooksDir)
        if (nextCommand !== hook.command) changed = true
        return nextCommand === hook.command ? hook : { ...hook, command: nextCommand }
      })

      const normalizedGroup: HookGroup = {
        ...group,
        ...(normalizedHooks.length > 0 ? { hooks: normalizedHooks } : {}),
      }

      const key = stableHookGroupKey(normalizedGroup)
      if (seen.has(key)) {
        changed = true
        continue
      }
      seen.add(key)
      deduped.push(normalizedGroup)
    }

    nextHooks[event] = deduped
  }

  if (!changed) return { changed: false, value: raw }
  return { changed: true, value: { ...raw, hooks: nextHooks } }
}

function seedContextModeHooksFile(hooksPath: string, contextModeBinary: string): void {
  const managedHooksDir = defaultManagedCodexHooksDir(hooksPath)
  const hooks: HooksMap = {}
  const launchers: LauncherFile[] = []

  for (const { event, subcommand } of CONTEXT_MODE_CODEX_EVENTS) {
    const scriptPath = join(managedHooksDir, contextModeLauncherBasename(subcommand))
    hooks[event] = [{ hooks: [{ type: 'command', command: quoteShell(scriptPath) }] }]
    launchers.push({
      path: scriptPath,
      content: renderShellLauncher([
        quoteShell(contextModeBinary),
        'hook',
        'codex',
        subcommand,
        '"$@"',
      ]),
    })
  }

  writeManagedGlobalCodexLaunchers(launchers)
  mkdirSync(dirname(hooksPath), { recursive: true })
  writeFileSync(hooksPath, `${JSON.stringify({ hooks }, null, 2)}\n`, 'utf8')
}

export function normalizeGlobalCodexHooksFile(
  hooksPath: string,
  options: NormalizeGlobalCodexHooksOptions,
  mergeOptions: MergeOptions = {},
): MergeResult {
  if (mergeOptions.dryRun) return { targetPath: hooksPath, action: 'skipped-dry' }
  if (!existsSync(hooksPath)) {
    if (!options.contextModeBinary) return { targetPath: hooksPath, action: 'identical' }
    seedContextModeHooksFile(hooksPath, options.contextModeBinary)
    return { targetPath: hooksPath, action: 'created' }
  }

  const existing = readFileSync(hooksPath, 'utf8')
  const parsed = JSON.parse(existing) as CodexHooksFile
  const managedHooksDir = defaultManagedCodexHooksDir(hooksPath)
  const launchers = collectManagedGlobalCodexLaunchers(
    parsed as Record<string, unknown>,
    options,
    managedHooksDir,
  )
  const normalized = normalizeGlobalCodexHooksJson(
    parsed as Record<string, unknown>,
    options,
    managedHooksDir,
  )
  const launcherChanged = writeManagedGlobalCodexLaunchers(launchers)
  if (!normalized.changed && !launcherChanged) return { targetPath: hooksPath, action: 'identical' }

  if (normalized.changed) {
    writeFileSync(hooksPath, `${JSON.stringify(normalized.value, null, 2)}\n`, 'utf8')
  }
  return {
    targetPath: hooksPath,
    action: normalized.changed ? 'overwritten' : launcherChanged ? 'overwritten' : 'identical',
  }
}

function normalizeGlobalCodexHookCommand(
  command: string | undefined,
  options: NormalizeGlobalCodexHooksOptions,
  managedHooksDir?: string,
): string | undefined {
  if (typeof command !== 'string') return command
  const trimmed = command.trim()

  const managedContextModePath =
    managedHooksDir && options.contextModeBinary
      ? contextModeManagedLauncherPath(trimmed, managedHooksDir)
      : null
  if (managedContextModePath) {
    return quoteShell(managedContextModePath)
  }
  if (options.contextModeBinary && /^context-mode\s+hook\s+codex\b/u.test(trimmed)) {
    return `${quoteShell(options.contextModeBinary)}${trimmed.slice('context-mode'.length)}`
  }

  if (managedHooksDir && options.nodeBinary) {
    const managedOmxPath = omxManagedLauncherPath(trimmed, managedHooksDir)
    if (managedOmxPath) return quoteShell(managedOmxPath)
  }
  if (
    options.nodeBinary &&
    /^node\s+/u.test(trimmed) &&
    /codex-native-hook(?:\.js)?/u.test(trimmed)
  ) {
    return `${quoteShell(options.nodeBinary)}${trimmed.slice('node'.length)}`
  }

  return command
}

function stableHookGroupKey(group: HookGroup): string {
  return JSON.stringify({
    matcher: group.matcher ?? '',
    hooks: (group.hooks ?? []).map((hook) => ({
      type: hook.type ?? '',
      command: typeof hook.command === 'string' ? hook.command.trim() : '',
      timeout: hook.timeout ?? null,
    })),
  })
}

function quoteShell(value: string): string {
  return JSON.stringify(value)
}

export function defaultCodexHooksPathFromConfig(configPath: string): string {
  return join(dirname(configPath), 'hooks.json')
}

export function defaultManagedCodexHooksDir(hooksPath: string): string {
  return join(dirname(hooksPath), MANAGED_GLOBAL_CODEX_HOOK_DIRNAME)
}

function collectManagedGlobalCodexLaunchers(
  raw: Record<string, unknown>,
  options: NormalizeGlobalCodexHooksOptions,
  managedHooksDir: string,
): readonly LauncherFile[] {
  const hooks = raw.hooks
  if (!hooks || typeof hooks !== 'object' || Array.isArray(hooks)) return []

  const launchers = new Map<string, LauncherFile>()
  for (const groups of Object.values(hooks as HooksMap)) {
    for (const group of groups ?? []) {
      for (const hook of group.hooks ?? []) {
        const command = typeof hook.command === 'string' ? hook.command.trim() : ''
        if (command.length === 0) continue
        const launcher = launcherForCommand(command, options, managedHooksDir)
        if (launcher) launchers.set(launcher.path, launcher)
      }
    }
  }
  return [...launchers.values()]
}

function writeManagedGlobalCodexLaunchers(launchers: readonly LauncherFile[]): boolean {
  let changed = false
  for (const launcher of launchers) {
    const existing = existsSync(launcher.path) ? readFileSync(launcher.path, 'utf8') : null
    if (existing === launcher.content) continue
    mkdirSync(dirname(launcher.path), { recursive: true })
    writeFileSync(launcher.path, launcher.content, { mode: 0o755 })
    changed = true
  }
  return changed
}

function launcherForCommand(
  command: string,
  options: NormalizeGlobalCodexHooksOptions,
  managedHooksDir: string,
): LauncherFile | null {
  const contextModeSpec = parseContextModeHookCommand(command)
  if (contextModeSpec && options.contextModeBinary) {
    const path = join(managedHooksDir, contextModeLauncherBasename(contextModeSpec.subcommand))
    return {
      path,
      content: renderShellLauncher([
        quoteShell(options.contextModeBinary),
        'hook',
        'codex',
        contextModeSpec.subcommand,
        '"$@"',
      ]),
    }
  }

  const managedLauncherBasename = extractManagedLauncherBasename(command)
  if (
    managedLauncherBasename === MANAGED_OMX_GLOBAL_HOOK_BASENAME &&
    options.nodeBinary &&
    options.omxScriptPath
  ) {
    const path = join(managedHooksDir, MANAGED_OMX_GLOBAL_HOOK_BASENAME)
    return {
      path,
      content: renderOmxShellLauncher(options.nodeBinary, options.omxScriptPath, []),
    }
  }

  const omxSpec = parseOmxHookCommand(command)
  if (omxSpec && options.nodeBinary) {
    const path = join(managedHooksDir, MANAGED_OMX_GLOBAL_HOOK_BASENAME)
    return {
      path,
      content: renderOmxShellLauncher(options.nodeBinary, omxSpec.scriptPath, omxSpec.trailingArgs),
    }
  }

  return null
}

function renderShellLauncher(parts: readonly string[]): string {
  return `#!/bin/sh\nexec ${parts.join(' ')}\n`
}

function renderOmxShellLauncher(
  nodeBinary: string,
  hookScriptPath: string,
  trailingArgs: readonly string[],
): string {
  const trailingArgsText =
    trailingArgs.length > 0 ? `${trailingArgs.map(quoteShell).join(' ')} "$@"` : '"$@"'

  return `#!/bin/sh
NODE_BINARY=${quoteShell(nodeBinary)}
HOOK_SCRIPT=${quoteShell(hookScriptPath)}

if [ ! -x "$NODE_BINARY" ]; then
  NODE_BINARY="$(command -v node 2>/dev/null || true)"
fi

if [ -z "$NODE_BINARY" ] || [ ! -x "$NODE_BINARY" ]; then
  echo "OMX Codex hook skipped: node runtime not found; rerun omx setup or wp setup" >&2
  ${CODEX_JSON_PASSTHROUGH}
  exit 0
fi

if [ ! -f "$HOOK_SCRIPT" ]; then
  echo "OMX Codex hook skipped: hook script not found; rerun omx setup or wp setup" >&2
  ${CODEX_JSON_PASSTHROUGH}
  exit 0
fi

exec "$NODE_BINARY" "$HOOK_SCRIPT" ${trailingArgsText}
`
}

function contextModeManagedLauncherPath(command: string, managedHooksDir: string): string | null {
  const parsed = parseContextModeHookCommand(command)
  if (!parsed) return null
  return join(managedHooksDir, contextModeLauncherBasename(parsed.subcommand))
}

function omxManagedLauncherPath(command: string, managedHooksDir: string): string | null {
  if (parseOmxHookCommand(command) === null) return null
  return join(managedHooksDir, MANAGED_OMX_GLOBAL_HOOK_BASENAME)
}

function contextModeLauncherBasename(subcommand: string): string {
  return `wp-global-codex-context-mode-${subcommand}.sh`
}

function parseContextModeHookCommand(command: string): { readonly subcommand: string } | null {
  const trimmed = stripSingleShellQuotePair(command.trim())
  const match = /^context-mode\s+hook\s+codex\s+([\w-]+)$/u.exec(trimmed)
  if (!match?.[1]) return null
  return { subcommand: match[1] }
}

function parseOmxHookCommand(
  command: string,
): { readonly scriptPath: string; readonly trailingArgs: readonly string[] } | null {
  const trimmed = command.trim()
  const match = /^node\s+"?([^"\s]+codex-native-hook(?:\.js)?)"?\s*(.*)$/u.exec(trimmed)
  if (!match?.[1]) return null
  const trailingArgs = match[2]?.trim().length ? match[2].trim().split(/\s+/u) : []
  return { scriptPath: match[1], trailingArgs }
}

export function isManagedContextModeGlobalLauncherBasename(basenameValue: string): boolean {
  return MANAGED_CONTEXT_MODE_GLOBAL_HOOK_BASENAME_SET.has(basenameValue)
}

export function isManagedOmxGlobalLauncherBasename(basenameValue: string): boolean {
  return basenameValue === MANAGED_OMX_GLOBAL_HOOK_BASENAME
}

export function extractManagedLauncherBasename(command: string): string | null {
  const trimmed = stripSingleShellQuotePair(command.trim())
  const match = /^["']?([^"']+\.sh)["']?$/u.exec(trimmed)
  if (match?.[1]) return basename(match[1])
  return null
}
