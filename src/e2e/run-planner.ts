import type {
  E2eCommandRequest,
  E2eHostAdapter,
  E2eRunPlannerOptions,
  E2eStepDefinition,
  E2eSuiteDefinition,
  PlannedE2eRunGroup,
  PlannedE2eRunStep,
} from './types.js'

import { buildE2eCommand } from './command-builder.js'
import { defineE2eSuite, normalizeE2ePath } from './suite-registry.js'

export interface GenericE2ePlanInput extends E2eCommandRequest {
  suite?: string
  runner?: E2eStepDefinition['runner']
  config?: string
}

function defaultConfigPathForRunner(
  runner: E2eStepDefinition['runner'] | undefined,
): string | undefined {
  switch (runner) {
    case 'vitest':
      return 'vitest.config.ts'
    case 'command':
      return undefined
    case 'playwright':
    default:
      return 'playwright.config.ts'
  }
}

export function planGenericE2eRun(input: GenericE2ePlanInput): PlannedE2eRunGroup[] {
  const runner = input.runner ?? 'playwright'
  const suite = defineE2eSuite({
    id: input.suite ?? 'default',
    fileMatchers: [],
    batchKey: input.suite ?? 'default',
    steps: [
      {
        runner,
        logName: input.suite ?? 'default',
        configPath: input.config ?? defaultConfigPathForRunner(runner),
        supportsHeaded: runner !== 'vitest' && runner !== 'command',
        supportsDebug: runner !== 'vitest' && runner !== 'command',
      },
    ],
  })

  return planE2eRunsFromSuites({
    suites: [suite],
    requestedSuiteIds: [suite.id],
    normalizedFilesBySuite: new Map([[suite.id, [...(input.files ?? [])]]]),
    hasRequestedFiles: (input.files?.length ?? 0) > 0,
    request: input,
  })
}

export function planE2eRun(options: E2eRunPlannerOptions): PlannedE2eRunGroup[] {
  const requestedSuiteIds = resolveRequestedSuiteIds(options)
  const normalizedFilesBySuite = new Map<string, string[]>()

  for (const file of options.file ?? []) {
    const resolved = options.hostAdapter.resolveSuiteForFile(file)
    if (!resolved) {
      throw new Error(`Unknown E2E file path: ${file}`)
    }

    const currentFiles = normalizedFilesBySuite.get(resolved.suiteId) ?? []
    currentFiles.push(resolved.normalizedPath)
    normalizedFilesBySuite.set(resolved.suiteId, currentFiles)
  }

  return planE2eRunsFromSuites({
    suites: options.hostAdapter.listSuites(),
    requestedSuiteIds,
    normalizedFilesBySuite,
    hasRequestedFiles: (options.file?.length ?? 0) > 0,
    request: options,
  })
}

function planE2eRunsFromSuites(options: {
  suites: readonly E2eSuiteDefinition[]
  requestedSuiteIds: readonly string[]
  normalizedFilesBySuite: Map<string, string[]>
  hasRequestedFiles: boolean
  request: E2eCommandRequest
}): PlannedE2eRunGroup[] {
  const runs: PlannedE2eRunStep[] = []

  for (const suiteId of options.requestedSuiteIds) {
    const suite = options.suites.find((candidate) => candidate.id === suiteId)
    if (!suite) {
      throw new Error(`Unknown E2E suite: ${suiteId}`)
    }

    assertRunnerFlagsSupported(suite, options.request)
    for (const step of suite.steps) {
      const selectedFiles = selectStepFiles(
        step,
        suite,
        options.normalizedFilesBySuite.get(suite.id) ?? [],
      )

      if (options.hasRequestedFiles && selectedFiles.length === 0) {
        continue
      }

      const command = buildE2eCommand({
        step,
        files: selectedFiles,
        headed: options.request.headed,
        debug: options.request.debug,
        workers: options.request.workers,
        testList: options.request.testList,
        passthrough: options.request.passthrough,
        outputPolicy: options.request.outputPolicy,
        filterOutput: options.request.filterOutput,
      })

      runs.push({
        suiteId: suite.id,
        batchKey: step.batchKey ?? suite.batchKey,
        envProfile: step.envProfile ?? suite.envProfile,
        runtimeProfile:
          step.runtimeProfile ?? step.envProfile ?? suite.runtimeProfile ?? suite.envProfile,
        runner: step.runner,
        logName: step.logName,
        reportDir: step.reportDir,
        command: command.command,
        args: command.args,
        env: normalizeEnv({ ...suite.env, ...step.env, ...command.env }),
      })
    }
  }

  return groupPlannedE2eRuns(runs)
}

function resolveRequestedSuiteIds(options: E2eRunPlannerOptions): string[] {
  if ((options.file?.length ?? 0) > 0) {
    const requestedSuites = new Set<string>()

    for (const file of options.file ?? []) {
      const resolved = options.hostAdapter.resolveSuiteForFile(file)
      if (!resolved) {
        throw new Error(`Unknown E2E file path: ${file}`)
      }

      requestedSuites.add(resolved.suiteId)
    }

    return options.hostAdapter
      .listSuites()
      .map((suite) => suite.id)
      .filter((suiteId) => requestedSuites.has(suiteId))
  }

  if (options.suite) {
    const group = options.hostAdapter.resolveSuiteGroup?.(options.suite)
    if (group?.length) {
      return [...group]
    }

    const suiteId = options.hostAdapter.resolveSuiteId(options.suite)
    if (!suiteId) {
      throw new Error(`Unknown E2E suite: ${options.suite}`)
    }

    return [suiteId]
  }

  return options.hostAdapter
    .listSuites()
    .slice(0, 1)
    .map((suite) => suite.id)
}

function assertRunnerFlagsSupported(suite: E2eSuiteDefinition, request: E2eCommandRequest): void {
  if (request.headed && !suite.steps.some((step) => step.supportsHeaded)) {
    throw new Error(
      `--headed is only supported for headed-capable suites. Received suite: ${suite.id}`,
    )
  }

  if (request.debug && !suite.steps.some((step) => step.supportsDebug)) {
    throw new Error(
      `--debug is only supported for debug-capable suites. Received suite: ${suite.id}`,
    )
  }
}

function selectStepFiles(
  step: E2eStepDefinition,
  suite: E2eSuiteDefinition,
  selectedFiles: readonly string[],
): string[] {
  if (selectedFiles.length === 0) {
    return step.fixedFiles ? [...step.fixedFiles] : []
  }

  if (step.fixedFiles?.length) {
    return selectedFiles.filter((file) => step.fixedFiles?.includes(file))
  }

  const otherFixedFiles = new Set(
    suite.steps
      .filter((candidate) => candidate !== step)
      .flatMap((candidate) => candidate.fixedFiles ?? []),
  )

  if (otherFixedFiles.size > 0) {
    return selectedFiles.filter((file) => !otherFixedFiles.has(file))
  }

  return [...selectedFiles]
}

export function groupPlannedE2eRuns(runs: readonly PlannedE2eRunStep[]): PlannedE2eRunGroup[] {
  const groups = new Map<string, PlannedE2eRunGroup>()

  for (const run of runs) {
    const key = `${run.batchKey}::${run.envProfile ?? 'none'}::${stableEnvKey(run.env)}`
    const existing = groups.get(key)
    if (existing) {
      existing.runs.push(run)
      continue
    }

    groups.set(key, {
      batchKey: run.batchKey,
      envProfile: run.envProfile,
      runtimeProfile: run.runtimeProfile ?? run.envProfile,
      env: normalizeEnv(run.env),
      runs: [run],
    })
  }

  return [...groups.values()]
}

export function normalizeRequestedFiles(
  files: readonly string[],
  hostAdapter?: E2eHostAdapter,
): string[] {
  return hostAdapter
    ? files.map((file) => hostAdapter.normalizeFilePath(file))
    : files.map((file) => normalizeE2ePath(file))
}

function stableEnvKey(env?: Record<string, string>): string {
  if (!env || Object.keys(env).length === 0) {
    return 'none'
  }

  return JSON.stringify(
    Object.keys(env)
      .toSorted()
      .map((key) => [key, env[key]]),
  )
}

function normalizeEnv(env?: Record<string, string>): Record<string, string> | undefined {
  if (!env || Object.keys(env).length === 0) {
    return undefined
  }

  return env
}
