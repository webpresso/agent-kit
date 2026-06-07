import { existsSync, readFileSync } from 'node:fs'
import { dirname, resolve } from 'node:path'
import { createRequire } from 'node:module'
import { spawnSync } from 'node:child_process'

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
  vp: { command: 'vp', args: [] },
  wrangler: { packageName: 'wrangler', binName: 'wrangler' },
}

let rtkAvailable: boolean | null = null

function probeRtkAvailability(): boolean {
  if (rtkAvailable !== null) return rtkAvailable
  try {
    const result = spawnSync('rtk', ['--version'], { encoding: 'utf8', windowsHide: true })
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
    return withOptionalRtk(resolveManagedTool(normalized, managed), outputPolicy)
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

function resolveManagedTool(tool: string, spec: ManagedToolSpec): ManagedRunnerResolution {
  if ('command' in spec) {
    return { tool, command: spec.command, args: [...spec.args], source: 'managed' }
  }

  const binPath = resolvePackageBin(spec.packageName, spec.binName)
  if (binPath) {
    return { tool, command: binPath, args: [...(spec.fallbackArgs ?? [])], source: 'managed' }
  }

  return { tool, command: 'vp', args: ['exec', spec.binName], source: 'fallback' }
}

function resolvePackageBin(packageName: string, binName: string): string | null {
  try {
    const packageJsonPath = require.resolve(`${packageName}/package.json`)
    const packageJson = JSON.parse(readFileSync(packageJsonPath, 'utf8')) as {
      bin?: string | Record<string, string>
    }
    const relativeBin =
      typeof packageJson.bin === 'string' ? packageJson.bin : packageJson.bin?.[binName]
    if (!relativeBin) return null
    const absoluteBin = resolve(dirname(packageJsonPath), relativeBin)
    return existsSync(absoluteBin) ? absoluteBin : null
  } catch {
    return null
  }
}
