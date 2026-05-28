import { createHash } from 'node:crypto'
import { existsSync } from 'node:fs'
import { dirname, resolve } from 'node:path'
import { fileURLToPath, pathToFileURL } from 'node:url'

type Manifest = {
  bun: string
  claude: string
  node: string
  model: string
  plugins: {
    main: string
    v1: string
    v2: string
  }
}

type Usage = {
  input_tokens: number
  output_tokens: number
  cache_creation_input_tokens: number
  cache_read_input_tokens: number
  duration_ms: number
}

type RunResult =
  | {
      ok: true
      usage: Usage
      tools: string[]
      transcript_path: string
      home_dir: string
    }
  | {
      ok: false
      error: 'rate_limit' | 'spawn_failed'
      usage: null
      tools: []
      transcript_path: null
      home_dir: string
    }

type Scenario = {
  scenario_id: string
  description: string
  worst_case_token_count: number
  prompt_turns: Array<{
    session_id: string
    turn_idx: number
    role: 'user' | 'assistant'
    text: string
    estimated_tokens: number
  }>
  expected_tool_calls: string[]
  qrels: Array<{
    question: string
    expected_substring_in_response: string
  }>
}

type WorkspaceConfig = {
  mode: 'isolated' | 'single-workspace'
  cacheDisclaimer: string | null
  keyEnvNames: string[]
  adminVerification: 'required-for-proof' | 'operator-asserted' | 'not-applicable'
}

type WorkspaceIdentity = {
  workspaceId: string
  apiKeyEnv: string
}

type CostSummary = {
  mean: number
  std: number
  n: number
  total: number
}

type SessionMemoryReport = {
  run_id: string
  model: string
  dry_run: boolean
  cache_disclaimer: string | null
  cells: Array<{
    scenario_id: string
    variant: string
    trials: number
    status: 'ok' | 'rate_limit' | 'spawn_failed'
    cost_usd: number
    recall_at_5: number
    wall_sec: number
  }>
}

type BenchVariant = 'baseline' | 'context-mode' | 'v1' | 'v2'

export type RunBenchSessionMemoryInput = {
  allVariants?: boolean
  cwd?: string
  dryRun?: boolean
  env?: NodeJS.ProcessEnv
  model?: string
  outputRoot?: string
  scenario?: string
  trials?: number
  variant?: string
}

export type RunBenchSessionMemoryResult = {
  exitCode: number
  runId: string
  dryRun: boolean
  reportPath: string | null
  cellCount: number
}

type RuntimeModules = {
  aggregateCosts: (usages: Usage[], pricing: unknown, model: string) => CostSummary
  captureManifest: () => Promise<Manifest>
  loadAllScenarios: () => Scenario[]
  loadManifest: () => Manifest
  loadPricing: () => unknown
  resolveWorkspaceConfig: (env?: NodeJS.ProcessEnv) => WorkspaceConfig
  resolveWorkspaceIdentitiesFromEnv: (env?: NodeJS.ProcessEnv) => WorkspaceIdentity[]
  runCell: (input: {
    scenario: string
    prompt: string
    variant: string
    trial: number
    pluginDir: string
    runId?: string
    cwd?: string
    outputRoot?: string
    apiKeys?: Record<string, string | undefined>
  }) => Promise<RunResult>
  validateKnownAnthropicWorkspaces: (
    identities: WorkspaceIdentity[],
    adminKey: string,
  ) => Promise<void>
  validateWorkspaceKeyPresence: (config: WorkspaceConfig, env?: NodeJS.ProcessEnv) => void
  verifyManifest: (captured: Manifest, pinned: Manifest) => void
  writeReport: (report: SessionMemoryReport, outPath: string) => void
}

export type RunBenchSessionMemoryDeps = RuntimeModules

const DEFAULT_VARIANTS: readonly BenchVariant[] = ['baseline', 'context-mode', 'v1', 'v2']
const DEFAULT_MODEL = 'claude-sonnet-4-5'

function resolveRepoRoot(fromUrl: string): string {
  let current = dirname(fileURLToPath(fromUrl))

  while (true) {
    if (existsSync(resolve(current, 'package.json'))) {
      return current
    }

    const parent = dirname(current)
    if (parent === current) {
      throw new Error(`Unable to resolve repo root from ${fromUrl}`)
    }
    current = parent
  }
}

const REPO_ROOT = resolveRepoRoot(import.meta.url)
const DEFAULT_OUTPUT_ROOT = resolve(REPO_ROOT, 'scripts', 'bench', 'runs')

export function getBenchSessionMemoryHelpText(): string {
  return [
    'Run the session-memory benchmark harness.',
    '',
    'Examples:',
    '  wp bench session-memory --dry-run',
    '  wp bench session-memory --scenario debug-long-session --variant baseline --trials 1',
    '  wp bench session-memory --scenario all --all-variants',
  ].join('\n')
}

function stableStringify(value: unknown): string {
  if (Array.isArray(value)) {
    return `[${value.map((item) => stableStringify(item)).join(',')}]`
  }
  if (value && typeof value === 'object') {
    const entries = Object.entries(value as Record<string, unknown>)
      .sort(([left], [right]) => left.localeCompare(right))
      .map(([key, inner]) => `${JSON.stringify(key)}:${stableStringify(inner)}`)
    return `{${entries.join(',')}}`
  }
  return JSON.stringify(value)
}

export function createRunId(manifest: Manifest): string {
  return createHash('sha256').update(stableStringify(manifest)).digest('hex').slice(0, 12)
}

function normalizeTrials(input: RunBenchSessionMemoryInput): number {
  if (typeof input.trials === 'number' && Number.isFinite(input.trials) && input.trials > 0) {
    return Math.floor(input.trials)
  }
  return input.allVariants ? 2 : 1
}

function resolveVariants(input: RunBenchSessionMemoryInput): BenchVariant[] {
  if (input.allVariants) {
    return [...DEFAULT_VARIANTS]
  }

  if (input.variant) {
    if (!DEFAULT_VARIANTS.includes(input.variant as BenchVariant)) {
      throw new Error(`Unknown bench variant: ${input.variant}`)
    }
    return [input.variant as BenchVariant]
  }

  return ['baseline']
}

function resolveSelectedScenarios(allScenarios: Scenario[], input: RunBenchSessionMemoryInput): Scenario[] {
  const requested = input.scenario ?? 'all'
  if (requested === 'all') {
    return allScenarios
  }

  const scenario = allScenarios.find((candidate) => candidate.scenario_id === requested)
  if (!scenario) {
    throw new Error(`Unknown bench scenario: ${requested}`)
  }
  return [scenario]
}

function scenarioPrompt(scenario: Scenario): string {
  return scenario.prompt_turns
    .filter((turn) => turn.role === 'user')
    .sort((left, right) => left.turn_idx - right.turn_idx)
    .map((turn) => turn.text)
    .join('\n\n')
}

function pluginDirForVariant(cwd: string, variant: BenchVariant, env: NodeJS.ProcessEnv): string {
  switch (variant) {
    case 'baseline':
      return env.BENCH_PLUGIN_BASELINE ?? cwd
    case 'context-mode':
      return env.BENCH_PLUGIN_CONTEXT_MODE ?? cwd
    case 'v1':
      return env.BENCH_PLUGIN_V1 ?? cwd
    case 'v2':
      return env.BENCH_PLUGIN_V2 ?? cwd
  }
}

function apiKeyMapFromEnv(env: NodeJS.ProcessEnv): Record<string, string | undefined> {
  return {
    ANTHROPIC_API_KEY_BASELINE: env.ANTHROPIC_API_KEY_BASELINE ?? env.ANTHROPIC_API_KEY,
    ANTHROPIC_API_KEY_CONTEXT_MODE: env.ANTHROPIC_API_KEY_CONTEXT_MODE ?? env.ANTHROPIC_API_KEY,
    ANTHROPIC_API_KEY_V1: env.ANTHROPIC_API_KEY_V1,
    ANTHROPIC_API_KEY_V2: env.ANTHROPIC_API_KEY_V2,
  }
}

async function loadRuntimeModules(): Promise<RuntimeModules> {
  const [
    manifestModule,
    scenarioModule,
    costModule,
    runnerModule,
    reportModule,
  ] = await Promise.all([
    import(pathToFileURL(resolve(REPO_ROOT, 'scripts', 'bench', 'lib', 'manifest.ts')).href),
    import(pathToFileURL(resolve(REPO_ROOT, 'scripts', 'bench', 'scenarios', '_schema.ts')).href),
    import(pathToFileURL(resolve(REPO_ROOT, 'scripts', 'bench', 'lib', 'cost-aggregator.ts')).href),
    import(pathToFileURL(resolve(REPO_ROOT, 'scripts', 'bench', 'lib', 'variant-runner.ts')).href),
    import(pathToFileURL(resolve(REPO_ROOT, 'scripts', 'bench', 'lib', 'report-writer.ts')).href),
  ])

  return {
    aggregateCosts: costModule.aggregateCosts,
    captureManifest: manifestModule.captureManifest,
    loadAllScenarios: scenarioModule.loadAllScenarios,
    loadManifest: manifestModule.loadManifest,
    loadPricing: costModule.loadPricing,
    resolveWorkspaceConfig: manifestModule.resolveWorkspaceConfig,
    resolveWorkspaceIdentitiesFromEnv: manifestModule.resolveWorkspaceIdentitiesFromEnv,
    runCell: runnerModule.runCell,
    validateKnownAnthropicWorkspaces: manifestModule.validateKnownAnthropicWorkspaces,
    validateWorkspaceKeyPresence: manifestModule.validateWorkspaceKeyPresence,
    verifyManifest: manifestModule.verifyManifest,
    writeReport: reportModule.writeReport,
  }
}

async function runWorkspacePreflight(
  runtime: RuntimeModules,
  workspaceConfig: WorkspaceConfig,
  env: NodeJS.ProcessEnv,
): Promise<void> {
  runtime.validateWorkspaceKeyPresence(workspaceConfig, env)

  if (workspaceConfig.mode !== 'isolated') {
    return
  }

  const identities = runtime.resolveWorkspaceIdentitiesFromEnv(env)
  const adminKey = env.ANTHROPIC_ADMIN_KEY
  if (
    workspaceConfig.adminVerification === 'required-for-proof' &&
    typeof adminKey === 'string' &&
    adminKey.length > 0
  ) {
    await runtime.validateKnownAnthropicWorkspaces(identities, adminKey)
  }
}

export async function runBenchSessionMemoryCommand(
  input: RunBenchSessionMemoryInput,
  deps?: RunBenchSessionMemoryDeps,
): Promise<RunBenchSessionMemoryResult> {
  const runtime = deps ?? (await loadRuntimeModules())
  const cwd = input.cwd ?? process.cwd()
  const env = input.env ?? process.env

  const pinned = runtime.loadManifest()
  const captured = await runtime.captureManifest()
  runtime.verifyManifest(captured, pinned)

  const workspaceConfig = runtime.resolveWorkspaceConfig(env)
  await runWorkspacePreflight(runtime, workspaceConfig, env)

  const allScenarios = runtime.loadAllScenarios()
  const scenarios = resolveSelectedScenarios(allScenarios, input)
  const variants = resolveVariants(input)
  const trials = normalizeTrials(input)
  const runId = createRunId(pinned)
  const outputRoot = input.outputRoot ?? DEFAULT_OUTPUT_ROOT

  if (input.dryRun) {
    return {
      exitCode: 0,
      runId,
      dryRun: true,
      reportPath: null,
      cellCount: scenarios.length * variants.length,
    }
  }

  const pricing = runtime.loadPricing()
  const model = input.model ?? pinned.model ?? DEFAULT_MODEL
  const apiKeys = apiKeyMapFromEnv(env)
  const cells: SessionMemoryReport['cells'] = []

  for (const scenario of scenarios) {
    for (const variant of variants) {
      const results: RunResult[] = []

      for (let trial = 1; trial <= trials; trial += 1) {
        results.push(
          await runtime.runCell({
            scenario: scenario.scenario_id,
            prompt: scenarioPrompt(scenario),
            variant,
            trial,
            pluginDir: pluginDirForVariant(cwd, variant, env),
            runId,
            cwd,
            outputRoot,
            apiKeys,
          }),
        )
      }

      const okResults = results.filter((result): result is Extract<RunResult, { ok: true }> => result.ok)
      const failed = results.find((result): result is Extract<RunResult, { ok: false }> => !result.ok)
      const costSummary =
        okResults.length > 0
          ? runtime.aggregateCosts(
              okResults.map((result) => result.usage),
              pricing,
              model || DEFAULT_MODEL,
            )
          : { mean: 0, std: 0, n: 0, total: 0 }
      const wallSec =
        okResults.length > 0
          ? Number(
              (
                okResults.reduce((sum, result) => sum + result.usage.duration_ms, 0) /
                okResults.length /
                1000
              ).toFixed(6),
            )
          : 0

      cells.push({
        scenario_id: scenario.scenario_id,
        variant,
        trials,
        status: failed?.error ?? 'ok',
        cost_usd: costSummary.total,
        recall_at_5: 0,
        wall_sec: wallSec,
      })
    }
  }

  const reportPath = resolve(outputRoot, runId, 'report.md')
  runtime.writeReport(
    {
      run_id: runId,
      model,
      dry_run: false,
      cache_disclaimer: workspaceConfig.cacheDisclaimer,
      cells,
    },
    reportPath,
  )

  return {
    exitCode: 0,
    runId,
    dryRun: false,
    reportPath,
    cellCount: cells.length,
  }
}
