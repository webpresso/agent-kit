import { resolveLocalPackageEntrypoint, resolveNodeRuntimeCommand } from './local-package-entrypoint.js'

export interface ManagedRunnerResolution {
  readonly tool: string
  readonly command: string
  readonly args: readonly string[]
  readonly source: 'managed' | 'fallback'
}

export type ManagedRunnerOutputPolicy = 'rtk-filtered' | 'structured'

export interface ResolveRunnerOptions {
  readonly cwd?: string
  readonly fallbackCommand?: string
  readonly fallbackArgs?: readonly string[]
  /** @deprecated Use {@link outputPolicy} for explicit output routing. */
  readonly filterOutput?: boolean
  readonly outputPolicy?: ManagedRunnerOutputPolicy
}

const MANAGED_TOOL_PREFIX: Readonly<Record<string, { command: string; args: readonly string[] }>> = {
  oxfmt: { command: 'vp', args: ['exec', 'oxfmt'] },
  playwright: { command: 'vp', args: ['exec', 'playwright'] },
  tsc: { command: 'vp', args: ['exec', 'tsc'] },
  vitest: { command: 'vp', args: ['exec', 'vitest'] },
  vp: { command: 'vp', args: [] },
}

const LOCAL_PACKAGE_ENTRYPOINTS: Readonly<
  Partial<
    Record<string, { packageName: string; entryRelativePath: string; runtime: 'current' | 'node' }>
  >
> = {
  tsc: { packageName: 'typescript', entryRelativePath: 'bin/tsc', runtime: 'node' },
  vitest: { packageName: 'vitest', entryRelativePath: 'vitest.mjs', runtime: 'node' },
}

function withOptionalRtk(
  resolution: ManagedRunnerResolution,
  outputPolicy: ManagedRunnerOutputPolicy,
): ManagedRunnerResolution {
  if (outputPolicy !== 'rtk-filtered') return resolution
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

  const outputPolicy: ManagedRunnerOutputPolicy =
    options.outputPolicy ?? (options.filterOutput === false ? 'structured' : 'rtk-filtered')
  const managed = MANAGED_TOOL_PREFIX[normalized]
  if (managed) {
    const localEntrypointSpec = LOCAL_PACKAGE_ENTRYPOINTS[normalized]
    if (localEntrypointSpec) {
      const localEntrypoint = resolveLocalPackageEntrypoint(
        options.cwd ?? process.cwd(),
        localEntrypointSpec.packageName,
        localEntrypointSpec.entryRelativePath,
      )

      if (localEntrypoint) {
        return withOptionalRtk(
          {
            tool: normalized,
            command:
              localEntrypointSpec.runtime === 'node'
                ? resolveNodeRuntimeCommand()
                : process.execPath,
            args: [localEntrypoint],
            source: 'managed',
          },
          outputPolicy,
        )
      }
    }

    return withOptionalRtk(
      {
        tool: normalized,
        command: managed.command,
        args: [...managed.args],
        source: 'managed',
      },
      outputPolicy,
    )
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
