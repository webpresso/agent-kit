import {
  resolveRunner,
  resolveOutputPolicy,
  setRtkAvailabilityProbeForTest as _setRtkProbe,
  type ManagedRunnerResolution,
  type ResolveRunnerOptions,
  type ManagedRunnerOutputPolicy,
} from "./resolve-runner.js";

const runtimeCache = new Map<string, ManagedRunnerResolution>();

function cacheKey(tool: string, options: ResolveRunnerOptions): string {
  const outputPolicy = resolveOutputPolicy(options.outputPolicy, options.filterOutput);
  return JSON.stringify({
    tool,
    outputPolicy,
    fallbackCommand: options.fallbackCommand ?? null,
    fallbackArgs: options.fallbackArgs ?? [],
    nodeExecPath: options.nodeExecPath ?? null,
  });
}

export function getManagedRunner(
  tool: string,
  options: ResolveRunnerOptions = {},
): ManagedRunnerResolution {
  const key = cacheKey(tool, options);
  const cached = runtimeCache.get(key);
  if (cached) return cached;

  const resolved = resolveRunner(tool, options);
  runtimeCache.set(key, resolved);
  return resolved;
}

export function clearManagedRunnerCache(): void {
  runtimeCache.clear();
}

export function setRtkAvailabilityProbeForTest(value: boolean | null): void {
  _setRtkProbe(value);
  runtimeCache.clear();
}

export { resolveOutputPolicy };
export type { ManagedRunnerOutputPolicy, ManagedRunnerResolution, ResolveRunnerOptions };
