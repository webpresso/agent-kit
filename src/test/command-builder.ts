import { existsSync } from 'node:fs'
import { join } from 'node:path'

import type { ResolvedTestTarget } from './target-resolver.js'
import {
  type ManagedRunnerOutputPolicy,
  getManagedRunner,
  resolveOutputPolicy,
} from '#tool-runtime'
import { getPackageScript, isRecursiveWpScript } from '#cli/package-scripts.js'

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
  if (target.type === 'all' && shouldBypassRecursiveWpTask(options.cwd ?? process.cwd(), options)) {
    return options.mutation ? buildStrykerCommand(options) : buildVitestCommand([], options)
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
    outputPolicy: resolveOutputPolicy(options.outputPolicy, options.filterOutput),
  })
  return { command: resolution.command, args: [...resolution.args, ...args] }
}

export function buildStrykerCommand(options: TestCommandOptions = {}): CommandConfig {
  const outputPolicy = resolveOutputPolicy(options.outputPolicy, options.filterOutput)
  const configFile = resolveStrykerConfigFile(options.cwd ?? process.cwd())

  if (isTypeScriptConfigFile(configFile)) {
    const tsxResolution = getManagedRunner('tsx', { outputPolicy })
    const strykerResolution = getManagedRunner('stryker', { outputPolicy: 'structured' })
    return {
      command: tsxResolution.command,
      args: [
        ...tsxResolution.args,
        strykerResolution.command,
        ...strykerResolution.args,
        'run',
        configFile,
      ],
    }
  }

  const resolution = getManagedRunner('stryker', { outputPolicy })
  return {
    command: resolution.command,
    args: [...resolution.args, 'run', configFile],
  }
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

function shouldBypassRecursiveWpTask(cwd: string, options: TestCommandOptions): boolean {
  const scriptNames = options.mutation
    ? ['test:mutation', 'mutation']
    : options.workers
      ? ['test:workers']
      : options.watch
        ? ['test:watch', 'test']
        : ['test']

  return scriptNames.some((scriptName) => {
    const script = getPackageScript(cwd, scriptName)
    return Boolean(script && isRecursiveWpScript(script, 'test'))
  })
}

function resolveStrykerConfigFile(cwd: string): string {
  for (const candidate of ['stryker.config.ts', 'stryker.config.mjs'] as const) {
    if (existsSync(join(cwd, candidate))) return candidate
  }

  return 'stryker.config.ts'
}

function isTypeScriptConfigFile(configFile: string): boolean {
  return /\.(?:ts|mts|cts)$/u.test(configFile)
}
