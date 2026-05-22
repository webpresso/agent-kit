/**
 * `omx` scaffolder preset.
 *
 * Ensures `omx` is installed, then chains `omx setup --yes --scope user` after the
 * agent-kit scaffold completes. OMX (oh-my-codex) is the operator-workflow
 * execution layer; it manages its own scaffolding idempotently.
 *
 * Required when downstream features rely on `omx team` (see
 * `cli/commands/blueprint/execution.ts`).
 */
import { spawnSync } from 'node:child_process'
import { existsSync, mkdirSync, readFileSync, rmdirSync, rmSync, writeFileSync } from 'node:fs'
import { homedir } from 'node:os'
import { dirname, join, resolve, sep } from 'node:path'

import type { MergeOptions } from '#cli/commands/init/merge'

export interface EnsureOmxInput {
  repoRoot: string
  options: MergeOptions
  scope?: OmxSetupScope
  /** Dependency-injection seam for tests; defaults to node's child_process.spawnSync. */
  spawn?: typeof spawnSync
  /** Test seam — override `$CODEX_HOME/config.toml` or `~/.codex/config.toml`. */
  configPath?: string
}

export type EnsureOmxResult =
  | { kind: 'omx-ok'; installed: boolean; removedProjectFiles: string[] }
  | { kind: 'omx-skipped-dry-run' }
  | { kind: 'omx-not-found'; hint: string }
  | { kind: 'omx-spawn-failed'; exitCode: number }

const NOT_FOUND_HINT =
  'omx (oh-my-codex) is not on PATH after `vp install -g oh-my-codex`. Install it manually and re-run.'
type OmxSetupScope = 'user' | 'project'
type Spawn = typeof spawnSync

function defaultCodexConfigPath(): string {
  const codexHome = process.env.CODEX_HOME || join(process.env.HOME || homedir(), '.codex')
  return join(codexHome, 'config.toml')
}

/** Matches any `[hooks.state."<key>"]` TOML section header written by OMX. */
const HOOK_STATE_SECTION_RE = /^\[hooks\.state\.".+"\]$/

/**
 * Removes ALL hook trust state blocks when duplicate `[hooks.state."..."]` keys
 * are detected.
 *
 * The TOML spec forbids duplicate keys; Codex CLI rejects the config outright.
 * Older OMX versions wrote blocks terminated by `# End OMX-owned Codex hook
 * trust state` but without a leading start marker. OMX's own
 * `stripManagedCodexHookTrustState` only strips START→END bounded blocks, so
 * legacy entries accumulate on every `ak setup` run.
 *
 * Detection contract: count unique vs total `[hooks.state."..."]` section
 * headers. If any key appears more than once the file is TOML-invalid. When
 * duplicates exist we strip all hook trust content (entries + OMX block marker
 * comments) so `omx setup --yes --scope user` can rewrite exactly one clean managed block.
 */
export function deduplicateCodexHookTrustState(config: string): string {
  const allKeys = [...config.matchAll(/^\[hooks\.state\.".+"\]$/gm)].map((m) => m[0])
  if (allKeys.length === new Set(allKeys).size) return config

  const lines = config.split(/\r?\n/)
  const kept: string[] = []
  let i = 0
  while (i < lines.length) {
    const trimmed = lines[i]!.trim()
    if (HOOK_STATE_SECTION_RE.test(trimmed)) {
      i += 1
      if (i < lines.length && /^trusted_hash\s*=/.test(lines[i]?.trim() ?? '')) {
        i += 1
      }
      continue
    }
    // Strip OMX block-marker comment lines by prefix — resilient to minor wording changes.
    if (
      trimmed.startsWith('# OMX-owned Codex hook trust state') ||
      trimmed.startsWith('# End OMX-owned Codex hook trust state') ||
      trimmed === '# Trusts only setup-managed codex-native-hook.js wrappers.'
    ) {
      i += 1
      continue
    }
    kept.push(lines[i]!)
    i += 1
  }
  return (
    kept
      .join('\n')
      .replace(/\n{3,}/g, '\n\n')
      .trimEnd() + '\n'
  )
}

export function migrateDeprecatedCodexHooksFeatureFlag(raw: string): string {
  const lines = raw.split(/\r?\n/)
  const featuresStart = lines.findIndex((line) => /^\s*\[features\]\s*$/.test(line))
  if (featuresStart < 0) return raw

  let sectionEnd = lines.length
  for (let i = featuresStart + 1; i < lines.length; i += 1) {
    if (/^\s*\[\[?[^\]]+\]?\]\s*$/.test(lines[i]!)) {
      sectionEnd = i
      break
    }
  }

  let hooksIdx = -1
  let codexHooksIdx = -1
  let codexHooksValue = 'true'
  let codexHooksIndent = ''

  for (let i = featuresStart + 1; i < sectionEnd; i += 1) {
    const line = lines[i]!
    if (/^\s*hooks\s*=/.test(line)) {
      hooksIdx = i
      continue
    }

    const match = line.match(/^(\s*)codex_hooks\s*=\s*(.+)$/)
    if (!match) continue
    codexHooksIdx = i
    codexHooksIndent = match[1] ?? ''
    codexHooksValue = match[2] ?? 'true'
  }

  if (codexHooksIdx < 0) return raw

  const replacement = `${codexHooksIndent}hooks = ${codexHooksValue}`

  if (hooksIdx >= 0) {
    const nextLines = [...lines]
    nextLines[hooksIdx] = replacement
    return nextLines
      .filter((line, idx) => idx === hooksIdx || !/^\s*codex_hooks\s*=/.test(line))
      .join('\n')
  }

  return lines
    .flatMap((line, idx) => {
      if (idx === codexHooksIdx) return [replacement]
      if (/^\s*codex_hooks\s*=/.test(line)) return []
      return [line]
    })
    .join('\n')
}

function migrateDeprecatedCodexHooksFeatureFlagInConfig(configPath: string): void {
  if (!existsSync(configPath)) return

  const existing = readFileSync(configPath, 'utf8')
  const next = migrateDeprecatedCodexHooksFeatureFlag(existing)
  if (next === existing) return

  mkdirSync(dirname(configPath), { recursive: true })
  writeFileSync(configPath, next, 'utf8')
}

function readPersistedOmxSetupScope(repoRoot: string): OmxSetupScope | undefined {
  const scopePath = join(repoRoot, '.omx', 'setup-scope.json')
  if (!existsSync(scopePath)) return undefined

  const parsed = JSON.parse(readFileSync(scopePath, 'utf8')) as { scope?: unknown }
  if (parsed.scope === 'project' || parsed.scope === 'project-local') return 'project'
  if (parsed.scope === 'user') return 'user'
  return undefined
}

function removeTrackedProjectScopedOmxFiles(repoRoot: string, spawn: Spawn): string[] {
  const listed = spawn('git', ['ls-files', '-z', '--', '.codex', '.omx'], {
    cwd: repoRoot,
    encoding: 'utf8',
  })

  if (listed.error) {
    throw new Error(`could not list tracked OMX project files: ${listed.error.message}`)
  }
  if (listed.status !== 0) {
    throw new Error(`could not list tracked OMX project files: git exited ${listed.status ?? -1}`)
  }

  const files = decodeSpawnStdout(listed.stdout).split('\0').filter(isProjectScopedOmxPath)
  for (const file of files) {
    rmSync(resolveSafeRepoPath(repoRoot, file), { force: true })
    pruneEmptyProjectScopedDirs(repoRoot, file)
  }
  return files
}

function decodeSpawnStdout(stdout: string | Buffer | null | undefined): string {
  if (typeof stdout === 'string') return stdout
  if (Buffer.isBuffer(stdout)) return stdout.toString('utf8')
  return ''
}

function isProjectScopedOmxPath(path: string): boolean {
  return (
    path === '.codex' || path.startsWith('.codex/') || path === '.omx' || path.startsWith('.omx/')
  )
}

function resolveSafeRepoPath(repoRoot: string, relativePath: string): string {
  const root = resolve(repoRoot)
  const absolute = resolve(root, relativePath)
  if (absolute === root || !absolute.startsWith(`${root}${sep}`)) {
    throw new Error(`refusing to remove path outside repo: ${relativePath}`)
  }
  return absolute
}

function pruneEmptyProjectScopedDirs(repoRoot: string, relativeFile: string): void {
  let dir = dirname(relativeFile)
  while (isProjectScopedOmxPath(dir)) {
    try {
      rmdirSync(resolveSafeRepoPath(repoRoot, dir))
    } catch {
      return
    }
    if (dir === '.codex' || dir === '.omx') return
    dir = dirname(dir)
  }
}

/**
 * Ensure `omx` is on PATH then run `omx setup --yes --scope user` in the consumer repo.
 * Idempotent: safe to run on every `ak setup`.
 */
export function ensureOmx(input: EnsureOmxInput): EnsureOmxResult {
  if (input.options.dryRun) return { kind: 'omx-skipped-dry-run' }

  const spawn = input.spawn ?? spawnSync
  const configPath = input.configPath ?? defaultCodexConfigPath()
  const scope = input.scope ?? 'user'
  const previousScope = readPersistedOmxSetupScope(input.repoRoot)

  // Pre-repair: remove legacy duplicate hook trust blocks before omx setup runs.
  if (existsSync(configPath)) {
    const existing = readFileSync(configPath, 'utf8')
    const repaired = deduplicateCodexHookTrustState(existing)
    if (repaired !== existing) {
      mkdirSync(dirname(configPath), { recursive: true })
      writeFileSync(configPath, repaired, 'utf8')
    }
  }

  let installed = false
  let probe = spawn('omx', ['--version'], { encoding: 'utf8' })
  if (probe.error || (probe.status !== null && probe.status !== 0)) {
    const install = spawn('vp', ['install', '-g', 'oh-my-codex'], { stdio: 'inherit' })
    if (install.status !== 0) {
      return { kind: 'omx-not-found', hint: NOT_FOUND_HINT }
    }

    installed = true
    probe = spawn('omx', ['--version'], { encoding: 'utf8' })
    if (probe.error || (probe.status !== null && probe.status !== 0)) {
      return { kind: 'omx-not-found', hint: NOT_FOUND_HINT }
    }
  }

  const result = spawn('omx', ['setup', '--yes', '--scope', scope], {
    cwd: input.repoRoot,
    stdio: ['ignore', 'inherit', 'inherit'],
  })

  if (result.status !== 0) {
    return { kind: 'omx-spawn-failed', exitCode: result.status ?? -1 }
  }

  migrateDeprecatedCodexHooksFeatureFlagInConfig(configPath)
  const removedProjectFiles =
    scope === 'user' && previousScope === 'project'
      ? removeTrackedProjectScopedOmxFiles(input.repoRoot, spawn)
      : []

  return { kind: 'omx-ok', installed, removedProjectFiles }
}
