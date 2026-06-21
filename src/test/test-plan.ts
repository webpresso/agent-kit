import { availableParallelism } from 'node:os'
import { statSync } from 'node:fs'
import { join } from 'node:path'

import { discoverVitestFiles, isDiscoveredRuntimeSurfaceFile } from './vitest-discovery.js'
import type { TestSuiteName } from './suite.js'

export type TestPhaseId = 'unit' | 'integration' | 'package-smoke'
export type TestRunSuite = Exclude<TestSuiteName, 'all'>

export interface TestPlan {
  readonly phases: readonly TestPhase[]
  readonly telemetry: TestPlanTelemetry
}

export interface TestPhase {
  readonly id: TestPhaseId
  readonly label: string
  readonly concurrency: number
  readonly runs: readonly TestRunPlan[]
}

export interface TestRunPlan {
  readonly runner: 'vitest' | 'vp'
  readonly args: readonly string[]
  readonly files: readonly string[]
  readonly suite: TestRunSuite
  readonly scope: string
  readonly shardIndex?: number
  readonly shardTotal?: number
  readonly maxWorkers?: number
  readonly timeoutMs?: number
}

export interface TestPlanTelemetry {
  readonly discoveredFiles: number
  readonly ignoredRuntimeFiles: number
  readonly runtimeIgnoredSamples: readonly string[]
  readonly phaseCount: number
  readonly shardCountByPhase: Readonly<Record<TestPhaseId, number>>
  readonly packageSmokeIncluded: boolean
}

export interface CreateWorkspaceTestPlanOptions {
  readonly suite?: TestSuiteName
  readonly passthrough?: readonly string[]
  readonly reporterArgs?: readonly string[]
  readonly sharding?: WorkspaceTestShardingOptions
}

export interface WorkspaceTestShardingOptions {
  readonly enabled?: boolean
  readonly minFilesToShard?: number
  readonly targetFilesPerShard?: number
  readonly maxShards?: number
  readonly concurrency?: number
}

const DEFAULT_MIN_FILES_TO_SHARD = 6
const DEFAULT_TARGET_FILES_PER_SHARD = 5
const DEFAULT_MAX_SHARDS = 8
const DEFAULT_MAX_CONCURRENCY = 4
const INTEGRATION_E2E_FILE_PATTERN = /\.(integration|e2e)\.test\.[cm]?[jt]sx?$/
const PACKAGE_SMOKE_FILE_PATTERN = /(?:^|[/.])package-smoke\.test\.[cm]?[jt]sx?$/

/**
 * `all` is intentionally the standard suite: all normal repo tests
 * (unit + integration/e2e). Package install/setup smoke is release-gate work
 * and remains in the explicit `package-smoke` suite.
 */
export function createWorkspaceTestPlan(
  cwd: string,
  options: CreateWorkspaceTestPlanOptions = {},
): TestPlan {
  const suite = options.suite ?? 'all'
  const allFiles = discoverVitestFiles(cwd)
  const runtimeFiles = allFiles.filter(isDiscoveredRuntimeSurfaceFile)
  const files = allFiles.filter((file) => !isDiscoveredRuntimeSurfaceFile(file))
  const phases: TestPhase[] = []

  if (suite === 'all' || suite === 'unit') {
    const unitFiles = files.filter((file) => isUnitFile(file))
    phases.push(createUnitPhase(cwd, unitFiles, options))
  }

  if (suite === 'all' || suite === 'integration') {
    const integrationFiles = files.filter((file) => isIntegrationFile(file))
    phases.push(createIntegrationPhase(integrationFiles, options))
  }

  if (suite === 'package-smoke') {
    const smokeFiles = files.filter((file) => isPackageSmokeFile(file))
    phases.push(createPackageSmokePhase(smokeFiles, options))
  }

  const nonEmptyPhases = phases.filter((phase) => phase.runs.length > 0)
  return {
    phases: nonEmptyPhases,
    telemetry: {
      discoveredFiles: files.length,
      ignoredRuntimeFiles: runtimeFiles.length,
      runtimeIgnoredSamples: runtimeFiles.slice(0, 5),
      phaseCount: nonEmptyPhases.length,
      shardCountByPhase: {
        unit: countRuns(nonEmptyPhases, 'unit'),
        integration: countRuns(nonEmptyPhases, 'integration'),
        'package-smoke': countRuns(nonEmptyPhases, 'package-smoke'),
      },
      packageSmokeIncluded: suite === 'package-smoke',
    },
  }
}

export function filterFilesForTestSuite(
  files: readonly string[],
  suite: Exclude<TestSuiteName, 'all'>,
): string[] {
  if (suite === 'package-smoke') return files.filter(isPackageSmokeFile)
  if (suite === 'integration') return files.filter(isIntegrationFile)
  return files.filter(isUnitFile)
}

export function isIntegrationFile(file: string): boolean {
  return INTEGRATION_E2E_FILE_PATTERN.test(file) && !isPackageSmokeFile(file)
}

export function isPackageSmokeFile(file: string): boolean {
  return PACKAGE_SMOKE_FILE_PATTERN.test(file)
}

export function isUnitFile(file: string): boolean {
  return !isIntegrationFile(file) && !isPackageSmokeFile(file)
}

function createUnitPhase(
  cwd: string,
  files: readonly string[],
  options: CreateWorkspaceTestPlanOptions,
): TestPhase {
  const sharding = resolveSharding(options.sharding)
  const shards =
    sharding.enabled && files.length >= sharding.minFilesToShard
      ? buildBalancedShards(cwd, files, sharding)
      : [files]
  const shardTotal = shards.length
  const concurrency = Math.min(sharding.concurrency, shardTotal)
  const maxWorkers =
    concurrency > 1 ? Math.max(1, Math.floor(availableParallelism() / concurrency)) : undefined
  return {
    id: 'unit',
    label: 'suite unit',
    concurrency,
    runs: shards.map((shard, index) => ({
      runner: 'vitest',
      args: [
        'run',
        ...reporterArgs(options),
        ...workerArgs(maxWorkers),
        ...passthroughArgs(options),
        ...shard,
      ],
      files: shard,
      suite: 'unit',
      scope: formatScope('suite unit', index, shardTotal, shard.length),
      shardIndex: shardTotal > 1 ? index + 1 : undefined,
      shardTotal: shardTotal > 1 ? shardTotal : undefined,
      maxWorkers,
    })),
  }
}

function createIntegrationPhase(
  files: readonly string[],
  options: CreateWorkspaceTestPlanOptions,
): TestPhase {
  return {
    id: 'integration',
    label: 'suite integration',
    concurrency: 1,
    runs:
      files.length === 0
        ? []
        : [
            {
              runner: 'vitest',
              args: [
                'run',
                '--no-file-parallelism',
                '--testTimeout',
                '30000',
                ...reporterArgs(options),
                ...passthroughArgs(options),
                ...files,
              ],
              files,
              suite: 'integration',
              scope: `suite integration (${files.length} file${files.length === 1 ? '' : 's'})`,
              timeoutMs: 30_000,
            },
          ],
  }
}

function createPackageSmokePhase(
  files: readonly string[],
  options: CreateWorkspaceTestPlanOptions,
): TestPhase {
  return {
    id: 'package-smoke',
    label: 'suite package-smoke',
    concurrency: 1,
    runs:
      files.length === 0
        ? []
        : [
            {
              runner: 'vitest',
              args: [
                'run',
                '--no-file-parallelism',
                '--testTimeout',
                '120000',
                ...reporterArgs(options),
                ...passthroughArgs(options),
                ...files,
              ],
              files,
              suite: 'package-smoke',
              scope: `suite package-smoke (${files.length} file${files.length === 1 ? '' : 's'})`,
              timeoutMs: 120_000,
            },
          ],
  }
}

function resolveSharding(input: WorkspaceTestShardingOptions = {}): Required<WorkspaceTestShardingOptions> {
  return {
    enabled: input.enabled ?? true,
    minFilesToShard: input.minFilesToShard ?? DEFAULT_MIN_FILES_TO_SHARD,
    targetFilesPerShard: input.targetFilesPerShard ?? DEFAULT_TARGET_FILES_PER_SHARD,
    maxShards: input.maxShards ?? DEFAULT_MAX_SHARDS,
    concurrency: input.concurrency ?? Math.max(1, Math.min(DEFAULT_MAX_CONCURRENCY, availableParallelism())),
  }
}

function buildBalancedShards(
  cwd: string,
  files: readonly string[],
  sharding: Required<WorkspaceTestShardingOptions>,
): readonly string[][] {
  const shardCount = Math.max(
    1,
    Math.min(sharding.maxShards, Math.ceil(files.length / sharding.targetFilesPerShard)),
  )
  const shards = Array.from({ length: shardCount }, () => ({ files: [] as string[], weight: 0 }))
  const weighted = files
    .map((file) => ({ file, weight: fileWeight(cwd, file) }))
    .toSorted((left, right) => right.weight - left.weight || left.file.localeCompare(right.file))

  for (const item of weighted) {
    const target = shards.toSorted((left, right) => left.weight - right.weight)[0]!
    target.files.push(item.file)
    target.weight += item.weight
  }

  return shards.map((shard) => shard.files.toSorted((left, right) => left.localeCompare(right)))
}

function fileWeight(cwd: string, file: string): number {
  try {
    const size = statSync(join(cwd, file)).size
    return Math.max(1, size)
  } catch {
    return 1
  }
}

function reporterArgs(options: CreateWorkspaceTestPlanOptions): readonly string[] {
  return options.reporterArgs ?? []
}

function passthroughArgs(options: CreateWorkspaceTestPlanOptions): readonly string[] {
  return options.passthrough ?? []
}

function workerArgs(maxWorkers: number | undefined): readonly string[] {
  return maxWorkers === undefined ? [] : ['--maxWorkers', String(maxWorkers)]
}

function formatScope(label: string, index: number, total: number, count: number): string {
  if (total <= 1) return `${label} (${count} file${count === 1 ? '' : 's'})`
  return `${label} shard ${index + 1}/${total} (${count} file${count === 1 ? '' : 's'})`
}

function countRuns(phases: readonly TestPhase[], phaseId: TestPhaseId): number {
  return phases.find((phase) => phase.id === phaseId)?.runs.length ?? 0
}
