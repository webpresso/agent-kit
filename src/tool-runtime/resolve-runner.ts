import { existsSync, realpathSync } from 'node:fs'
import { basename, dirname, resolve } from 'node:path'
import { createRequire } from 'node:module'
import { spawnSync } from 'node:child_process'

import { pathCandidates } from '#runtime/command-exists.js'
import { readTrustedJsonFile } from '#shared-utils/read-json-file.js'

export interface ManagedRunnerResolution {
  readonly tool: string
  readonly command: string
  readonly args: readonly string[]
  readonly source: 'managed' | 'fallback'
}

export type ManagedRunnerOutputPolicy = 'rtk-filtered' | 'structured'

export interface ResolveRunnerOptions {
  readonly fallbackCommand?: string
  readonly fallbackArgs?: readonly string[]
  readonly nodeExecPath?: string
  /** @deprecated Use {@link outputPolicy} for explicit output routing. */
  readonly filterOutput?: boolean
  readonly outputPolicy?: ManagedRunnerOutputPolicy
}

type ManagedToolSpec =
  | { readonly command: string; readonly args: readonly string[] }
  | {
      readonly packageName: string
      readonly binName: string
      readonly fallbackArgs?: readonly string[]
      readonly runWithNode?: boolean
    }

const require = createRequire(import.meta.url)

const MANAGED_TOOL_PREFIX: Readonly<Record<string, ManagedToolSpec>> = {
  oxfmt: { packageName: 'oxfmt', binName: 'oxfmt' },
  oxlint: { packageName: 'oxlint', binName: 'oxlint' },
  playwright: { packageName: '@playwright/test', binName: 'playwright' },
  stryker: { packageName: '@stryker-mutator/core', binName: 'stryker' },
  tsc: { packageName: 'typescript', binName: 'tsc' },
  tsx: { packageName: 'tsx', binName: 'tsx' },
  vite: { packageName: 'vite', binName: 'vite' },
  vitest: { packageName: 'vitest', binName: 'vitest' },
  vp: { packageName: 'vite-plus', binName: 'vp', fallbackArgs: [], runWithNode: true },
  wrangler: { packageName: 'wrangler', binName: 'wrangler' },
}

let rtkAvailable: boolean | null = null

// The real token-killer `rtk` exposes a `gain` analytics subcommand (see
// RTK.md); the unrelated `reachingforthejack/rtk` (Rust Type Kit) collision
// binary does not. Probe that capability instead of `--version`, which *any*
// `rtk` on PATH answers with exit 0 — trusting it would route wrapped commands
// (typecheck/qa/test gates) through a foreign binary that may mangle args or
// drop the wrapped exit code, masking a failing gate as green.
const RTK_CAPABILITY_ARGS = ['gain', '--help'] as const
// Measured cold cost of `rtk gain --help` is ~11ms; 3s is generous headroom.
// A probe that exceeds it is a broken or wrong binary, so degrade to unfiltered
// output rather than let a hung `rtk` stall every wrapped command (per
// no-timeout-as-fix: the bound surfaces the fault, it does not silence it).
const RTK_PROBE_TIMEOUT_MS = 3000

function probeRtkAvailability(): boolean {
  if (rtkAvailable !== null) return rtkAvailable
  try {
    const result = spawnSync('rtk', RTK_CAPABILITY_ARGS, {
      encoding: 'utf8',
      windowsHide: true,
      timeout: RTK_PROBE_TIMEOUT_MS,
    })
    // A timeout yields status === null (+ signal), so the strict === 0 check
    // already degrades on hang without a separate branch.
    rtkAvailable = result.status === 0
  } catch {
    rtkAvailable = false
  }
  return rtkAvailable
}

export function setRtkAvailabilityProbeForTest(value: boolean | null): void {
  rtkAvailable = value
}

export function resolveOutputPolicy(
  outputPolicy: ManagedRunnerOutputPolicy | undefined,
  filterOutput: boolean | undefined,
): ManagedRunnerOutputPolicy {
  return outputPolicy ?? (filterOutput === false ? 'structured' : 'rtk-filtered')
}

function withOptionalRtk(
  resolution: ManagedRunnerResolution,
  outputPolicy: ManagedRunnerOutputPolicy,
): ManagedRunnerResolution {
  if (outputPolicy !== 'rtk-filtered') return resolution
  if (!probeRtkAvailability()) return resolution
  return {
    ...resolution,
    command: 'rtk',
    args: [resolution.command, ...resolution.args],
  }
}

export function resolveRunner(
  tool: string,
  options: ResolveRunnerOptions = {},
): ManagedRunnerResolution {
  const normalized = tool.trim()
  if (!normalized) {
    throw new Error('tool runtime resolution requires a non-empty tool name')
  }

  const outputPolicy = resolveOutputPolicy(options.outputPolicy, options.filterOutput)
  const managed = MANAGED_TOOL_PREFIX[normalized]
  if (managed) {
    return withOptionalRtk(resolveManagedTool(normalized, managed, options), outputPolicy)
  }

  if (options.fallbackCommand) {
    return withOptionalRtk(
      {
        tool: normalized,
        command: options.fallbackCommand,
        args: [...(options.fallbackArgs ?? [])],
        source: 'fallback',
      },
      outputPolicy,
    )
  }

  throw new Error(`No managed runtime runner is defined for tool "${normalized}"`)
}

function resolveManagedTool(
  tool: string,
  spec: ManagedToolSpec,
  options: Pick<ResolveRunnerOptions, 'nodeExecPath'> = {},
): ManagedRunnerResolution {
  if ('command' in spec) {
    return { tool, command: spec.command, args: [...spec.args], source: 'managed' }
  }

  const binPath = resolvePackageBin(spec.packageName, spec.binName)
  if (binPath) {
    if (spec.runWithNode) {
      return {
        tool,
        command: options.nodeExecPath ?? resolveNodeExecutablePath(),
        args: [binPath, ...(spec.fallbackArgs ?? [])],
        source: 'managed',
      }
    }
    return { tool, command: binPath, args: [...(spec.fallbackArgs ?? [])], source: 'managed' }
  }

  if (tool !== 'vp') {
    const vpSpec = MANAGED_TOOL_PREFIX.vp
    if (vpSpec === undefined) {
      return { tool, command: 'vp', args: ['exec', spec.binName], source: 'fallback' }
    }
    const vp = resolveManagedTool('vp', vpSpec, options)
    return {
      tool,
      command: vp.command,
      args: [...vp.args, 'exec', spec.binName],
      source: 'fallback',
    }
  }

  return { tool, command: 'vp', args: [], source: 'fallback' }
}

function resolveNodeExecutablePath(): string {
  const current = basename(process.execPath).toLowerCase()
  if (current === 'node' || current === 'node.exe') return process.execPath

  for (const candidate of pathCandidates('node')) {
    try {
      const real = realpathSync(candidate)
      const realBase = basename(real).toLowerCase()
      if (realBase === 'node' || realBase === 'node.exe') return real
    } catch {
      // Ignore broken PATH entries and continue to the next candidate.
    }
  }

  return 'node'
}

function resolvePackageBin(packageName: string, binName: string): string | null {
  try {
    const packageJsonPath = require.resolve(`${packageName}/package.json`)
    const packageJson = readTrustedJsonFile<{
      bin?: string | Record<string, string>
    }>(packageJsonPath)
    const relativeBin =
      typeof packageJson.bin === 'string' ? packageJson.bin : packageJson.bin?.[binName]
    if (!relativeBin) return null
    const absoluteBin = resolve(dirname(packageJsonPath), relativeBin)
    return existsSync(absoluteBin) ? absoluteBin : null
  } catch {
    return null
  }
}
