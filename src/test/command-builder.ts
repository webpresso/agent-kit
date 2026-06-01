import type { ResolvedTestTarget } from './target-resolver.js'
import { type ManagedRunnerOutputPolicy, getManagedRunner } from '#tool-runtime'
import { getPackageScript, isRecursiveWpScript, packageUsesVitest } from '#cli/package-scripts.js'

export interface CommandConfig {
  command: string
  args: string[]
  env?: Record<string, string>
}

export type VpRunLogMode = 'interleaved' | 'labeled' | 'grouped'

export interface TestCommandOptions {
  cwd?: string
  watch?: boolean
  coverage?: boolean
  testNamePattern?: string
  mutation?: boolean
  workers?: boolean
  cache?: boolean
  noCache?: boolean
  parallel?: boolean
  concurrencyLimit?: number
  log?: VpRunLogMode
  passthrough?: readonly string[]
  filterOutput?: boolean
  outputPolicy?: ManagedRunnerOutputPolicy
}

export function buildTestCommand(
  target: ResolvedTestTarget,
  options: TestCommandOptions = {},
): CommandConfig {
  if (target.type === 'all' && shouldBypassRecursiveWpTest(options.cwd ?? process.cwd())) {
    return buildVitestCommand([], options)
  }

  if (target.type === 'file') {
    return buildVitestCommand(target.values, options)
  }

  return buildVpTestCommand(target.values, options)
}

export function buildVpTestCommand(
  filters: readonly string[],
  options: TestCommandOptions = {},
): CommandConfig {
  const task = getVpTestTask(options)
  const resolvedFilters = filters.map((filter) => formatVpRunFilter(filter, task))
  const explicitTargets =
    resolvedFilters.length > 0 && resolvedFilters.every(isExplicitVpTaskTarget)
  const args = ['run', ...resolvedFilters]

  appendVpRunOptions(args, options)
  if (!explicitTargets) {
    args.push(task)
  }

  const passthrough = buildVitestPassthrough(options)
  if (passthrough.length > 0) {
    args.push('--', ...passthrough)
  }

  const resolution = getManagedRunner('vp', {
    outputPolicy: resolveOutputPolicy(options.outputPolicy, options.filterOutput),
  })
  const env = buildVpRunEnv(options)
  const mergedArgs = [...resolution.args, ...args]
  return env
    ? { command: resolution.command, args: mergedArgs, env }
    : { command: resolution.command, args: mergedArgs }
}

export function buildVitestCommand(
  files: readonly string[],
  options: TestCommandOptions = {},
): CommandConfig {
  const args = [options.watch ? '--watch' : 'run']
  const configFiles: string[] = []
  const testFiles: string[] = []

  for (const file of files) {
    if (isVitestConfigFile(file)) {
      configFiles.push(file)
    } else {
      testFiles.push(file)
    }
  }

  if (configFiles.length > 1) {
    throw new Error(`Expected at most one Vitest config file, received: ${configFiles.join(', ')}`)
  }

  const [configFile] = configFiles
  if (configFile) {
    args.push('--config', configFile)
  }

  args.push(...buildVitestPassthrough(options), ...testFiles)

  const resolution = getManagedRunner('vitest', {
    cwd: options.cwd ?? process.cwd(),
    outputPolicy: resolveOutputPolicy(options.outputPolicy, options.filterOutput),
  })
  return { command: resolution.command, args: [...resolution.args, ...args] }
}

export function getVpTestTask(
  options: Pick<TestCommandOptions, 'mutation' | 'workers' | 'watch'>,
): string {
  if (options.mutation) return 'test:mutation'
  if (options.workers) return 'test:workers'
  if (options.watch) return 'test:watch'
  return 'test'
}

function appendVpRunOptions(args: string[], options: TestCommandOptions): void {
  if (options.noCache) {
    args.push('--no-cache')
  } else if (options.cache) {
    args.push('--cache')
  }

  if (options.parallel) {
    args.push('--parallel')
  }

  if (options.concurrencyLimit !== undefined) {
    args.push('--concurrency-limit', String(options.concurrencyLimit))
  }

  if (options.log) {
    args.push('--log', options.log)
  }
}

function buildVpRunEnv(options: TestCommandOptions): Record<string, string> | undefined {
  if (options.concurrencyLimit === undefined) return
  return { VP_RUN_CONCURRENCY_LIMIT: String(options.concurrencyLimit) }
}

function isExplicitVpTaskTarget(target: string): boolean {
  return target.includes('#')
}

function formatVpRunFilter(filter: string, task: string): string {
  if (isExplicitVpTaskTarget(filter)) {
    return filter
  }

  return filter.startsWith('@') || filter.includes('/') ? `${filter}#${task}` : filter
}

function buildVitestPassthrough(options: TestCommandOptions): string[] {
  const args: string[] = []
  if (options.coverage) args.push('--coverage')
  if (options.testNamePattern) args.push('-t', options.testNamePattern)
  if (options.passthrough) args.push(...options.passthrough)
  return args
}

function isVitestConfigFile(file: string): boolean {
  return /^vitest(?:\.[\w-]+)?\.config\.(?:ts|mts|cts|js|mjs|cjs)$/u.test(file)
}

function resolveOutputPolicy(
  outputPolicy: ManagedRunnerOutputPolicy | undefined,
  filterOutput: boolean | undefined,
): ManagedRunnerOutputPolicy {
  if (outputPolicy) return outputPolicy
  return filterOutput === false ? 'structured' : 'rtk-filtered'
}

function shouldBypassRecursiveWpTest(cwd: string): boolean {
  const testScript = getPackageScript(cwd, 'test')
  if (!testScript || !isRecursiveWpScript(testScript, 'test')) return false
  return packageUsesVitest(cwd)
}
