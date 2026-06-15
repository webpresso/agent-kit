#!/usr/bin/env bun
import { spawnSync } from 'node:child_process'
import { existsSync, readFileSync } from 'node:fs'
import { join, resolve } from 'node:path'

import { parse as parseYaml } from 'yaml'
import { z } from 'zod'

const CONSUMERS_PATH = 'catalog/agent/harness-gate/consumers.yaml'
const SURFACES_PATH = 'catalog/agent/harness-surfaces.yaml'

const consumerSchema = z.object({
  id: z.string(),
  repo: z.string(),
  worktreeAlias: z.string(),
  suiteManifest: z.string(),
  harnessSurfaces: z.array(z.string()),
  heldInSuites: z.array(z.string()),
  heldOutSuites: z.array(z.string()),
})
const consumersSchema = z.object({ version: z.literal(1), consumers: z.array(consumerSchema) })
const suiteSchema = z.object({
  id: z.string(),
  tier: z.enum(['held-in', 'held-out']),
  command: z.string(),
  surfaces: z.array(z.string()),
  proof: z.string(),
})
const measurementSchema = z.object({
  consumer: z.string(),
  suiteId: z.string(),
  tier: z.enum(['held-in', 'held-out']),
  attempts: z.number().int().nonnegative(),
  passed: z.number().int().nonnegative(),
  failed: z.number().int().nonnegative(),
  passRate: z.number(),
  meanDurationMs: z.number(),
  varianceDurationMs: z.number(),
})
const measurementsSchema = z.array(measurementSchema)
const suitesSchema = z.object({
  version: z.literal(1),
  consumer: z.string(),
  suites: z.array(suiteSchema),
})
const surfacePathSchema = z.union([z.string(), z.object({ path: z.string() })])
const surfacesSchema = z.object({
  version: z.literal(1),
  surfaces: z.array(
    z.object({ id: z.string(), paths: z.array(surfacePathSchema), evidence: z.array(z.string()) }),
  ),
})

export type HarnessGateConsumer = z.infer<typeof consumerSchema>
export type HarnessGateSuite = z.infer<typeof suiteSchema>
export interface HarnessGatePlanSuite extends HarnessGateSuite {
  consumer: string
  suiteSource: 'manifest' | 'synthetic'
}
export interface HarnessGatePlan {
  consumers: HarnessGateConsumer[]
  suites: HarnessGatePlanSuite[]
}
export interface HarnessGateSuiteResult extends HarnessGatePlanSuite {
  status: 'passed' | 'failed' | 'planned'
  exitCode?: number
  durationMs?: number
}
export interface HarnessGateMeasurement {
  consumer: string
  suiteId: string
  tier: 'held-in' | 'held-out'
  attempts: number
  passed: number
  failed: number
  passRate: number
  meanDurationMs: number
  varianceDurationMs: number
}
export interface HarnessGateDelta {
  consumer: string
  suiteId: string
  tier: 'held-in' | 'held-out'
  baselinePassRate: number
  candidatePassRate: number
  passRateDelta: number
  baselineMeanDurationMs: number
  candidateMeanDurationMs: number
  durationDeltaMs: number
  regressed: boolean
}
export interface HarnessGateVarianceJustification {
  repeatCount: number
  observedMaxVarianceDurationMs: number
  rationale: string
}
export interface HarnessGateVerdict {
  ok: boolean
  mode: 'planned-only' | 'executed'
  comparisonMode: 'selection-only' | 'self-baseline' | 'baseline-candidate'
  plannedOnly: boolean
  manifestBacked: boolean
  triggeredSurfaces: string[]
  coverageFailures: string[]
  repeatCountJustification: HarnessGateVarianceJustification
  deltas: HarnessGateDelta[]
  suites: HarnessGateSuiteResult[]
}
export interface HarnessGateReport extends HarnessGateVerdict {
  summary: string
}

interface SuiteExecutionSample {
  consumer: string
  suiteId: string
  tier: 'held-in' | 'held-out'
  status: 'passed' | 'failed'
  durationMs: number
}

export function loadHarnessGatePlan(rootDirectory: string = process.cwd()): HarnessGatePlan {
  const root = resolve(rootDirectory)
  const consumers = consumersSchema.parse(
    parseYaml(readFileSync(join(root, CONSUMERS_PATH), 'utf8')),
  )
  const suites: HarnessGatePlanSuite[] = []
  for (const consumer of consumers.consumers) {
    const consumerRoot = resolveConsumerRoot(root, consumer)
    const suiteManifestPath = join(consumerRoot, consumer.suiteManifest)
    if (!existsSync(suiteManifestPath)) {
      suites.push(...synthesizeExternalSuites(consumer))
      continue
    }
    const manifest = suitesSchema.parse(parseYaml(readFileSync(suiteManifestPath, 'utf8')))
    if (manifest.consumer !== consumer.id) {
      throw new Error(`${consumer.id} manifest declares consumer ${manifest.consumer}`)
    }
    const declaredSuiteIds = new Set(manifest.suites.map((suite) => suite.id))
    for (const suiteId of [...consumer.heldInSuites, ...consumer.heldOutSuites]) {
      if (!declaredSuiteIds.has(suiteId)) throw new Error(`${consumer.id} missing suite ${suiteId}`)
    }
    suites.push(
      ...manifest.suites.map((suite) => ({
        ...suite,
        consumer: consumer.id,
        suiteSource: 'manifest' as const,
      })),
    )
  }
  return { consumers: consumers.consumers, suites }
}

export function detectTriggeredSurfaces(
  changedFiles: readonly string[],
  rootDirectory: string = process.cwd(),
): string[] {
  const root = resolve(rootDirectory)
  const manifest = surfacesSchema.parse(parseYaml(readFileSync(join(root, SURFACES_PATH), 'utf8')))
  const triggered = new Set<string>()
  for (const surface of manifest.surfaces) {
    const prefixes = [
      ...surface.paths.map((entry) => (typeof entry === 'string' ? entry : entry.path)),
      ...surface.evidence,
    ]
    if (
      changedFiles.some((file) =>
        prefixes.some((prefix) => file === prefix || file.startsWith(`${prefix}/`)),
      )
    ) {
      triggered.add(surface.id)
    }
  }
  return [...triggered].sort()
}

export function collectChangedFilesFromGit(
  input: {
    rootDirectory?: string
    baseRef?: string
    headRef?: string
  } = {},
): string[] {
  const root = resolve(input.rootDirectory ?? process.cwd())
  const baseRef = input.baseRef ?? 'HEAD~1'
  const diffTarget = input.headRef === undefined ? baseRef : `${baseRef}...${input.headRef}`
  const result = spawnSync('git', ['diff', '--name-only', diffTarget], {
    cwd: root,
    encoding: 'utf8',
  })
  if (result.status !== 0) {
    throw new Error(
      result.stderr.trim() || `git diff failed with exit ${result.status ?? 'unknown'}`,
    )
  }
  return result.stdout
    .split('\n')
    .map((line) => line.trim())
    .filter(Boolean)
}

export function buildHarnessGateVerdict(input: {
  plan: HarnessGatePlan
  triggeredSurfaces: readonly string[]
  execute?: boolean
  rootDirectory?: string
  repeatCount?: number
  baselineMeasurements?: readonly HarnessGateMeasurement[]
  candidateMeasurements?: readonly HarnessGateMeasurement[]
}): HarnessGateVerdict {
  const repeatCount = input.repeatCount ?? 1
  if (!Number.isInteger(repeatCount) || repeatCount < 1) {
    throw new Error('repeatCount must be a positive integer')
  }
  const triggered = new Set(input.triggeredSurfaces)
  const selected = input.plan.suites.filter((suite) =>
    suite.surfaces.some((surface) => triggered.has(surface)),
  )
  const suites: HarnessGateSuiteResult[] = []
  const samples: SuiteExecutionSample[] = []
  for (const suite of selected) {
    if (!input.execute) {
      suites.push({ ...suite, status: 'planned' })
      continue
    }
    const consumer = input.plan.consumers.find((entry) => entry.id === suite.consumer)
    if (!consumer) {
      suites.push({ ...suite, status: 'failed', exitCode: 1, durationMs: 0 })
      samples.push({
        consumer: suite.consumer,
        suiteId: suite.id,
        tier: suite.tier,
        status: 'failed',
        durationMs: 0,
      })
      continue
    }
    for (let attempt = 0; attempt < repeatCount; attempt += 1) {
      const started = performance.now()
      const result = spawnSync(suite.command, {
        cwd: resolveConsumerRoot(input.rootDirectory ?? process.cwd(), consumer),
        shell: true,
        stdio: 'inherit',
      })
      const durationMs = Math.round(performance.now() - started)
      const exitCode = result.status ?? 1
      const status = exitCode === 0 ? 'passed' : 'failed'
      suites.push({ ...suite, status, exitCode, durationMs })
      samples.push({
        consumer: suite.consumer,
        suiteId: suite.id,
        tier: suite.tier,
        status,
        durationMs,
      })
    }
  }
  const measurements = measureHarnessGateSamples(samples)
  const hasExternalComparison =
    input.baselineMeasurements !== undefined || input.candidateMeasurements !== undefined
  if (hasExternalComparison && (!input.baselineMeasurements || !input.candidateMeasurements)) {
    throw new Error('baselineMeasurements and candidateMeasurements must be provided together')
  }
  const plannedOnly = !input.execute && !hasExternalComparison
  const comparisonMode = hasExternalComparison
    ? 'baseline-candidate'
    : plannedOnly
      ? 'selection-only'
      : 'self-baseline'
  const selectedSurfaceCoverage = new Set(selected.flatMap((suite) => suite.surfaces))
  const uncoveredTriggeredSurfaceFailures = [...triggered]
    .filter((surface) => !selectedSurfaceCoverage.has(surface))
    .map((surface) => `no harness suite covers triggered surface ${surface}`)
  const selectedSuiteKeys = new Set(selected.map((suite) => suiteKey(suite.consumer, suite.id)))
  const coverageFailures =
    input.baselineMeasurements && input.candidateMeasurements
      ? [
          ...uncoveredTriggeredSurfaceFailures,
          ...compareMeasurementCoverage(
            selectedSuiteKeys,
            input.baselineMeasurements,
            input.candidateMeasurements,
          ),
        ]
      : uncoveredTriggeredSurfaceFailures
  const deltas =
    input.baselineMeasurements && input.candidateMeasurements
      ? compareHarnessGateMeasurements(
          input.baselineMeasurements.filter((measurement) =>
            selectedSuiteKeys.has(measurementKey(measurement)),
          ),
          input.candidateMeasurements.filter((measurement) =>
            selectedSuiteKeys.has(measurementKey(measurement)),
          ),
        )
      : compareHarnessGateMeasurements(measurements, measurements)
  return {
    ok:
      suites.every((suite) => suite.status !== 'failed') &&
      coverageFailures.length === 0 &&
      deltas.every((delta) => !delta.regressed),
    mode: plannedOnly ? 'planned-only' : 'executed',
    comparisonMode,
    plannedOnly,
    manifestBacked: suites.every((suite) => suite.suiteSource === 'manifest'),
    triggeredSurfaces: [...triggered].sort(),
    coverageFailures,
    repeatCountJustification: justifyRepeatCount(measurements, repeatCount),
    deltas,
    suites,
  }
}

function compareMeasurementCoverage(
  selectedKeys: ReadonlySet<string>,
  baseline: readonly HarnessGateMeasurement[],
  candidate: readonly HarnessGateMeasurement[],
): string[] {
  const baselineKeys = new Set(baseline.map((measurement) => measurementKey(measurement)))
  const candidateKeys = new Set(candidate.map((measurement) => measurementKey(measurement)))
  const failures: string[] = []
  for (const key of selectedKeys) {
    const label = suiteKeyLabel(key)
    if (!baselineKeys.has(key)) failures.push(`missing baseline measurement for ${label}`)
    if (!candidateKeys.has(key)) failures.push(`missing candidate measurement for ${label}`)
  }
  return [...new Set(failures)].sort()
}

export function measureHarnessGateSamples(
  samples: readonly SuiteExecutionSample[],
): HarnessGateMeasurement[] {
  const bySuite = new Map<string, SuiteExecutionSample[]>()
  for (const sample of samples) {
    const key = suiteKey(sample.consumer, sample.suiteId)
    const existing = bySuite.get(key) ?? []
    existing.push(sample)
    bySuite.set(key, existing)
  }
  return [...bySuite.entries()].map(([key, suiteSamples]) => {
    const firstSample = suiteSamples[0]
    const attempts = suiteSamples.length
    const passed = suiteSamples.filter((sample) => sample.status === 'passed').length
    const durations = suiteSamples.map((sample) => sample.durationMs)
    const meanDurationMs = mean(durations)
    return {
      consumer: firstSample?.consumer ?? suiteKeyConsumer(key),
      suiteId: firstSample?.suiteId ?? suiteKeyId(key),
      tier: firstSample?.tier ?? 'held-out',
      attempts,
      passed,
      failed: attempts - passed,
      passRate: attempts === 0 ? 0 : passed / attempts,
      meanDurationMs,
      varianceDurationMs: variance(durations, meanDurationMs),
    }
  })
}

export function compareHarnessGateMeasurements(
  baseline: readonly HarnessGateMeasurement[],
  candidate: readonly HarnessGateMeasurement[],
): HarnessGateDelta[] {
  const candidateBySuite = new Map(
    candidate.map((measurement) => [measurementKey(measurement), measurement]),
  )
  return baseline.flatMap((baselineMeasurement) => {
    const candidateMeasurement = candidateBySuite.get(measurementKey(baselineMeasurement))
    if (!candidateMeasurement) return []
    const passRateDelta = candidateMeasurement.passRate - baselineMeasurement.passRate
    const durationDeltaMs = candidateMeasurement.meanDurationMs - baselineMeasurement.meanDurationMs
    return [
      {
        consumer: baselineMeasurement.consumer,
        suiteId: baselineMeasurement.suiteId,
        tier: baselineMeasurement.tier,
        baselinePassRate: baselineMeasurement.passRate,
        candidatePassRate: candidateMeasurement.passRate,
        passRateDelta,
        baselineMeanDurationMs: baselineMeasurement.meanDurationMs,
        candidateMeanDurationMs: candidateMeasurement.meanDurationMs,
        durationDeltaMs,
        regressed: passRateDelta < 0,
      },
    ]
  })
}

function suiteKey(consumer: string, suiteId: string): string {
  return `${consumer}\0${suiteId}`
}

function measurementKey(measurement: Pick<HarnessGateMeasurement, 'consumer' | 'suiteId'>): string {
  return suiteKey(measurement.consumer, measurement.suiteId)
}

function suiteKeyConsumer(key: string): string {
  return key.split('\0', 1)[0] ?? ''
}

function suiteKeyId(key: string): string {
  return key.slice(suiteKeyConsumer(key).length + 1)
}

function suiteKeyLabel(key: string): string {
  const consumer = suiteKeyConsumer(key)
  const suiteId = suiteKeyId(key)
  return `${consumer}/${suiteId}`
}

export function formatHarnessGateReport(verdict: HarnessGateVerdict): HarnessGateReport {
  const suiteCount = verdict.suites.length
  const failedCount = verdict.suites.filter((suite) => suite.status === 'failed').length
  const deltaCount = verdict.deltas.filter((delta) => delta.regressed).length
  const coverageFailureCount = verdict.coverageFailures.length
  const scope = verdict.triggeredSurfaces.join(', ') || 'no harness surfaces'
  const verdictLabel = verdict.plannedOnly
    ? verdict.ok
      ? 'PLAN PASS'
      : 'PLAN FAIL'
    : verdict.ok
      ? 'PASS'
      : 'FAIL'
  const manifestEvidence = verdict.manifestBacked ? 'manifest-backed' : 'synthetic-manifest'
  const summary = `Harness gate ${verdictLabel}: ${verdict.mode}; ${verdict.comparisonMode}; ${manifestEvidence}; ${suiteCount} suite checks; ${failedCount} failures; ${deltaCount} regressions; ${coverageFailureCount} coverage failures; triggered ${scope}.`
  return { summary, ...verdict }
}

function justifyRepeatCount(
  measurements: readonly HarnessGateMeasurement[],
  repeatCount: number,
): HarnessGateVarianceJustification {
  const observedMaxVarianceDurationMs = Math.max(
    0,
    ...measurements.map((measurement) => measurement.varianceDurationMs),
  )
  const rationale =
    measurements.length === 0
      ? `repeatCount=${repeatCount} records selection-only variance; downstream execution is disabled.`
      : `repeatCount=${repeatCount} is reported with observed max duration variance ${observedMaxVarianceDurationMs.toFixed(2)}ms^2 so operators can raise repetitions based on measured instability instead of guessed timeouts.`
  return { repeatCount, observedMaxVarianceDurationMs, rationale }
}

function mean(values: readonly number[]): number {
  if (values.length === 0) return 0
  return values.reduce((total, value) => total + value, 0) / values.length
}

function variance(values: readonly number[], average: number): number {
  if (values.length <= 1) return 0
  return values.reduce((total, value) => total + (value - average) ** 2, 0) / values.length
}

function synthesizeExternalSuites(consumer: HarnessGateConsumer): HarnessGatePlanSuite[] {
  const synthesize = (id: string, tier: 'held-in' | 'held-out'): HarnessGatePlanSuite => ({
    id,
    tier,
    command: '(external consumer manifest unavailable)',
    surfaces: consumer.harnessSurfaces,
    proof: `External manifest ${consumer.suiteManifest} for ${consumer.id} was unavailable; planned verdict only.`,
    consumer: consumer.id,
    suiteSource: 'synthetic',
  })
  return [
    ...consumer.heldInSuites.map((id) => synthesize(id, 'held-in')),
    ...consumer.heldOutSuites.map((id) => synthesize(id, 'held-out')),
  ]
}

function resolveConsumerRoot(root: string, consumer: HarnessGateConsumer): string {
  const envName = `HARNESS_GATE_${consumer.id.toUpperCase().replace(/[^A-Z0-9]+/g, '_')}_ROOT`
  const fromEnv = process.env[envName]
  if (fromEnv) return resolve(fromEnv)
  return resolve(root, '..', consumer.worktreeAlias)
}

function readMeasurementsFile(path: string): HarnessGateMeasurement[] {
  return measurementsSchema.parse(JSON.parse(readFileSync(path, 'utf8')))
}

function parseArgs(argv: string[]): {
  execute: boolean
  json: boolean
  changedFiles: string[]
  changedFilesFromGit: boolean
  baseRef?: string
  headRef?: string
  repeatCount: number
  baselineMeasurementsFile?: string
  candidateMeasurementsFile?: string
} {
  const changedFiles: string[] = []
  let execute = false
  let json = false
  let changedFilesFromGit = false
  let baseRef: string | undefined
  let headRef: string | undefined
  let baselineMeasurementsFile: string | undefined
  let candidateMeasurementsFile: string | undefined
  let repeatCount = 1
  for (let index = 0; index < argv.length; index += 1) {
    const arg = argv[index]
    if (arg === '--execute') execute = true
    else if (arg === '--json') json = true
    else if (arg === '--changed-files-from-git') changedFilesFromGit = true
    else if (arg === '--base-ref') {
      const value = argv[index + 1]
      if (!value) throw new Error('--base-ref requires a value')
      baseRef = value
      index += 1
    } else if (arg?.startsWith('--base-ref=')) {
      baseRef = arg.slice('--base-ref='.length)
    } else if (arg === '--head-ref') {
      const value = argv[index + 1]
      if (!value) throw new Error('--head-ref requires a value')
      headRef = value
      index += 1
    } else if (arg?.startsWith('--head-ref=')) {
      headRef = arg.slice('--head-ref='.length)
    } else if (arg === '--repeat-count') {
      const value = argv[index + 1]
      if (!value) throw new Error('--repeat-count requires a value')
      repeatCount = Number.parseInt(value, 10)
      index += 1
    } else if (arg?.startsWith('--repeat-count=')) {
      repeatCount = Number.parseInt(arg.slice('--repeat-count='.length), 10)
    } else if (arg === '--baseline-measurements') {
      const value = argv[index + 1]
      if (!value) throw new Error('--baseline-measurements requires a value')
      baselineMeasurementsFile = value
      index += 1
    } else if (arg?.startsWith('--baseline-measurements=')) {
      baselineMeasurementsFile = arg.slice('--baseline-measurements='.length)
    } else if (arg === '--candidate-measurements') {
      const value = argv[index + 1]
      if (!value) throw new Error('--candidate-measurements requires a value')
      candidateMeasurementsFile = value
      index += 1
    } else if (arg?.startsWith('--candidate-measurements=')) {
      candidateMeasurementsFile = arg.slice('--candidate-measurements='.length)
    } else if (arg === '--changed-file') {
      const value = argv[index + 1]
      if (!value) throw new Error('--changed-file requires a value')
      changedFiles.push(value)
      index += 1
    } else if (arg?.startsWith('--changed-file=')) {
      changedFiles.push(arg.slice('--changed-file='.length))
    }
  }
  if (!Number.isInteger(repeatCount) || repeatCount < 1) {
    throw new Error('--repeat-count must be a positive integer')
  }
  return {
    execute,
    json,
    changedFiles,
    changedFilesFromGit,
    baseRef,
    headRef,
    repeatCount,
    baselineMeasurementsFile,
    candidateMeasurementsFile,
  }
}

if (import.meta.url === `file://${process.argv[1]}`) {
  const args = parseArgs(process.argv.slice(2))
  const plan = loadHarnessGatePlan(process.cwd())
  const changedFiles = args.changedFilesFromGit
    ? collectChangedFilesFromGit({ baseRef: args.baseRef, headRef: args.headRef })
    : args.changedFiles.length > 0
      ? args.changedFiles
      : [CONSUMERS_PATH, SURFACES_PATH]
  const triggeredSurfaces = detectTriggeredSurfaces(changedFiles, process.cwd())
  const verdict = buildHarnessGateVerdict({
    plan,
    triggeredSurfaces,
    execute: args.execute,
    repeatCount: args.repeatCount,
    ...(args.baselineMeasurementsFile
      ? { baselineMeasurements: readMeasurementsFile(args.baselineMeasurementsFile) }
      : {}),
    ...(args.candidateMeasurementsFile
      ? { candidateMeasurements: readMeasurementsFile(args.candidateMeasurementsFile) }
      : {}),
  })
  const report = formatHarnessGateReport(verdict)
  if (args.json) console.log(JSON.stringify(report, null, 2))
  else {
    console.log(report.summary)
    console.log(`Mode: ${report.mode}`)
    console.log(`Manifest-backed suites: ${report.manifestBacked ? 'yes' : 'no'}`)
    console.log(`Triggered surfaces: ${report.triggeredSurfaces.join(', ') || '(none)'}`)
    console.log(`Repeat evidence: ${report.repeatCountJustification.rationale}`)
    for (const suite of report.suites) {
      const duration = suite.durationMs === undefined ? '' : ` durationMs=${suite.durationMs}`
      console.log(`- ${suite.id}: ${suite.status} (${suite.suiteSource})${duration}`)
    }
  }
  process.exit(report.ok ? 0 : 1)
}
