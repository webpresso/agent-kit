export interface ManagedRunnerResolution {
  readonly tool: string
  readonly command: string
  readonly args: readonly string[]
  readonly source: 'managed' | 'fallback'
}

export interface ResolveRunnerOptions {
  readonly fallbackCommand?: string
  readonly fallbackArgs?: readonly string[]
  readonly filterOutput?: boolean
}

const MANAGED_TOOL_PREFIX: Readonly<Record<string, { command: string; args: readonly string[] }>> = {
  playwright: { command: 'vp', args: ['exec', 'playwright'] },
  vitest: { command: 'vp', args: ['exec', 'vitest'] },
  vp: { command: 'vp', args: [] },
}

function withOptionalRtk(
  resolution: ManagedRunnerResolution,
  filterOutput: boolean,
): ManagedRunnerResolution {
  if (!filterOutput) return resolution
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

  const filterOutput = options.filterOutput ?? true
  const managed = MANAGED_TOOL_PREFIX[normalized]
  if (managed) {
    return withOptionalRtk(
      {
        tool: normalized,
        command: managed.command,
        args: [...managed.args],
        source: 'managed',
      },
      filterOutput,
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
      filterOutput,
    )
  }

  throw new Error(`No managed runtime runner is defined for tool "${normalized}"`)
}
