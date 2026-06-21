import { existsSync, readFileSync } from 'node:fs'
import { join } from 'node:path'

import type { ResolvedTestTarget } from './target-resolver.js'
import {
  type ManagedRunnerOutputPolicy,
  getManagedRunner,
  resolveOutputPolicy,
} from '#tool-runtime'
import { getPackageScript, isRecursiveWpScript, packageUsesVitest } from '#cli/package-scripts.js'
import { normalizeTestSuiteName, resolveTestSuiteRuns, type TestSuiteName } from './suite.js'

export interface SingleCommandConfig {
  command: string
  args: string[]
  env?: Record<string, string>
}

export interface CommandSequenceConfig {
  sequence: readonly SingleCommandConfig[]
}

export type CommandConfig = SingleCommandConfig | CommandSequenceConfig

export type VpRunLogMode = 'interleaved' | 'labeled' | 'grouped'

export interface TestCommandOptions {
  cwd?: string
  suite?: TestSuiteName
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
  const suite = options.suite
  if (suite) {
    assertSuiteCompatible(target, options)

    if (target.type === 'file') {
      return buildWorkspaceFileSuiteCommand(target.values, {
        ...options,
        suite: normalizeTestSuiteName(suite),
      })
    }

    if (target.type === 'package') {
      return buildPackageSuiteCommand(target.values, {
        ...options,
        suite: normalizeTestSuiteName(suite),
      })
    }

    return buildWorkspaceSuiteCommand({
      ...options,
      suite: normalizeTestSuiteName(suite),
    })
  }

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
): SingleCommandConfig {
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
): SingleCommandConfig {
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

function buildWorkspaceSuiteCommand(
  options: TestCommandOptions & { suite: TestSuiteName },
): CommandConfig {
  const runs = resolveTestSuiteRuns(options.suite, buildVitestPassthrough(options))
  const resolution = getManagedRunner('vitest', {
    outputPolicy: resolveOutputPolicy(options.outputPolicy, options.filterOutput),
  })
  const commands = runs.map((run) => ({
    command: resolution.command,
    args: [...resolution.args, ...run.vitestArgs],
  }))
  return commands.length === 1 ? commands[0]! : { sequence: commands }
}

function buildWorkspaceFileSuiteCommand(
  files: readonly string[],
  options: TestCommandOptions & { suite: TestSuiteName },
): CommandConfig {
  const { configFile, testFiles } = splitVitestFileTargets(files)
  const resolution = getManagedRunner('vitest', {
    outputPolicy: resolveOutputPolicy(options.outputPolicy, options.filterOutput),
  })
  const passthrough = buildVitestPassthrough(options)
  const commands = explicitSuitesFor(options.suite).flatMap((suite) => {
    const selectedFiles = filterFilesForSuite(testFiles, suite)
    if (selectedFiles.length === 0) return []
    return [
      {
        command: resolution.command,
        args: [
          ...resolution.args,
          ...createExplicitFileSuiteVitestArgs(suite, configFile),
          ...passthrough,
          ...selectedFiles,
        ],
      },
    ]
  })

  if (commands.length === 0) {
    throw new Error(
      `No explicit file targets matched suite "${options.suite}". Refusing to expand ${
        testFiles.length
      } file target${testFiles.length === 1 ? '' : 's'} into a broader suite run.`,
    )
  }

  return commands.length === 1 ? commands[0]! : { sequence: commands }
}

function buildPackageSuiteCommand(
  packageTargets: readonly string[],
  options: TestCommandOptions & { suite: TestSuiteName },
): CommandConfig {
  const cwd = options.cwd ?? process.cwd()
  for (const packageTarget of packageTargets) {
    assertVitestBackedPackageTarget(cwd, packageTarget)
  }

  const resolution = getManagedRunner('vp', {
    outputPolicy: resolveOutputPolicy(options.outputPolicy, options.filterOutput),
  })
  const suiteRuns = resolveTestSuiteRuns(options.suite, buildVitestPassthrough(options))
  const commands = packageTargets.flatMap((packageTarget) =>
    suiteRuns.map((run) => ({
      command: resolution.command,
      args: [
        ...resolution.args,
        'exec',
        '--filter',
        packageTarget,
        '--',
        'vitest',
        ...run.vitestArgs,
      ],
    })),
  )

  return commands.length === 1 ? commands[0]! : { sequence: commands }
}

function assertSuiteCompatible(target: ResolvedTestTarget, options: TestCommandOptions): void {
  if (options.mutation) {
    throw new Error('--suite cannot be combined with --mutation.')
  }
  if (options.workers) {
    throw new Error('--suite cannot be combined with --workers.')
  }
  if (options.watch) {
    throw new Error('--suite cannot be combined with --watch.')
  }
}

function assertVitestBackedPackageTarget(cwd: string, packageTarget: string): void {
  const packageDir = resolveConcretePackageTarget(cwd, packageTarget)
  if (!packageDir) {
    throw new Error(
      `--suite requires a concrete package target. Could not resolve package "${packageTarget}".`,
    )
  }

  if (!packageUsesVitest(packageDir)) {
    throw new Error(
      `--suite requires a Vitest-backed package target. Package "${packageTarget}" does not declare vitest.`,
    )
  }
}

function resolveConcretePackageTarget(cwd: string, packageTarget: string): string | undefined {
  const rootPackageName = readPackageName(cwd)
  const candidates = [
    join(cwd, 'packages', packageTarget),
    join(cwd, 'apps', packageTarget),
    join(cwd, packageTarget),
    ...(rootPackageName === packageTarget ? [cwd] : []),
  ]

  return candidates.find((candidate) => existsSync(join(candidate, 'package.json')))
}

function readPackageName(cwd: string): string | undefined {
  try {
    const parsed = JSON.parse(readPackageJsonText(cwd)) as { name?: unknown }
    return typeof parsed.name === 'string' ? parsed.name : undefined
  } catch {
    return
  }
}

function readPackageJsonText(cwd: string): string {
  const packageJson = join(cwd, 'package.json')
  if (!existsSync(packageJson)) return '{}'
  return readFileSync(packageJson, 'utf8')
}

export function isCommandSequenceConfig(config: CommandConfig): config is CommandSequenceConfig {
  return 'sequence' in config
}

function isVitestConfigFile(file: string): boolean {
  return /^vitest(?:\.[\w-]+)?\.config\.(?:ts|mts|cts|js|mjs|cjs)$/u.test(file)
}

function splitVitestFileTargets(files: readonly string[]): {
  configFile?: string
  testFiles: string[]
} {
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

  return {
    configFile: configFiles[0],
    testFiles,
  }
}

function explicitSuitesFor(suite: TestSuiteName): readonly Exclude<TestSuiteName, 'all'>[] {
  return suite === 'all' ? ['unit', 'integration'] : [suite]
}

function createExplicitFileSuiteVitestArgs(
  suite: Exclude<TestSuiteName, 'all'>,
  configFile?: string,
): string[] {
  const args = ['run']
  if (configFile) {
    args.push('--config', configFile)
  }

  if (suite === 'integration') {
    args.push('--no-file-parallelism', '--testTimeout', '30000')
  } else {
    args.push('--exclude', '**/*.integration.test.ts', '--exclude', '**/*.e2e.test.ts')
  }

  return args
}

const INTEGRATION_E2E_FILE_PATTERN = /\.(integration|e2e)\.test\.[jt]sx?$/

function filterFilesForSuite(
  files: readonly string[],
  suite: Exclude<TestSuiteName, 'all'>,
): string[] {
  return files.filter((file) =>
    suite === 'integration'
      ? INTEGRATION_E2E_FILE_PATTERN.test(file)
      : !INTEGRATION_E2E_FILE_PATTERN.test(file),
  )
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
