import {
  resolveRunner,
  type ManagedRunnerResolution,
  type ResolveRunnerOptions,
  type ManagedRunnerOutputPolicy,
} from './resolve-runner.js'

const runtimeCache = new Map<string, ManagedRunnerResolution>()

function cacheKey(tool: string, options: ResolveRunnerOptions): string {
  const outputPolicy =
    options.outputPolicy ?? (options.filterOutput === false ? 'structured' : 'rtk-filtered')
  return JSON.stringify({
    tool,
    outputPolicy,
    fallbackCommand: options.fallbackCommand ?? null,
    fallbackArgs: options.fallbackArgs ?? [],
  })
}

export function getManagedRunner(
  tool: string,
  options: ResolveRunnerOptions = {},
): ManagedRunnerResolution {
  const key = cacheKey(tool, options)
  const cached = runtimeCache.get(key)
  if (cached) return cached

  const resolved = resolveRunner(tool, options)
  runtimeCache.set(key, resolved)
  return resolved
}

export function clearManagedRunnerCache(): void {
  runtimeCache.clear()
}

export type { ManagedRunnerOutputPolicy, ManagedRunnerResolution, ResolveRunnerOptions }
