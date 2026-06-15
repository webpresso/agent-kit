import { createHash } from 'node:crypto'
import { existsSync, readFileSync } from 'node:fs'
import { dirname, resolve } from 'node:path'
import { fileURLToPath, pathToFileURL } from 'node:url'

type ManifestVerificationMode = 'strict' | 'dry-run-current-checkout'

type VerifyManifestOptions = {
  mode?: ManifestVerificationMode
}

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

type TranscriptRecallScore = {
  recall_at_5: number
  recall_reason?: string
  recall_error?: string
}

type WorkspaceConfig = {
  mode: 'isolated' | 'single-workspace'
  cacheDisclaimer: string | null
  keyEnvNames: string[]
  authMode: 'api-key' | 'claude-login'
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
    recall_reason?: string
    recall_error?: string
    wall_sec: number
  }>
  threshold_report?: SessionMemoryThresholdReport
}

type BenchVariant = 'baseline' | 'v1' | 'v2'

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
  thresholdReport: SessionMemoryThresholdReport
}

export const DEFAULT_SESSION_MEMORY_THRESHOLDS = {
  postToolCaptureLatencyMs: 750,
  precompactSnapshotLatencyMs: 1000,
  startupResumeInjectionLatencyMs: 750,
  routingInjectionCoverage: 1,
  pretoolSessionRedirectCoverage: 1,
  postToolBatchSummaryCoverage: 1,
  repairPathCoverage: 1,
  searchQualityRecallAt5: 0.8,
} as const

export type SessionMemoryThresholdAxisId =
  | 'post_tool_capture_latency_ms'
  | 'precompact_snapshot_latency_ms'
  | 'startup_resume_injection_latency_ms'
  | 'routing_injection_coverage'
  | 'pretool_session_redirect_coverage'
  | 'posttoolbatch_summary_coverage'
  | 'repair_path_coverage'
  | 'search_quality_recall_at_5'

export type SessionMemoryThresholdAxis = {
  readonly id: SessionMemoryThresholdAxisId
  readonly label: string
  readonly metric: 'latency_ms' | 'recall_at_5' | 'coverage_ratio'
  readonly threshold: number
  readonly observed: number | null
  readonly status: 'schema-valid' | 'passed' | 'failed'
}

export type SessionMemoryThresholdReport = {
  readonly mode: 'dry-run' | 'measured'
  readonly axes: readonly SessionMemoryThresholdAxis[]
}

export type SessionMemoryEnforcementCoverage = {
  readonly routingInjectionCoverage: number
  readonly pretoolSessionRedirectCoverage: number
  readonly postToolBatchSummaryCoverage: number
  readonly repairPathCoverage: number
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
    authMode?: WorkspaceConfig['authMode']
    claudeHome?: string
  }) => Promise<RunResult>
  scoreTranscriptRecall: (input: {
    transcriptPath: string
    qrels: Scenario['qrels']
  }) => TranscriptRecallScore
  validateKnownAnthropicWorkspaces: (
    identities: WorkspaceIdentity[],
    adminKey: string,
  ) => Promise<void>
  validateWorkspaceKeyPresence: (config: WorkspaceConfig, env?: NodeJS.ProcessEnv) => void
  verifyManifest: (captured: Manifest, pinned: Manifest, options?: VerifyManifestOptions) => void
  writeReport: (report: SessionMemoryReport, outPath: string) => void
}

export type RunBenchSessionMemoryDeps = RuntimeModules

const DEFAULT_VARIANTS: readonly BenchVariant[] = ['baseline', 'v1', 'v2']
const DEFAULT_MODEL = 'claude-sonnet-4-5'
const BENCH_RUNTIME_MODULE_PATHS = [
  ['scripts', 'bench', 'lib', 'manifest.ts'],
  ['scripts', 'bench', 'scenarios', '_schema.ts'],
  ['scripts', 'bench', 'lib', 'cost-aggregator.ts'],
  ['scripts', 'bench', 'lib', 'variant-runner.ts'],
  ['scripts', 'bench', 'lib', 'report-writer.ts'],
  ['scripts', 'bench', 'lib', 'transcript-scorer.ts'],
] as const

export function isBunSingleFileUrl(fromUrl: string): boolean {
  return fromUrl.startsWith('file:///$bunfs/root') || fromUrl.startsWith('file:///__bunfs__/root')
}

export function resolveRepoRoot(fromUrl: string, fallbackRoot = process.cwd()): string {
  let current = isBunSingleFileUrl(fromUrl) ? fallbackRoot : dirname(fileURLToPath(fromUrl))

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

export function assertBenchRuntimeAssets(repoRoot: string): void {
  const packageJsonPath = resolve(repoRoot, 'package.json')
  let packageName: unknown = null
  try {
    packageName = JSON.parse(readFileSync(packageJsonPath, 'utf8'))?.name
  } catch {
    packageName = null
  }

  if (packageName !== '@webpresso/agent-kit') {
    throw new Error(
      [
        'wp bench session-memory refuses to load benchmark assets from a non-agent-kit package root.',
        `Resolved package root: ${repoRoot}.`,
        `Expected package.json#name to be @webpresso/agent-kit, found ${String(packageName)}.`,
        'Run this benchmark from an @webpresso/agent-kit source checkout or built JS install with bench assets available.',
      ].join(' '),
    )
  }

  const missing = BENCH_RUNTIME_MODULE_PATHS.map((parts) => resolve(repoRoot, ...parts)).filter(
    (candidate) => !existsSync(candidate),
  )

  if (missing.length === 0) return

  throw new Error(
    [
      'wp bench session-memory requires bench source assets that are not available in this runtime context.',
      `Resolved package root: ${repoRoot}.`,
      `Missing required asset: ${missing[0]}.`,
      'Run this benchmark from an @webpresso/agent-kit source checkout or built JS install with bench assets available; the compiled runtime supports `wp bench --help` but does not silently load benchmark assets from the caller project.',
    ].join(' '),
  )
}

export function resolveBenchRuntimeRoot(
  fromUrl = import.meta.url,
  fallbackRoot = process.cwd(),
): string {
  if (isBunSingleFileUrl(fromUrl)) {
    throw new Error(
      [
        'wp bench session-memory is not available from the compiled single-file runtime because benchmark assets are source-only.',
        'The compiled runtime supports `wp bench --help` and `wp bench session-memory --help`, but refuses to resolve benchmark assets from the caller cwd.',
        'Run this benchmark from an @webpresso/agent-kit source checkout or built JS install with bench assets available.',
      ].join(' '),
    )
  }

  const repoRoot = resolveRepoRoot(fromUrl, fallbackRoot)
  assertBenchRuntimeAssets(repoRoot)
  return repoRoot
}

export function assertBenchSessionMemorySupportedRuntime(
  env: NodeJS.ProcessEnv = process.env,
): void {
  if (env.WP_COMPILED_RUNTIME !== '1') return

  throw new Error(
    [
      'wp bench session-memory is not available from the compiled runtime because benchmark assets are source-only.',
      'The compiled runtime supports `wp bench --help` and `wp bench session-memory --help`, but refuses to execute source-dependent benchmark assets.',
      'Run this benchmark from an @webpresso/agent-kit source checkout or built JS install with bench assets available.',
    ].join(' '),
  )
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

function resolveSelectedScenarios(
  allScenarios: Scenario[],
  input: RunBenchSessionMemoryInput,
): Scenario[] {
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
    case 'v1':
      return env.BENCH_PLUGIN_V1 ?? cwd
    case 'v2':
      return env.BENCH_PLUGIN_V2 ?? cwd
  }
}

function apiKeyMapFromEnv(env: NodeJS.ProcessEnv): Record<string, string | undefined> {
  return {
    ANTHROPIC_API_KEY_BASELINE: env.ANTHROPIC_API_KEY_BASELINE ?? env.ANTHROPIC_API_KEY,
    ANTHROPIC_API_KEY_V1: env.ANTHROPIC_API_KEY_V1,
    ANTHROPIC_API_KEY_V2: env.ANTHROPIC_API_KEY_V2,
  }
}


function readRepoText(repoRoot: string, relativePath: string): string {
  const filePath = resolve(repoRoot, relativePath)
  return existsSync(filePath) ? readFileSync(filePath, 'utf8') : ''
}

function coverageRatio(checks: readonly boolean[]): number {
  if (checks.length === 0) return 0
  return checks.filter(Boolean).length / checks.length
}

export function assessSessionMemoryEnforcementCoverage(
  repoRoot: string = resolveBenchRuntimeRoot(),
): SessionMemoryEnforcementCoverage {
  const routingBlock = readRepoText(repoRoot, 'src/hooks/shared/routing-block.ts')
  const routingTests = readRepoText(repoRoot, 'src/hooks/shared/routing-block.test.ts')
  const pretool = readRepoText(repoRoot, 'src/hooks/pretool-guard/dev-routing.ts')
  const pretoolTests = readRepoText(repoRoot, 'src/hooks/pretool-guard/dev-routing.test.ts')
  const batchSummary = readRepoText(repoRoot, 'src/hooks/post-tool/batch-summary.ts')
  const batchHandler = readRepoText(repoRoot, 'src/hooks/post-tool/posttoolbatch.ts')
  const batchTests = readRepoText(repoRoot, 'src/hooks/post-tool/posttoolbatch.test.ts')
  const doctorTests = readRepoText(repoRoot, 'src/hooks/doctor.test.ts')
  const hookScaffold = readRepoText(repoRoot, 'src/cli/commands/init/scaffolders/agent-hooks/index.ts')

  return {
    routingInjectionCoverage: coverageRatio([
      routingBlock.includes('<wp_session_context>'),
      routingBlock.includes('wp_session_execute_file'),
      routingBlock.includes('wp_session_fetch_and_index'),
      routingTests.includes('context-window protection'),
    ]),
    pretoolSessionRedirectCoverage: coverageRatio([
      pretool.includes('routeToolInputToSessionMemory'),
      pretool.includes('wp_session_execute_file'),
      pretool.includes('wp_session_fetch_and_index'),
      pretoolTests.includes('routes raw host context-heavy tool inputs'),
    ]),
    postToolBatchSummaryCoverage: coverageRatio([
      hookScaffold.includes('PostToolBatch'),
      batchSummary.includes('redactText'),
      batchHandler.includes('post-tool-batch-hook'),
      batchTests.includes('bounded fail-open'),
    ]),
    repairPathCoverage: coverageRatio([
      doctorTests.includes('wp-pretool-guard'),
      doctorTests.includes('doctor'),
      hookScaffold.includes('PRETOOL_GUARD_MISSING_DENY'),
      hookScaffold.includes('wp not found on PATH'),
    ]),
  }
}

export function buildSessionMemoryThresholdReport(input: {
  readonly dryRun: boolean
  readonly averageLatencyMs?: number
  readonly averageRecallAt5?: number
  readonly recallStatusValue?: number
  readonly recallFailure?: boolean
  readonly enforcementCoverage?: SessionMemoryEnforcementCoverage
}): SessionMemoryThresholdReport {
  const latencyObserved = input.dryRun ? null : (input.averageLatencyMs ?? 0)
  const recallObserved = input.dryRun ? null : (input.averageRecallAt5 ?? 0)
  const recallStatusValue = input.dryRun
    ? null
    : (input.recallStatusValue ?? input.averageRecallAt5 ?? 0)
  const latencyStatus = (threshold: number): SessionMemoryThresholdAxis['status'] => {
    if (input.dryRun) return 'schema-valid'
    return (latencyObserved ?? Number.POSITIVE_INFINITY) <= threshold ? 'passed' : 'failed'
  }
  const recallStatus = (threshold: number): SessionMemoryThresholdAxis['status'] => {
    if (input.dryRun) return 'schema-valid'
    if (input.recallFailure) return 'failed'
    return (recallStatusValue ?? 0) >= threshold ? 'passed' : 'failed'
  }
  const coverageObserved = (key: keyof SessionMemoryEnforcementCoverage): number | null => {
    if (input.dryRun) return null
    return input.enforcementCoverage?.[key] ?? 0
  }
  const coverageStatus = (
    key: keyof SessionMemoryEnforcementCoverage,
    threshold: number,
  ): SessionMemoryThresholdAxis['status'] => {
    if (input.dryRun) return 'schema-valid'
    return (input.enforcementCoverage?.[key] ?? 0) >= threshold ? 'passed' : 'failed'
  }

  return {
    mode: input.dryRun ? 'dry-run' : 'measured',
    axes: [
      {
        id: 'post_tool_capture_latency_ms',
        label: 'PostToolUse capture latency',
        metric: 'latency_ms',
        threshold: DEFAULT_SESSION_MEMORY_THRESHOLDS.postToolCaptureLatencyMs,
        observed: latencyObserved,
        status: latencyStatus(DEFAULT_SESSION_MEMORY_THRESHOLDS.postToolCaptureLatencyMs),
      },
      {
        id: 'precompact_snapshot_latency_ms',
        label: 'PreCompact snapshot latency',
        metric: 'latency_ms',
        threshold: DEFAULT_SESSION_MEMORY_THRESHOLDS.precompactSnapshotLatencyMs,
        observed: latencyObserved,
        status: latencyStatus(DEFAULT_SESSION_MEMORY_THRESHOLDS.precompactSnapshotLatencyMs),
      },
      {
        id: 'startup_resume_injection_latency_ms',
        label: 'SessionStart resume injection latency',
        metric: 'latency_ms',
        threshold: DEFAULT_SESSION_MEMORY_THRESHOLDS.startupResumeInjectionLatencyMs,
        observed: latencyObserved,
        status: latencyStatus(DEFAULT_SESSION_MEMORY_THRESHOLDS.startupResumeInjectionLatencyMs),
      },
      {
        id: 'routing_injection_coverage',
        label: 'Routing injection enforcement coverage',
        metric: 'coverage_ratio',
        threshold: DEFAULT_SESSION_MEMORY_THRESHOLDS.routingInjectionCoverage,
        observed: coverageObserved('routingInjectionCoverage'),
        status: coverageStatus(
          'routingInjectionCoverage',
          DEFAULT_SESSION_MEMORY_THRESHOLDS.routingInjectionCoverage,
        ),
      },
      {
        id: 'pretool_session_redirect_coverage',
        label: 'PreToolUse session redirect coverage',
        metric: 'coverage_ratio',
        threshold: DEFAULT_SESSION_MEMORY_THRESHOLDS.pretoolSessionRedirectCoverage,
        observed: coverageObserved('pretoolSessionRedirectCoverage'),
        status: coverageStatus(
          'pretoolSessionRedirectCoverage',
          DEFAULT_SESSION_MEMORY_THRESHOLDS.pretoolSessionRedirectCoverage,
        ),
      },
      {
        id: 'posttoolbatch_summary_coverage',
        label: 'PostToolBatch bounded summary coverage',
        metric: 'coverage_ratio',
        threshold: DEFAULT_SESSION_MEMORY_THRESHOLDS.postToolBatchSummaryCoverage,
        observed: coverageObserved('postToolBatchSummaryCoverage'),
        status: coverageStatus(
          'postToolBatchSummaryCoverage',
          DEFAULT_SESSION_MEMORY_THRESHOLDS.postToolBatchSummaryCoverage,
        ),
      },
      {
        id: 'repair_path_coverage',
        label: 'Hook doctor repair-path coverage',
        metric: 'coverage_ratio',
        threshold: DEFAULT_SESSION_MEMORY_THRESHOLDS.repairPathCoverage,
        observed: coverageObserved('repairPathCoverage'),
        status: coverageStatus(
          'repairPathCoverage',
          DEFAULT_SESSION_MEMORY_THRESHOLDS.repairPathCoverage,
        ),
      },
      {
        id: 'search_quality_recall_at_5',
        label: 'Search quality recall@5',
        metric: 'recall_at_5',
        threshold: DEFAULT_SESSION_MEMORY_THRESHOLDS.searchQualityRecallAt5,
        observed: recallObserved,
        status: recallStatus(DEFAULT_SESSION_MEMORY_THRESHOLDS.searchQualityRecallAt5),
      },
    ],
  }
}

async function loadRuntimeModules(repoRoot = resolveBenchRuntimeRoot()): Promise<RuntimeModules> {
  const [manifestModule, scenarioModule, costModule, runnerModule, reportModule, scorerModule] =
    await Promise.all([
      import(pathToFileURL(resolve(repoRoot, 'scripts', 'bench', 'lib', 'manifest.ts')).href),
      import(pathToFileURL(resolve(repoRoot, 'scripts', 'bench', 'scenarios', '_schema.ts')).href),
      import(
        pathToFileURL(resolve(repoRoot, 'scripts', 'bench', 'lib', 'cost-aggregator.ts')).href
      ),
      import(pathToFileURL(resolve(repoRoot, 'scripts', 'bench', 'lib', 'variant-runner.ts')).href),
      import(pathToFileURL(resolve(repoRoot, 'scripts', 'bench', 'lib', 'report-writer.ts')).href),
      import(
        pathToFileURL(resolve(repoRoot, 'scripts', 'bench', 'lib', 'transcript-scorer.ts')).href
      ),
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
    scoreTranscriptRecall: scorerModule.scoreTranscriptRecall,
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
  options: { readonly requireApiKeys: boolean; readonly allowAdminVerification: boolean } = {
    requireApiKeys: true,
    allowAdminVerification: true,
  },
): Promise<void> {
  if (options.requireApiKeys) {
    runtime.validateWorkspaceKeyPresence(workspaceConfig, env)
  }

  if (workspaceConfig.mode !== 'isolated') {
    return
  }

  const identities = runtime.resolveWorkspaceIdentitiesFromEnv(env)
  const adminKey = env.ANTHROPIC_ADMIN_KEY
  if (
    options.allowAdminVerification &&
    workspaceConfig.adminVerification === 'required-for-proof' &&
    typeof adminKey === 'string' &&
    adminKey.length > 0
  ) {
    await runtime.validateKnownAnthropicWorkspaces(identities, adminKey)
  }
}

function resolveWorkspaceConfigForRun(
  runtime: RuntimeModules,
  env: NodeJS.ProcessEnv,
  options: { readonly dryRun: boolean },
): WorkspaceConfig {
  if (
    options.dryRun &&
    env.BENCH_WORKSPACE_MODE !== 'isolated' &&
    env.BENCH_WORKSPACE_MODE !== 'single-workspace'
  ) {
    return runtime.resolveWorkspaceConfig({ ...env, BENCH_WORKSPACE_MODE: 'single-workspace' })
  }

  return runtime.resolveWorkspaceConfig(env)
}

export async function runBenchSessionMemoryCommand(
  input: RunBenchSessionMemoryInput,
  deps?: RunBenchSessionMemoryDeps,
): Promise<RunBenchSessionMemoryResult> {
  assertBenchSessionMemorySupportedRuntime(input.env)

  let runtimeRoot: string | undefined
  const runtime = deps
    ? deps
    : await (async () => {
        runtimeRoot = resolveBenchRuntimeRoot()
        return loadRuntimeModules(runtimeRoot)
      })()
  const cwd = input.cwd ?? process.cwd()
  const env = input.env ?? process.env

  const pinned = runtime.loadManifest()
  const captured = await runtime.captureManifest()
  runtime.verifyManifest(captured, pinned, {
    mode: input.dryRun ? 'dry-run-current-checkout' : 'strict',
  })

  const workspaceConfig = resolveWorkspaceConfigForRun(runtime, env, {
    dryRun: Boolean(input.dryRun),
  })
  await runWorkspacePreflight(runtime, workspaceConfig, env, {
    requireApiKeys: !input.dryRun,
    allowAdminVerification: !input.dryRun,
  })

  const allScenarios = runtime.loadAllScenarios()
  const scenarios = resolveSelectedScenarios(allScenarios, input)
  const variants = resolveVariants(input)
  const trials = normalizeTrials(input)
  const runId = createRunId(pinned)
  const outputRoot =
    input.outputRoot ?? resolve(runtimeRoot ?? process.cwd(), 'scripts', 'bench', 'runs')

  if (input.dryRun) {
    return {
      exitCode: 0,
      runId,
      dryRun: true,
      reportPath: null,
      cellCount: scenarios.length * variants.length,
      thresholdReport: buildSessionMemoryThresholdReport({ dryRun: true }),
    }
  }

  const pricing = runtime.loadPricing()
  const model = input.model ?? pinned.model ?? DEFAULT_MODEL
  const apiKeys = apiKeyMapFromEnv(env)
  const cells: SessionMemoryReport['cells'] = []
  const thresholdRecallValues: number[] = []
  let recallFailure = false

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
            authMode: workspaceConfig.authMode,
            claudeHome: env.BENCH_CLAUDE_HOME ?? env.HOME,
          }),
        )
      }

      const okResults = results.filter(
        (result): result is Extract<RunResult, { ok: true }> => result.ok,
      )
      const failed = results.find(
        (result): result is Extract<RunResult, { ok: false }> => !result.ok,
      )
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
      const recallScores = results.map((result): TranscriptRecallScore => {
        if (!result.ok) {
          return {
            recall_at_5: 0,
            recall_error: result.error,
          }
        }

        return runtime.scoreTranscriptRecall({
          transcriptPath: result.transcript_path,
          qrels: scenario.qrels,
        })
      })
      const averageRecallAt5 =
        recallScores.length > 0
          ? recallScores.reduce((sum, score) => sum + score.recall_at_5, 0) / recallScores.length
          : 0
      const recallError = recallScores.find((score) => score.recall_error)?.recall_error
      thresholdRecallValues.push(averageRecallAt5)
      if (failed || recallError) {
        recallFailure = true
      }
      const recallReason = recallError
        ? undefined
        : recallScores
            .map((score) => score.recall_reason)
            .filter((reason): reason is string => typeof reason === 'string' && reason.length > 0)
            .join('; ')

      cells.push({
        scenario_id: scenario.scenario_id,
        variant,
        trials,
        status: failed?.error ?? 'ok',
        cost_usd: costSummary.total,
        recall_at_5: Number(averageRecallAt5.toFixed(6)),
        ...(recallError ? { recall_error: recallError } : {}),
        ...(recallReason ? { recall_reason: recallReason } : {}),
        wall_sec: wallSec,
      })
    }
  }

  const reportPath = resolve(outputRoot, runId, 'report.md')
  const successfulCells = cells.filter((cell) => cell.status === 'ok')
  const averageWallMs =
    successfulCells.length > 0
      ? (successfulCells.reduce((sum, cell) => sum + cell.wall_sec, 0) / successfulCells.length) *
        1000
      : 0
  const averageRecallAt5 =
    thresholdRecallValues.length > 0
      ? thresholdRecallValues.reduce((sum, recall) => sum + recall, 0) /
        thresholdRecallValues.length
      : 0
  const thresholdReport = buildSessionMemoryThresholdReport({
    dryRun: false,
    averageLatencyMs: Number(averageWallMs.toFixed(6)),
    averageRecallAt5: Number(averageRecallAt5.toFixed(6)),
    recallStatusValue: averageRecallAt5,
    recallFailure,
    enforcementCoverage: assessSessionMemoryEnforcementCoverage(runtimeRoot ?? cwd),
  })
  runtime.writeReport(
    {
      run_id: runId,
      model,
      dry_run: false,
      cache_disclaimer: workspaceConfig.cacheDisclaimer,
      cells,
      threshold_report: thresholdReport,
    },
    reportPath,
  )

  return {
    exitCode: 0,
    runId,
    dryRun: false,
    reportPath,
    cellCount: cells.length,
    thresholdReport,
  }
}
