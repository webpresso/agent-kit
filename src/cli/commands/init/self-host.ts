import { spawnSync } from 'node:child_process'
import { join, relative } from 'node:path'

import { runUnifiedSync, type UnifiedSyncMismatch } from '#symlinker/unified-sync'
import type { ConsumerContext } from './detect-consumer.js'
import { defaultConfig, readConfig } from './config.js'
import {
  GENERATED_PATHS_BLOCK,
  generatedPathspecs,
  patchGitignore,
  untrackGeneratedGitignoredPaths,
} from './gitignore-patcher.js'
import { type MergeOptions, type MergeResult } from './merge.js'
import { scaffoldAgentsMd } from './scaffold-agents-md.js'
import {
  scaffoldAgentHookRuntimeFiles,
  scaffoldAgentHooks,
} from './scaffolders/agent-hooks/index.js'
import { readHooksManifest, writeHooksManifest } from './scaffolders/agent-hooks/manifest.js'

export const SELF_HOST_PHASES = [
  'hook-contracts',
  'projections',
  'agents-md',
  'gitignore',
  'runtime-hooks',
  'all-safe',
] as const

export type SelfHostPhase = (typeof SELF_HOST_PHASES)[number]

type ConcreteSelfHostPhase = Exclude<SelfHostPhase, 'all-safe'>

const ALL_SAFE_PHASES: readonly ConcreteSelfHostPhase[] = [
  'hook-contracts',
  'projections',
  'agents-md',
  'gitignore',
  'runtime-hooks',
]

export interface SelfHostSetupFlags {
  readonly apply?: boolean
  readonly phase?: string
  readonly dryRun?: boolean
  readonly 'dry-run'?: boolean
  readonly overwrite?: boolean
  readonly cleanupGitignoredIndex?: boolean
  readonly 'cleanup-gitignored-index'?: boolean
}

export interface SelfHostSetupInput {
  readonly consumer: ConsumerContext
  readonly catalogDir: string
  readonly flags: SelfHostSetupFlags
}

export interface SelfHostDrift {
  readonly phase: ConcreteSelfHostPhase
  readonly path: string
  readonly reason: string
  readonly applyCommand: string
}

export type SelfHostSetupResult =
  | { readonly ok: true }
  | { readonly ok: false; readonly reason: string }

const PHASE_ALLOWLIST: Record<ConcreteSelfHostPhase, readonly string[]> = {
  'hook-contracts': ['.claude/settings.json', '.codex/hooks.json'],
  projections: [
    '.agent/',
    '.agents/',
    '.cursor/rules/',
    '.windsurf/skills/',
    '.claude/rules/',
    '.claude/skills/',
  ],
  'agents-md': ['AGENTS.md'],
  gitignore: ['.gitignore'],
  'runtime-hooks': ['.claude/hooks/', '.codex/managed-hooks/', '.webpresso/hooks-manifest.json'],
}

function isSelfHostPhase(value: string | undefined): value is SelfHostPhase {
  return value !== undefined && (SELF_HOST_PHASES as readonly string[]).includes(value)
}

function concretePhases(phase: SelfHostPhase): readonly ConcreteSelfHostPhase[] {
  return phase === 'all-safe' ? ALL_SAFE_PHASES : [phase]
}

function normalizeRelativePath(repoRoot: string, targetPath: string): string {
  const rel = relative(repoRoot, targetPath).replaceAll('\\', '/')
  return rel.length === 0 ? '.' : rel
}

function applyCommand(phase: ConcreteSelfHostPhase): string {
  return `wp setup --apply --phase ${phase}`
}

function mergeResultToDrift(
  repoRoot: string,
  phase: ConcreteSelfHostPhase,
  result: MergeResult,
): SelfHostDrift | null {
  switch (result.action) {
    case 'identical':
      return null
    case 'created':
      return {
        phase,
        path: normalizeRelativePath(repoRoot, result.targetPath),
        reason: 'missing managed file',
        applyCommand: applyCommand(phase),
      }
    case 'overwritten':
      return {
        phase,
        path: normalizeRelativePath(repoRoot, result.targetPath),
        reason: 'managed content updated',
        applyCommand: applyCommand(phase),
      }
    case 'drifted':
      return {
        phase,
        path: normalizeRelativePath(repoRoot, result.targetPath),
        reason: result.note ?? 'managed content drifted',
        applyCommand: applyCommand(phase),
      }
    case 'skipped-dry':
      return {
        phase,
        path: normalizeRelativePath(repoRoot, result.targetPath),
        reason: 'managed content would change',
        applyCommand: applyCommand(phase),
      }
  }
}

function syncMismatchToDrift(
  repoRoot: string,
  phase: ConcreteSelfHostPhase,
  mismatch: UnifiedSyncMismatch,
): SelfHostDrift {
  return {
    phase,
    path: normalizeRelativePath(repoRoot, mismatch.targetPath),
    reason: mismatch.reason,
    applyCommand: applyCommand(phase),
  }
}

function parseGitStatusPaths(stdout: string): string[] {
  const paths: string[] = []
  for (const line of stdout.split('\n')) {
    if (line.trim().length === 0) continue
    const payload = line.slice(3).trim()
    if (payload.includes(' -> ')) {
      paths.push(...payload.split(' -> ').map((part) => part.trim()))
    } else {
      paths.push(payload)
    }
  }
  return paths
}

function isPathAllowed(path: string, allowlist: readonly string[]): boolean {
  return allowlist.some((allowed) =>
    allowed.endsWith('/')
      ? path === allowed.slice(0, -1) || path.startsWith(allowed)
      : path === allowed,
  )
}

function cleanupRequested(flags: SelfHostSetupFlags): boolean {
  return flags.cleanupGitignoredIndex === true || flags['cleanup-gitignored-index'] === true
}

function allowlistFor(
  phases: readonly ConcreteSelfHostPhase[],
  flags: SelfHostSetupFlags = {},
): string[] {
  const allowlist = phases.flatMap((phase) => PHASE_ALLOWLIST[phase])
  if (phases.includes('gitignore') && cleanupRequested(flags)) {
    allowlist.push(...generatedPathspecs(GENERATED_PATHS_BLOCK))
  }
  return [...new Set(allowlist)]
}

export type DirtyAllowlistCheck =
  | { readonly ok: true; readonly dirtyPathsOutsideAllowlist: readonly string[] }
  | { readonly ok: false; readonly reason: string }

export function findDirtyPathsOutsideSelfHostAllowlist(
  repoRoot: string,
  phases: readonly ConcreteSelfHostPhase[],
  flags: SelfHostSetupFlags = {},
): DirtyAllowlistCheck {
  const status = spawnSync('git', ['status', '--porcelain=v1', '--untracked-files=all'], {
    cwd: repoRoot,
    encoding: 'utf8',
  })
  if (status.status !== 0) {
    const stderr = String(status.stderr ?? '').trim()
    return {
      ok: false,
      reason:
        'wp setup: refusing self-host apply; could not inspect git status for dirty-path allowlist' +
        (stderr.length > 0 ? `: ${stderr}` : '.'),
    }
  }
  const allowlist = allowlistFor(phases, flags)
  return {
    ok: true,
    dirtyPathsOutsideAllowlist: parseGitStatusPaths(String(status.stdout ?? '')).filter(
      (path) => !isPathAllowed(path, allowlist),
    ),
  }
}

async function runHookContractsPhase(
  repoRoot: string,
  options: MergeOptions,
): Promise<readonly MergeResult[]> {
  const result = await scaffoldAgentHooks({
    repoRoot,
    options,
    trustCodexHooks: false,
    includeRuntimeHookFiles: false,
    includeClaudeUserSettings: false,
  })
  return [result.claude, result.codex]
}

function runProjectionsPhase(
  repoRoot: string,
  catalogDir: string,
  check: boolean,
): readonly UnifiedSyncMismatch[] {
  const result = runUnifiedSync({
    catalogDir: join(catalogDir, 'agent'),
    consumerRoot: repoRoot,
    kinds: ['rule', 'skill'],
    check,
  })
  return result.mismatches
}

function runAgentsMdPhase(
  consumer: ConsumerContext,
  catalogDir: string,
  options: MergeOptions,
): MergeResult | null {
  return scaffoldAgentsMd({
    catalogDir,
    repoRoot: consumer.repoRoot,
    consumer,
    config: readConfig(consumer.repoRoot) ?? defaultConfig(),
    options,
  })
}

function runGitignorePhase(repoRoot: string, options: MergeOptions): MergeResult {
  return patchGitignore(join(repoRoot, '.gitignore'), GENERATED_PATHS_BLOCK, options)
}

function hasRuntimeDrift(
  repoRoot: string,
  results: readonly MergeResult[],
  relativeDirectory: string,
): boolean {
  const directory = join(repoRoot, relativeDirectory)
  return results.some(
    (result) =>
      result.action !== 'identical' &&
      (result.targetPath === directory || result.targetPath.startsWith(`${directory}/`)),
  )
}

function manifestMatchesGenerated(
  repoRoot: string,
  generated: ReturnType<typeof scaffoldAgentHookRuntimeFiles>['manifest'],
): boolean {
  const existing = readHooksManifest(repoRoot)
  if (existing === null) return false
  return (
    JSON.stringify(existing.claude) === JSON.stringify(generated.claude) &&
    JSON.stringify(existing.codex) === JSON.stringify(generated.codex) &&
    JSON.stringify(existing.vendorState) === JSON.stringify(generated.vendorState)
  )
}

function runRuntimeHooksPhase(repoRoot: string, options: MergeOptions): MergeResult[] {
  const { manifest, results } = scaffoldAgentHookRuntimeFiles({
    repoRoot,
    options,
    trustCodexHooks: false,
  })
  const manifestMatches = manifestMatchesGenerated(repoRoot, manifest)
  if (!options.dryRun) {
    writeHooksManifest(repoRoot, manifest.claude, manifest.codex, manifest.vendorState)
  }

  return [
    {
      targetPath: join(repoRoot, '.claude', 'hooks'),
      action: hasRuntimeDrift(repoRoot, results, '.claude/hooks') ? 'skipped-dry' : 'identical',
    },
    {
      targetPath: join(repoRoot, '.codex', 'managed-hooks'),
      action: hasRuntimeDrift(repoRoot, results, '.codex/managed-hooks')
        ? 'skipped-dry'
        : 'identical',
    },
    {
      targetPath: join(repoRoot, '.webpresso', 'hooks-manifest.json'),
      action: manifestMatches ? 'identical' : 'skipped-dry',
    },
  ]
}

async function collectPhaseDrift(
  input: SelfHostSetupInput,
  phase: ConcreteSelfHostPhase,
  apply: boolean,
): Promise<readonly SelfHostDrift[]> {
  const repoRoot = input.consumer.repoRoot
  const options: MergeOptions = {
    dryRun: !apply,
    overwrite: true,
  }

  if (phase === 'hook-contracts') {
    const results = await runHookContractsPhase(repoRoot, options)
    return results
      .map((result) => mergeResultToDrift(repoRoot, phase, result))
      .filter((drift): drift is SelfHostDrift => drift !== null)
  }

  if (phase === 'projections') {
    if (apply) {
      runProjectionsPhase(repoRoot, input.catalogDir, false)
      return []
    }
    return runProjectionsPhase(repoRoot, input.catalogDir, true).map((mismatch) =>
      syncMismatchToDrift(repoRoot, phase, mismatch),
    )
  }

  if (phase === 'agents-md') {
    const result = runAgentsMdPhase(input.consumer, input.catalogDir, options)
    const drift = result ? mergeResultToDrift(repoRoot, phase, result) : null
    return drift ? [drift] : []
  }

  if (phase === 'gitignore') {
    const result = runGitignorePhase(repoRoot, options)
    if (apply && cleanupRequested(input.flags)) {
      untrackGeneratedGitignoredPaths(repoRoot, GENERATED_PATHS_BLOCK, { dryRun: false })
    }
    const drift = mergeResultToDrift(repoRoot, phase, result)
    return drift ? [drift] : []
  }

  const results = runRuntimeHooksPhase(repoRoot, options)
  return apply
    ? []
    : results
        .map((result) => mergeResultToDrift(repoRoot, phase, result))
        .filter((drift): drift is SelfHostDrift => drift !== null)
}

function printDrift(repoRoot: string, apply: boolean, drifts: readonly SelfHostDrift[]): void {
  if (drifts.length === 0) {
    console.log(
      apply
        ? `wp setup: source repo self-host phase applied in ${repoRoot}.`
        : `wp setup: source repo self-host check clean in ${repoRoot}.`,
    )
    return
  }

  console.log(
    apply
      ? `wp setup: source repo self-host phase applied with ${drifts.length} change(s):`
      : `wp setup: source repo self-host drift detected (${drifts.length}):`,
  )
  for (const drift of drifts) {
    console.log(`  ${JSON.stringify(drift)}`)
  }
}

export async function runSelfHostSetup(input: SelfHostSetupInput): Promise<SelfHostSetupResult> {
  const apply = input.flags.apply === true
  const rawPhase = input.flags.phase ?? 'all-safe'

  if (!isSelfHostPhase(rawPhase)) {
    return {
      ok: false,
      reason: `wp setup: invalid --phase "${rawPhase}". Expected one of: ${SELF_HOST_PHASES.join(', ')}.`,
    }
  }

  if (input.flags.apply === true && input.flags.phase === undefined) {
    return {
      ok: false,
      reason: 'wp setup: --apply in @webpresso/agent-kit requires --phase <phase>.',
    }
  }

  const phases = concretePhases(rawPhase)
  if (apply) {
    const dirtyCheck = findDirtyPathsOutsideSelfHostAllowlist(
      input.consumer.repoRoot,
      phases,
      input.flags,
    )
    if (!dirtyCheck.ok) {
      return { ok: false, reason: dirtyCheck.reason }
    }
    const dirtyOutsideAllowlist = dirtyCheck.dirtyPathsOutsideAllowlist
    if (dirtyOutsideAllowlist.length > 0) {
      return {
        ok: false,
        reason:
          `wp setup: refusing self-host apply; dirty paths outside the selected phase allowlist: ` +
          dirtyOutsideAllowlist.join(', '),
      }
    }
  }

  const drifts: SelfHostDrift[] = []
  for (const phase of phases) {
    drifts.push(...(await collectPhaseDrift(input, phase, apply)))
  }
  printDrift(input.consumer.repoRoot, apply, drifts)
  return { ok: true }
}
