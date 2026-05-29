export type E2eRunnerKind = 'playwright' | 'vitest' | 'command'

export interface CommandConfig {
  command: string
  args: string[]
  env?: Record<string, string>
}

export interface E2eStepDefinition {
  runner: E2eRunnerKind
  logName: string
  configPath?: string
  fixedFiles?: readonly string[]
  fixedArgs?: readonly string[]
  commandArgs?: readonly string[]
  supportsHeaded?: boolean
  supportsDebug?: boolean
  batchKey?: string
  envProfile?: string
  reportDir?: string
  env?: Record<string, string>
}

export interface E2eSuiteDefinition {
  id: string
  aliases?: readonly string[]
  fileMatchers: readonly string[]
  batchKey: string
  envProfile?: string
  steps: readonly E2eStepDefinition[]
  env?: Record<string, string>
}

export interface ResolvedE2eFile {
  normalizedPath: string
  suiteId: string
}

export interface E2eHostAdapter {
  listSuites(): readonly E2eSuiteDefinition[]
  resolveSuiteId(name: string): string | null
  resolveSuiteGroup?(name: string): readonly string[] | null
  normalizeFilePath(filePath: string): string
  resolveSuiteForFile(filePath: string): ResolvedE2eFile | null
  buildExecutionPlan?(request: E2eExecutionRequest): PlannedE2eRunGroup[]
}

export interface E2eCommandRequest {
  files?: readonly string[]
  headed?: boolean
  debug?: boolean
  reuseReset?: boolean
  noSupervisor?: boolean
  workers?: number | string
  testList?: string
  passthrough?: readonly string[]
  filterOutput?: boolean
}

export interface E2eExecutionRequest extends E2eCommandRequest {
  suite?: string
  file?: readonly string[]
}

export interface E2eStepCommandOptions extends E2eCommandRequest {
  step: E2eStepDefinition
}

export interface E2eRunPlannerOptions extends E2eCommandRequest {
  suite?: string
  file?: readonly string[]
  hostAdapter: E2eHostAdapter
}

export interface PlannedE2eRunStep {
  suiteId: string
  batchKey: string
  envProfile?: string
  runner: E2eRunnerKind
  logName: string
  reportDir?: string
  command: string
  args: string[]
  env?: Record<string, string>
}

export interface PlannedE2eRunGroup {
  batchKey: string
  envProfile?: string
  runs: PlannedE2eRunStep[]
  env?: Record<string, string>
}
