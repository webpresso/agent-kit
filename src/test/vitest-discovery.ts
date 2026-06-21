import { globSync } from 'glob'

import { globIgnorePatternsFor, isRuntimeSurfacePath } from '#paths/discovery-policy.js'

export const VITEST_WORKSPACE_INCLUDE = [
  'src/**/*.test.ts',
  'src/**/*.integration.test.ts',
  'scripts/**/*.test.ts',
  'test/**/*.test.ts',
  '*.test.ts',
] as const

export const VITEST_CONFIG_IGNORE = [
  '**/{karma,rollup,webpack,vite,vitest,jest,ava,babel,nyc,cypress,tsup,build}.config.*',
] as const

export interface DiscoverVitestFilesOptions {
  readonly includeRuntimeSurfaces?: boolean
}

export function discoverVitestFiles(
  cwd: string,
  options: DiscoverVitestFilesOptions = {},
): string[] {
  return globSync([...VITEST_WORKSPACE_INCLUDE], {
    cwd,
    nodir: true,
    ignore: options.includeRuntimeSurfaces ? [...VITEST_CONFIG_IGNORE] : defaultVitestIgnore(),
  }).sort((left, right) => left.localeCompare(right))
}

export function defaultVitestIgnore(): string[] {
  return [...globIgnorePatternsFor('testDiscovery'), ...VITEST_CONFIG_IGNORE]
}

export function isDiscoveredRuntimeSurfaceFile(file: string): boolean {
  return isRuntimeSurfacePath(file)
}
