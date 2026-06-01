import { existsSync, readFileSync, statSync } from 'node:fs'
import { dirname, join, relative } from 'node:path'
import { globSync } from 'glob'

import { getPackageScript, isRecursiveWpScript, packageUsesVitest } from '#cli/package-scripts.js'
import { isRunFailure, runCommand as runSharedCommand } from '#mcp/tools/_shared/run-command'
import { buildVitestCommand, type CommandConfig } from '#test'

// Keep the runner's own deadline comfortably below common MCP client call
// ceilings so slow suites fail fast with a structured `timedOut` payload
// instead of appearing to hang.
const DEFAULT_TEST_TIMEOUT_MS = 30_000
const DEFAULT_TEST_TOTAL_BUDGET_MS = 90_000
const WORKSPACE_SHARD_MIN_FILES = 6
const WORKSPACE_TARGET_FILES_PER_SHARD = 5
const WORKSPACE_MAX_SHARDS = 8
const VITEST_DEFAULT_INCLUDE = '**/*.{test,spec}.?(c|m)[jt]s?(x)'
const VITEST_DEFAULT_IGNORE = [
  '**/node_modules/**',
  '**/dist/**',
  '**/coverage/**',
  '**/.git/**',
  '**/.{idea,cache,output,temp}/**',
  '**/{karma,rollup,webpack,vite,vitest,jest,ava,babel,nyc,cypress,tsup,build}.config.*',
] as const

export interface TestRunInput {
  /** Working tree to run from. Defaults to `CLAUDE_PROJECT_DIR` or `process.cwd()`. */
  readonly cwd?: string
  readonly packages?: readonly string[]
  readonly files?: readonly string[]
  readonly extraArgs?: readonly string[]
  readonly signal?: AbortSignal
  readonly timeoutMs?: number
  readonly workspaceSharding?: WorkspaceShardingInput
}

export interface TestResult {
  readonly passed: boolean
  readonly output: string
  readonly exitCode: number
  readonly timedOut?: boolean
  readonly aborted?: boolean
  readonly failureScope?: string
}

export interface WorkspaceShardingInput {
  readonly enabled?: boolean
  readonly minFilesToShard?: number
  readonly targetFilesPerShard?: number
  readonly maxShards?: number
  readonly totalBudgetMs?: number
}

interface ResolvedWorkspaceSharding {
  readonly enabled: boolean
  readonly minFilesToShard: number
  readonly targetFilesPerShard: number
  readonly maxShards: number
  readonly totalBudgetMs: number
}

/**
 * Run tests via the `vp` facade over the repo-declared package-manager substrate.
 *
 * Argv shape:
 *   - `vp run --filter <p> test` once per package when packages are given (results
 *     aggregated; first non-zero exit wins).
 *   - `vp run test -- <file1> <file2>` when files are given (no packages).
 *   - `vp run test` otherwise.
 */
export async function runTests(input: TestRunInput): Promise<TestResult> {
  const cwd = input.cwd ?? process.env.CLAUDE_PROJECT_DIR ?? process.cwd()
  const commandTimeoutMs = input.timeoutMs ?? DEFAULT_TEST_TIMEOUT_MS
  const workspaceSharding = resolveWorkspaceSharding(input.workspaceSharding, input.timeoutMs)
  if (input.packages && input.packages.length > 0) {
    return runPackageSequence(cwd, input.packages, input, workspaceSharding)
  }

  if (input.files && input.files.length > 0) {
    if (usesVitest(cwd)) {
      const fileShardRuns = createVitestShardRunsFromFiles(cwd, input.files, workspaceSharding)
      if (fileShardRuns && fileShardRuns.length > 0) {
        return runScopedSequence(cwd, fileShardRuns, input, workspaceSharding)
      }
      const command = buildManagedVitestRun(cwd, input.files)
      const result = await runCommand(command.command, command.args, {
        ...input,
        cwd,
        timeoutMs: commandTimeoutMs,
      })
      return withFailureScope(result, 'file-filter command')
    }
    const result = await runCommand('vp', ['run', 'test', '--', ...input.files], {
      ...input,
      cwd,
      timeoutMs: commandTimeoutMs,
    })
    return withFailureScope(result, 'file-filter command')
  }

  const workspaceShardRuns = createWorkspaceVitestShardRuns(cwd, workspaceSharding)
  if (workspaceShardRuns && workspaceShardRuns.length > 0) {
    return runScopedSequence(cwd, workspaceShardRuns, input, workspaceSharding)
  }

  if (shouldBypassWorkspaceTestScript(cwd)) {
    const command = buildManagedVitestRun(cwd)
    const result = await runCommand(command.command, command.args, {
      ...input,
      cwd,
      timeoutMs: commandTimeoutMs,
    })
    return withFailureScope(result, 'workspace vitest command')
  }

  const result = await runCommand('vp', ['run', 'test'], {
    ...input,
    cwd,
    timeoutMs: commandTimeoutMs,
  })
  return withFailureScope(result, 'workspace command')
}

interface ScopedRun {
  readonly scope: string
  readonly command: string
  readonly args: readonly string[]
}

interface RunBudget {
  readonly deadlineMs: number
}

async function runPackageSequence(
  cwd: string,
  packages: readonly string[],
  input: TestRunInput,
  workspaceSharding: ResolvedWorkspaceSharding,
): Promise<TestResult> {
  const budget = createRunBudget(workspaceSharding.totalBudgetMs)
  let combinedOutput = ''
  let firstFailure = 0
  let timedOut = false
  let aborted = false
  let failureScope: string | undefined
  for (const pkg of packages) {
    const remainingMs = getRemainingBudgetMs(budget)
    if (remainingMs <= 0) {
      timedOut = true
      if (firstFailure === 0) {
        firstFailure = 124
        failureScope = 'overall test budget'
      }
      combinedOutput += formatScopedOutput(
        'overall test budget',
        `Global test budget exhausted before package ${pkg}.`,
      )
      break
    }
    const result = await runPackageScopedTests(cwd, pkg, {
      ...input,
      timeoutMs: getScopedCommandTimeoutMs(input, remainingMs),
    })
    combinedOutput += formatScopedOutput(`package ${pkg}`, result.output)
    if (!result.passed && firstFailure === 0) {
      firstFailure = result.exitCode
      failureScope = `package ${pkg}`
    }
    if (result.timedOut) timedOut = true
    if (result.aborted) aborted = true
    if (result.timedOut || result.aborted) break
  }
  return {
    passed: firstFailure === 0,
    output: combinedOutput,
    exitCode: firstFailure,
    timedOut,
    aborted,
    failureScope,
  }
}

async function runScopedSequence(
  cwd: string,
  runs: readonly ScopedRun[],
  input: TestRunInput,
  workspaceSharding: ResolvedWorkspaceSharding,
): Promise<TestResult> {
  const budget = createRunBudget(workspaceSharding.totalBudgetMs)
  let combinedOutput = ''
  let firstFailure = 0
  let timedOut = false
  let aborted = false
  let failureScope: string | undefined
  for (const run of runs) {
    const remainingMs = getRemainingBudgetMs(budget)
    if (remainingMs <= 0) {
      timedOut = true
      if (firstFailure === 0) {
        firstFailure = 124
        failureScope = 'overall test budget'
      }
      combinedOutput += formatScopedOutput(
        'overall test budget',
        `Global test budget exhausted before ${run.scope}.`,
      )
      break
    }
    const result = await runCommand(run.command, run.args, {
      cwd,
      signal: input.signal,
      timeoutMs: getScopedCommandTimeoutMs(input, remainingMs),
    })
    combinedOutput += formatScopedOutput(run.scope, result.output)
    if (!result.passed && firstFailure === 0) {
      firstFailure = result.exitCode
      failureScope = run.scope
    }
    if (result.timedOut) timedOut = true
    if (result.aborted) aborted = true
    if (result.timedOut || result.aborted) break
  }

  return {
    passed: firstFailure === 0,
    output: combinedOutput,
    exitCode: firstFailure,
    timedOut,
    aborted,
    failureScope,
  }
}

function createRunBudget(totalBudgetMs: number): RunBudget {
  return { deadlineMs: Date.now() + totalBudgetMs }
}

function getRemainingBudgetMs(budget: RunBudget): number {
  return Math.max(0, budget.deadlineMs - Date.now())
}

function getScopedCommandTimeoutMs(input: TestRunInput, remainingMs: number): number {
  return Math.min(input.timeoutMs ?? remainingMs, remainingMs)
}

function resolveWorkspaceSharding(
  input?: WorkspaceShardingInput,
  explicitTimeoutMs?: number,
): ResolvedWorkspaceSharding {
  return {
    enabled: input?.enabled ?? true,
    minFilesToShard: input?.minFilesToShard ?? WORKSPACE_SHARD_MIN_FILES,
    targetFilesPerShard: input?.targetFilesPerShard ?? WORKSPACE_TARGET_FILES_PER_SHARD,
    maxShards: input?.maxShards ?? WORKSPACE_MAX_SHARDS,
    totalBudgetMs: input?.totalBudgetMs ?? explicitTimeoutMs ?? DEFAULT_TEST_TOTAL_BUDGET_MS,
  }
}

function formatScopedOutput(scope: string, output: string): string {
  const trimmed = output.trim()
  if (!trimmed) return `[scope: ${scope}]\n`
  return `[scope: ${scope}]\n${trimmed}\n`
}

function withFailureScope(result: TestResult, scope: string): TestResult {
  if (result.passed) return result
  if (result.failureScope) return result
  return { ...result, failureScope: scope }
}

function createWorkspaceVitestShardRuns(
  cwd: string,
  workspaceSharding: ResolvedWorkspaceSharding,
): ScopedRun[] | undefined {
  if (!workspaceSharding.enabled) return undefined
  if (!hasRootVitestTestScript(cwd)) return undefined
  const files = discoverVitestFiles(cwd)
  if (files.length < workspaceSharding.minFilesToShard) return undefined
  const shards = buildBalancedShards(cwd, files, workspaceSharding)
  const shardTotal = shards.length
  if (shardTotal <= 1) return undefined

  return shards.map((filesInShard, index) => ({
    scope: `shard ${index + 1}/${shardTotal} (${filesInShard.length} files)`,
    ...buildManagedVitestRun(cwd, filesInShard),
  }))
}

function createVitestShardRunsFromFiles(
  cwd: string,
  files: readonly string[],
  workspaceSharding: ResolvedWorkspaceSharding,
): ScopedRun[] | undefined {
  if (!workspaceSharding.enabled) return undefined
  if (files.length < workspaceSharding.minFilesToShard) return undefined
  const shards = buildBalancedShards(cwd, files, workspaceSharding)
  const shardTotal = shards.length
  if (shardTotal <= 1) return undefined

  return shards.map((filesInShard, index) => ({
    scope: `file shard ${index + 1}/${shardTotal} (${filesInShard.length} files)`,
    ...buildManagedVitestRun(cwd, filesInShard),
  }))
}

function hasRootVitestTestScript(cwd: string): boolean {
  const packageJson = findPackageJson(cwd)
  if (!packageJson) return false
  const pkg = readPackage(packageJson)
  const scripts = pkg.scripts
  if (!scripts || typeof scripts !== 'object' || Array.isArray(scripts)) return false
  const testScript = (scripts as Record<string, unknown>).test
  return typeof testScript === 'string' && /\bvitest\b/.test(testScript)
}

function shouldBypassWorkspaceTestScript(cwd: string): boolean {
  const testScript = getPackageScript(cwd, 'test')
  if (!testScript || !isRecursiveWpScript(testScript, 'test')) return false
  return packageUsesVitest(cwd)
}

function discoverVitestFiles(cwd: string): string[] {
  return globSync(VITEST_DEFAULT_INCLUDE, {
    cwd,
    nodir: true,
    ignore: [...VITEST_DEFAULT_IGNORE],
  }).sort((left, right) => left.localeCompare(right))
}

function buildBalancedShards(
  cwd: string,
  files: readonly string[],
  workspaceSharding: ResolvedWorkspaceSharding,
): string[][] {
  const shardCount = Math.min(
    workspaceSharding.maxShards,
    Math.max(2, Math.ceil(files.length / workspaceSharding.targetFilesPerShard)),
  )
  const buckets = Array.from({ length: shardCount }, () => ({ files: [] as string[], bytes: 0 }))
  const sortedByWeight = [...files]
    .map((file) => ({ file, bytes: estimateFileWeight(cwd, file) }))
    .sort((left, right) => {
      if (right.bytes !== left.bytes) return right.bytes - left.bytes
      return left.file.localeCompare(right.file)
    })

  for (const candidate of sortedByWeight) {
    const lightestBucket = buckets.reduce((best, bucket) =>
      bucket.bytes < best.bytes ? bucket : best,
    )
    lightestBucket.files.push(candidate.file)
    lightestBucket.bytes += candidate.bytes
  }

  return buckets
    .filter((bucket) => bucket.files.length > 0)
    .map((bucket) => bucket.files.sort((left, right) => left.localeCompare(right)))
}

function estimateFileWeight(cwd: string, file: string): number {
  try {
    return Math.max(1, statSync(join(cwd, file)).size)
  } catch {
    return 1
  }
}

function runPackageScopedTests(
  cwd: string,
  packageName: string,
  input: TestRunInput,
): Promise<TestResult> {
  const files = input.files
  const options = { cwd, signal: input.signal, timeoutMs: input.timeoutMs }
  if (usesVitest(cwd, packageName)) {
    const packageCwd = findPackageDirectory(cwd, packageName) ?? cwd
    const command = buildManagedVitestRun(
      packageCwd,
      files ? normalizeFilesForCommandCwd(cwd, packageCwd, files) : [],
    )
    return runCommand(command.command, command.args, { ...options, cwd: packageCwd })
  }

  if (files && files.length > 0) {
    return runCommand('vp', ['run', '--filter', packageName, 'test', '--', ...files], options)
  }

  return runCommand('vp', ['run', '--filter', packageName, 'test'], options)
}

function usesVitest(cwd: string, packageName?: string): boolean {
  const packageJson = findPackageJson(cwd, packageName)
  if (!packageJson) return false
  const pkg = readPackage(packageJson)
  const sections = ['dependencies', 'devDependencies', 'optionalDependencies'] as const
  return sections.some((section) => {
    const deps = pkg[section]
    return Boolean(deps && typeof deps === 'object' && !Array.isArray(deps) && 'vitest' in deps)
  })
}

function findPackageJson(cwd: string, packageName?: string): string | undefined {
  if (!packageName) {
    const rootPackageJson = join(cwd, 'package.json')
    return existsSync(rootPackageJson) ? rootPackageJson : undefined
  }

  const candidates = [
    join(cwd, 'packages', packageName, 'package.json'),
    join(cwd, 'apps', packageName, 'package.json'),
    join(cwd, packageName, 'package.json'),
  ]

  const workspacePackageJson = candidates.find((candidate) => existsSync(candidate))
  if (workspacePackageJson) return workspacePackageJson

  const rootPackageJson = join(cwd, 'package.json')
  if (!existsSync(rootPackageJson)) return undefined
  const rootPackage = readPackage(rootPackageJson)
  return rootPackage.name === packageName ? rootPackageJson : undefined
}

function findPackageDirectory(cwd: string, packageName: string): string | undefined {
  const packageJson = findPackageJson(cwd, packageName)
  return packageJson ? dirname(packageJson) : undefined
}

function normalizeFilesForCommandCwd(
  rootCwd: string,
  commandCwd: string,
  files: readonly string[],
): string[] {
  const packagePrefix = relative(rootCwd, commandCwd)
  if (!packagePrefix || packagePrefix.startsWith('..')) return [...files]
  return files.map((file) =>
    file.startsWith(`${packagePrefix}/`) ? file.slice(packagePrefix.length + 1) : file,
  )
}

function buildManagedVitestRun(cwd: string, files: readonly string[] = []): CommandConfig {
  return buildVitestCommand(files, {
    cwd,
    outputPolicy: 'structured',
    passthrough: ['--reporter=json', '--no-color'],
  })
}

function readPackage(file: string): Record<string, unknown> {
  try {
    const value = JSON.parse(readFileSync(file, 'utf8')) as unknown
    if (!value || typeof value !== 'object' || Array.isArray(value)) return {}
    return value as Record<string, unknown>
  } catch {
    return {}
  }
}

async function runCommand(
  cmd: string,
  args: readonly string[],
  options: Pick<TestRunInput, 'cwd' | 'signal' | 'timeoutMs'>,
): Promise<TestResult> {
  const outcome = await runSharedCommand(cmd, args, {
    cwd: options.cwd,
    signal: options.signal,
    timeoutMs: options.timeoutMs ?? DEFAULT_TEST_TIMEOUT_MS,
  })
  if (isRunFailure(outcome)) throw outcome.error
  const output = [outcome.stdout, outcome.stderr].filter(Boolean).join('')
  return {
    passed: outcome.exitCode === 0,
    output,
    exitCode: outcome.exitCode,
    timedOut: outcome.timedOut,
    aborted: outcome.aborted,
  }
}
