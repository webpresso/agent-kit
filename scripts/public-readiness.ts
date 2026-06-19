#!/usr/bin/env bun

import { execFileSync } from 'node:child_process'
import { existsSync, readFileSync, readdirSync } from 'node:fs'
import { join, resolve } from 'node:path'

import { syncBlueprintMigrationSqlAssets } from '../src/build/blueprint-migration-assets.js'
import {
  AGENT_KIT_TARBALL_SIZE_BUDGET_BYTES,
  AGENT_KIT_TARBALL_UNPACKED_SIZE_BUDGET_BYTES,
  evaluateAgentKitTarballSizeBudget,
} from '../src/build/runtime-surface-policy.js'
import {
  formatRootLauncherContractFailure,
  formatRootLauncherContractSuccess,
  rootContractMode,
  validateRootLauncherContract,
} from '../src/launcher/root-contract.js'
import { preparePackedManifest, restorePackedManifest } from '../src/build/package-manifest.js'
import {
  SESSION_MEMORY_NATIVE_TARGETS,
  type SessionMemoryNativeTarget,
} from '../src/session-memory/native-targets.js'
import { listValidBenchmarkResultCards, validateBenchmarkResultCard } from './bench/lib/result-card.js'
import { classifyClaimLine } from './bench/lib/claim-class.js'
import { scanForRedaction } from './bench/lib/redaction.js'
import { CAPABILITY_REGISTRY, assertNoUnbackedMeasuredClaim } from './bench/lib/capability-registry.js'
import type { PhaseSummary } from './public-consumer-smoke-phases.js'

type Status = 'PASS' | 'FAIL' | 'BLOCKED'

interface CheckResult {
  readonly name: string
  readonly status: Status
  readonly detail: string
}

export interface RepoVisibilityReadinessInput {
  readonly repoAlreadyPublic: boolean
  readonly historyClassification: string
  readonly publicHistoryTaskStatus: string | null
  readonly publicHistoryTaskId?: string
}

interface RuntimeManifestRecord {
  readonly binaryName?: string
  readonly targets?: Array<{ id?: string; os?: string; bunTarget?: string; packageName?: string }>
}

interface PluginManifestRecord {
  readonly mcpServers?: Record<string, { command?: string; args?: string[] }>
}

const ROOT = process.cwd()
const REQUIRE_REPO_VISIBILITY = process.argv.includes('--require-repo-visibility')
const HISTORY_AUDIT_PATH = resolve(ROOT, 'docs/research/2026-05-28-agent-kit-history-audit.md')
const BLUEPRINT_PATH = resolve(
  ROOT,
  'blueprints/completed/agent-kit-public-release-scrub/_overview.md',
)
const PUBLIC_HISTORY_TASK_ID = '1.5'

export const DEFAULT_READINESS_COMMAND_TIMEOUT_MS = 60_000
// The setup-only packed consumer smoke has a 5 minute inner `wp setup` phase
// budget plus native staging/pack phases. Keep the outer readiness bound above
// that measured workload while still failing closed on hangs.
export const PACKED_CONSUMER_SMOKE_TIMEOUT_MS = 480_000
export const NPM_PACK_TIMEOUT_MS = 120_000
export const GIT_LS_FILES_TIMEOUT_MS = 15_000
export const GH_REPO_VIEW_TIMEOUT_MS = 15_000

const DENIED_PACKED_RUNTIME_PAYLOAD_PREFIXES = [
  'bin/runtime/',
  'dist/runtime/',
  'dist/runtime-packages/',
  'native/session-memory-engine/',
] as const

function isAllowedPackedNativeAddon(path: string): boolean {
  return path.endsWith('.node')
}

type ExecFileSyncLike = (
  command: string,
  args: readonly string[],
  options: {
    cwd: string
    env: NodeJS.ProcessEnv
    encoding: 'utf8'
    stdio: ['ignore', 'pipe', 'pipe']
    timeout: number
    killSignal: NodeJS.Signals
  },
) => string | Buffer

export interface ReadinessRunResult {
  readonly stdout: string
  readonly stderr: string
  readonly ok: boolean
  readonly code: number | null
  readonly signal?: string
  readonly timedOut: boolean
  readonly timeoutMs: number
}

export interface ReadinessRunOptions {
  readonly timeoutMs?: number
  readonly execFileSyncImpl?: ExecFileSyncLike
}

function outputToString(output: string | Buffer | undefined): string {
  return Buffer.isBuffer(output) ? output.toString('utf8') : String(output ?? '')
}

function tailForDetail(output: string, maxLength = 1000): string {
  return output.trim().replace(/\s+/g, ' ').slice(-maxLength)
}

export function formatRunFailureDetail(result: ReadinessRunResult): string {
  const status = result.timedOut
    ? `timed out after ${result.timeoutMs}ms`
    : result.signal
      ? `signal ${result.signal}`
      : `exit ${result.code ?? 1}`
  const tail = tailForDetail(result.stderr) || tailForDetail(result.stdout)
  return tail ? `${status}; ${tail}` : status
}

export function runReadinessCommand(
  command: string,
  args: readonly string[],
  env: NodeJS.ProcessEnv = process.env,
  options: ReadinessRunOptions = {},
): ReadinessRunResult {
  const timeoutMs = options.timeoutMs ?? DEFAULT_READINESS_COMMAND_TIMEOUT_MS
  const execImpl = options.execFileSyncImpl ?? (execFileSync as ExecFileSyncLike)
  try {
    const stdout = execImpl(command, args, {
      cwd: ROOT,
      env,
      encoding: 'utf8',
      stdio: ['ignore', 'pipe', 'pipe'],
      timeout: timeoutMs,
      killSignal: 'SIGTERM',
    })
    return {
      stdout: outputToString(stdout),
      stderr: '',
      ok: true,
      code: 0,
      timedOut: false,
      timeoutMs,
    }
  } catch (error) {
    const e = error as {
      stdout?: string | Buffer
      stderr?: string | Buffer
      status?: number
      signal?: NodeJS.Signals | string
      message?: string
    }
    const message = e.message ?? ''
    const timedOut = /ETIMEDOUT|timed out/i.test(message)
    return {
      stdout: outputToString(e.stdout),
      stderr: outputToString(e.stderr),
      ok: false,
      code: typeof e.status === 'number' ? e.status : null,
      signal: e.signal,
      timedOut,
      timeoutMs,
    }
  }
}

function read(path: string): string {
  return readFileSync(resolve(ROOT, path), 'utf8')
}

function fail(name: string, detail: string): CheckResult {
  return { name, status: 'FAIL', detail }
}

function pass(name: string, detail: string): CheckResult {
  return { name, status: 'PASS', detail }
}

function blocked(name: string, detail: string): CheckResult {
  return { name, status: 'BLOCKED', detail }
}

export function evaluateRepoVisibilityReadiness(input: RepoVisibilityReadinessInput): CheckResult {
  const publicHistoryTaskId = input.publicHistoryTaskId ?? PUBLIC_HISTORY_TASK_ID
  if (input.repoAlreadyPublic) {
    return pass(
      'repo-visibility-readiness',
      'repository already public; snapshot strategy superseded by operator override',
    )
  }

  if (input.historyClassification === 'forward-only-acceptable') {
    return pass('repo-visibility-readiness', 'forward-only-acceptable')
  }

  if (
    (input.historyClassification === 'clean-public-snapshot-preferred' ||
      input.historyClassification === 'rewrite-required') &&
    input.publicHistoryTaskStatus === 'done'
  ) {
    return pass('repo-visibility-readiness', `${input.historyClassification} executed`)
  }

  if (
    input.historyClassification === 'clean-public-snapshot-preferred' ||
    input.historyClassification === 'rewrite-required'
  ) {
    return blocked(
      'repo-visibility-readiness',
      `${input.historyClassification}; public history Task ${publicHistoryTaskId} still pending`,
    )
  }

  return fail('repo-visibility-readiness', 'missing or invalid history strategy evidence')
}

export function listMissingRuntimeOptionalDependencies(
  runtimeManifest: RuntimeManifestRecord,
  packageVersion: string,
  optionalDependencies: Record<string, string> = {},
): string[] {
  return (runtimeManifest.targets ?? [])
    .filter(
      (target) =>
        !target.packageName || optionalDependencies[target.packageName] !== packageVersion,
    )
    .map((target) => target.packageName ?? target.id ?? 'unknown-target')
}

export function listMissingSessionMemoryNativeOptionalDependencies(
  targets: readonly Pick<SessionMemoryNativeTarget, 'id' | 'packageName'>[],
  packageVersion: string,
  optionalDependencies: Record<string, string> = {},
): string[] {
  return targets
    .filter((target) => optionalDependencies[target.packageName] !== packageVersion)
    .map((target) => target.packageName ?? target.id)
}

export function evaluatePluginNativeLauncherPolicy(pluginManifest: PluginManifestRecord): {
  readonly commandOk: boolean
  readonly argsOk: boolean
  readonly command?: string
  readonly args: readonly string[]
} {
  const server = pluginManifest.mcpServers?.webpresso
  const args = Array.isArray(server?.args) ? server.args : []
  return {
    commandOk: server?.command === '${CLAUDE_PLUGIN_ROOT}/bin/wp',
    argsOk: args.length === 1 && args[0] === 'mcp',
    command: server?.command,
    args,
  }
}

export function listMissingPackedRuntimePaths(
  _runtimeManifest: RuntimeManifestRecord,
  packedFiles: readonly string[],
): string[] {
  const requiredRuntimePaths = new Set<string>(['bin/runtime-manifest.json', 'bin/wp'])
  return [...requiredRuntimePaths].filter((path) => !packedFiles.includes(path))
}

export function listPackedRuntimePayloadLeaks(packedFiles: readonly string[]): string[] {
  return packedFiles.filter(
    (path) =>
      DENIED_PACKED_RUNTIME_PAYLOAD_PREFIXES.some((prefix) => path.startsWith(prefix)) &&
      !isAllowedPackedNativeAddon(path),
  )
}

function countMatches(paths: string[], patterns: RegExp[]): string[] {
  const hits: string[] = []
  for (const path of paths) {
    const content = read(path)
    for (const pattern of patterns) {
      if (pattern.test(content)) hits.push(`${path}: ${pattern}`)
    }
  }
  return hits
}

const NUMERIC_BENCHMARK_CLAIM_PATTERN =
  /(?:benchmark|latency|throughput|token|context|memory|session|recall|restore|search|capture|snapshot|faster|slower|reduction|reduced)[^\n.]{0,120}(?:\b\d+(?:\.\d+)?\s?(?:%|x|ms|s|tokens?|bytes?)\b|\b\d+(?:\.\d+)?\s?(?:percent|times)\b)|(?:\b\d+(?:\.\d+)?\s?(?:%|x|ms|s|tokens?|bytes?)\b|\b\d+(?:\.\d+)?\s?(?:percent|times)\b)[^\n.]{0,120}(?:benchmark|latency|throughput|token|context|memory|session|recall|restore|search|capture|snapshot|faster|slower|reduction|reduced)/iu

const QUALITATIVE_BENCHMARK_CLAIM_PATTERN =
  /\b(?:(?:native\s+)?acceleration|speedup|performance improvement|reduced latency|latency reduction|cost savings|token savings)\b/iu

const BENCHMARK_CLAIM_POLICY_LINE_PATTERN =
  /\b(?:must cite|require(?:s|d)? checked-in|before promoting|not hook latency|not-instrumented|does not use|must not|no numeric|do not add numeric|not replacement parity evidence|not measured|approximation only|proxy only|exact UTF-8 byte gains|speedup numbers|unless a separate measured result card proves|approxTokensSaved|public numeric savings|not provider-token savings|byte accounting|token proxy)\b/iu

export function hasNumericBenchmarkClaim(text: string): boolean {
  return NUMERIC_BENCHMARK_CLAIM_PATTERN.test(text)
}

export function hasQualitativeBenchmarkClaim(text: string): boolean {
  return QUALITATIVE_BENCHMARK_CLAIM_PATTERN.test(text)
}

export function listFirstPartyBenchmarkResultCards(root = ROOT): string[] {
  return listValidBenchmarkResultCards(root)
}

function listMarkdownFiles(root: string, dir: string): string[] {
  const absoluteDir = resolve(root, dir)
  if (!existsSync(absoluteDir)) return []
  const out: string[] = []
  for (const entry of readdirSync(absoluteDir, { withFileTypes: true })) {
    const relativePath = join(dir, entry.name).replaceAll('\\', '/')
    if (entry.isDirectory()) {
      if (relativePath === 'docs/bench/result-cards') continue
      out.push(...listMarkdownFiles(root, relativePath))
      continue
    }
    if (entry.isFile() && entry.name.endsWith('.md')) out.push(relativePath)
  }
  return out.toSorted()
}

function latestChangelogSlice(root: string): string | null {
  const changelogPath = resolve(root, 'CHANGELOG.md')
  if (!existsSync(changelogPath)) return null
  const changelog = readFileSync(changelogPath, 'utf8')
  const firstVersion = changelog.search(/^##\s+/mu)
  if (firstVersion === -1) return changelog
  const nextVersion = changelog.slice(firstVersion + 1).search(/^##\s+/mu)
  return nextVersion === -1
    ? changelog.slice(firstVersion)
    : changelog.slice(firstVersion, firstVersion + 1 + nextVersion)
}

function publicBenchmarkClaimSurfaces(root: string): Array<{ path: string; text: string }> {
  const surfaces: Array<{ path: string; text: string }> = []
  const directFiles = ['README.md', 'package.json']
  for (const path of directFiles) {
    if (existsSync(resolve(root, path))) {
      surfaces.push({ path, text: readFileSync(resolve(root, path), 'utf8') })
    }
  }
  const latest = latestChangelogSlice(root)
  if (latest !== null) surfaces.push({ path: 'CHANGELOG.md#latest', text: latest })
  for (const path of listMarkdownFiles(root, 'docs')) {
    if (path.startsWith('docs/research/')) continue
    // The result-card contract and benchmark methodology are meta-docs: they
    // DEFINE the metric-class taxonomy, show example metric tables, and carry
    // the byte!=token disclaimer. They describe how claims are evidenced, they
    // are not product claims, so they are excluded from claim-surface scanning.
    if (path === 'docs/bench/result-card-contract.md') continue
    if (path === 'docs/bench/session-memory-methodology.md') continue
    surfaces.push({ path, text: readFileSync(resolve(root, path), 'utf8') })
  }
  for (const path of listMarkdownFiles(root, '.changeset')) {
    surfaces.push({ path, text: readFileSync(resolve(root, path), 'utf8') })
  }
  for (const path of ['scripts/bench/README.md', 'scripts/bench/PREFLIGHT.md']) {
    if (existsSync(resolve(root, path))) {
      surfaces.push({ path, text: readFileSync(resolve(root, path), 'utf8') })
    }
  }
  return surfaces
}

function surfaceHasBenchmarkClaim(text: string): boolean {
  return text
    .split('\n')
    .some(
      (line) =>
        !BENCHMARK_CLAIM_POLICY_LINE_PATTERN.test(line) &&
        (hasNumericBenchmarkClaim(line) || hasQualitativeBenchmarkClaim(line)),
    )
}

export function evaluatePublicBenchmarkClaimGate(root = ROOT): CheckResult {
  const validCards = listFirstPartyBenchmarkResultCards(root)
  const offending = publicBenchmarkClaimSurfaces(root).filter(({ text }) => {
    if (!surfaceHasBenchmarkClaim(text)) return false
    return !validCards.some((cardPath) => text.includes(cardPath))
  })

  if (offending.length === 0) {
    return pass(
      'public-benchmark-claim-gate',
      validCards.length === 0
        ? 'public benchmark/savings surfaces contain no uncited numeric or speedup claims'
        : `public benchmark/savings claims cite valid result-card evidence: ${validCards.join(', ')}`,
    )
  }

  return fail(
    'public-benchmark-claim-gate',
    `uncited benchmark/savings claim surfaces: ${offending.map((item) => item.path).join(', ')}`,
  )
}

export function evaluateReadmeBenchmarkClaimGate(readme: string, root = ROOT): CheckResult {
  const required = [
    'docs/bench/result-card-contract.md',
    'docs/bench/result-cards/',
    'checked-in first-party result card',
  ]
  const missing = required.filter((marker) => !readme.includes(marker))
  const missingPaths = [
    'docs/bench/result-card-contract.md',
    'docs/bench/result-cards/README.md',
  ].filter((path) => !existsSync(resolve(root, path)))
  if (missing.length > 0 || missingPaths.length > 0) {
    return fail(
      'readme-benchmark-claim-gate',
      [
        missing.length ? `README missing claim-gate markers: ${missing.join(', ')}` : null,
        missingPaths.length
          ? `missing checked-in result-card docs: ${missingPaths.join(', ')}`
          : null,
      ]
        .filter((value): value is string => value !== null)
        .join('; '),
    )
  }

  if (!surfaceHasBenchmarkClaim(readme)) {
    return pass(
      'readme-benchmark-claim-gate',
      'README contains the numeric benchmark claim gate and no numeric benchmark claim',
    )
  }

  const citedEvidenceCards = listFirstPartyBenchmarkResultCards(root).filter((path) =>
    readme.includes(path),
  )
  return citedEvidenceCards.length > 0
    ? pass(
        'readme-benchmark-claim-gate',
        `numeric benchmark claims cite checked-in first-party result-card evidence: ${citedEvidenceCards.join(', ')}`,
      )
    : fail(
        'readme-benchmark-claim-gate',
        'README contains a numeric benchmark claim but does not cite a checked-in first-party result card with run id, scenario, metrics, and environment evidence',
      )
}

function blueprintTaskStatus(taskId: string): string | null {
  if (!existsSync(BLUEPRINT_PATH)) return null
  const text = readFileSync(BLUEPRINT_PATH, 'utf8')
  const marker = `#### Task ${taskId}:`
  const start = text.indexOf(marker)
  if (start === -1) return null
  const rest = text.slice(start)
  const match = rest.match(/\*\*Status:\*\*\s+([a-z-]+)/i)
  return match?.[1]?.toLowerCase() ?? null
}

// G2: Metric-class binding check
// Each claim class found in public surfaces must have a backing result card with that metricClass.
export function evaluateMetricClassBindingGate(root = ROOT): CheckResult {
  const surfaces = publicBenchmarkClaimSurfaces(root)
  const claimedClasses = new Set<string>()
  const claimSources = new Map<string, string>()

  for (const surface of surfaces) {
    for (const line of surface.text.split('\n')) {
      if (!line.trim()) continue
      // Only bind a line that is an actual benchmark claim — a quantitative or
      // qualitative assertion — not a mere keyword mention (audit/preset names,
      // packaging tech, taxonomy rows) or a policy/disclaimer line. This mirrors
      // surfaceHasBenchmarkClaim so the binding gate and the numeric gate agree
      // on what counts as a claim.
      if (BENCHMARK_CLAIM_POLICY_LINE_PATTERN.test(line)) continue
      if (!hasNumericBenchmarkClaim(line) && !hasQualitativeBenchmarkClaim(line)) continue
      for (const cls of classifyClaimLine(line)) {
        if (!claimedClasses.has(cls)) {
          claimedClasses.add(cls)
          claimSources.set(cls, surface.path)
        }
      }
    }
  }

  if (claimedClasses.size === 0) {
    return pass('metric-class-binding-gate', 'no metric-class claims found in public surfaces')
  }

  const cardDir = resolve(root, 'docs/bench/result-cards')
  const backedClasses = new Set<string>()
  if (existsSync(cardDir)) {
    for (const entry of readdirSync(cardDir, { withFileTypes: true })) {
      if (!entry.isFile() || !entry.name.endsWith('.md') || entry.name === 'README.md') continue
      const cardPath = `docs/bench/result-cards/${entry.name}`
      const validation = validateBenchmarkResultCard(cardPath, root)
      if (validation.valid) {
        for (const cls of validation.metricClasses) {
          backedClasses.add(cls)
        }
      }
    }
  }

  const unbacked = [...claimedClasses].filter((cls) => !backedClasses.has(cls))
  if (unbacked.length > 0) {
    const detail = unbacked
      .map((cls) => `Claim of class '${cls}' found in ${claimSources.get(cls) ?? 'unknown'} but no result card proves this class`)
      .join('; ')
    return fail('metric-class-binding-gate', detail)
  }

  return pass(
    'metric-class-binding-gate',
    `all ${claimedClasses.size} claim class(es) backed by result cards`,
  )
}

// G4: Redaction gate — scan result cards and bench docs for secrets/local paths.
export function evaluateRedactionGate(root = ROOT): CheckResult {
  const filesToScan: string[] = []

  const cardDir = resolve(root, 'docs/bench/result-cards')
  if (existsSync(cardDir)) {
    for (const entry of readdirSync(cardDir, { withFileTypes: true })) {
      if (entry.isFile() && entry.name.endsWith('.md')) {
        filesToScan.push(join('docs/bench/result-cards', entry.name))
      }
    }
  }

  for (const docFile of ['docs/bench/result-card-contract.md', 'docs/bench/session-memory-methodology.md']) {
    if (existsSync(resolve(root, docFile))) filesToScan.push(docFile)
  }

  const allFindings: Array<{ path: string; kind: string; lineNumber: number }> = []
  for (const relPath of filesToScan) {
    const content = readFileSync(resolve(root, relPath), 'utf8')
    for (const finding of scanForRedaction(content, relPath)) {
      allFindings.push({ path: finding.artifactPath, kind: finding.kind, lineNumber: finding.lineNumber })
    }
  }

  if (allFindings.length === 0) {
    return pass('redaction-gate', 'no redaction issues found in bench docs and result cards')
  }

  const detail = allFindings
    .map((f) => `${f.path}:${f.lineNumber} [${f.kind}]`)
    .join('; ')
  return fail('redaction-gate', detail)
}

// G5: Capability docs gate — no "measured" claims without a registry row with artifactPath.
export function evaluateCapabilityDocsGate(root = ROOT): CheckResult {
  const matrixPath = resolve(root, 'docs/bench/reference-parity-matrix.md')
  if (!existsSync(matrixPath)) {
    return pass('capability-docs-gate', 'docs/bench/reference-parity-matrix.md not present; skipping')
  }

  const docsText = readFileSync(matrixPath, 'utf8')
  const violations = assertNoUnbackedMeasuredClaim(docsText, CAPABILITY_REGISTRY)

  if (violations.length === 0) {
    return pass('capability-docs-gate', 'all capability claims in reference-parity-matrix.md are backed by registry rows')
  }

  return fail('capability-docs-gate', violations.join('; '))
}

// G6: Phased consumer-smoke aggregation display helper.
function formatPhaseSummary(summary: PhaseSummary): string {
  const lines: string[] = [`Overall: ${summary.overall}`]
  for (const phase of summary.phases) {
    const blockNote = phase.blockReason ? ` (${phase.blockReason})` : ''
    lines.push(`  [${phase.status}] ${phase.phase}${blockNote} (${phase.durationMs}ms)`)
  }
  return lines.join('\n')
}

if (import.meta.main) {
  const results: CheckResult[] = []

  // 1) Existing gate commands
  for (const [name, command, args, env] of [
    [
      'forbidden-env-files',
      './bin/wp',
      ['audit', 'no-dev-vars'],
      { ...process.env, WP_SKIP_UPDATE_CHECK: '1' },
    ] as const,
    [
      'secret-provider-quarantine',
      './bin/wp',
      ['audit', 'secret-provider-quarantine'],
      { ...process.env, WP_SKIP_UPDATE_CHECK: '1' },
    ] as const,
    [
      'package-surface-audit',
      'bun',
      ['src/cli/cli.ts', 'audit', 'package-surface'],
      { ...process.env, WP_SKIP_UPDATE_CHECK: '1' },
    ] as const,
    [
      'install-docs-lint',
      'node',
      ['./bin/docs-lint.js', 'README.md', 'docs/getting-started.md', 'docs/README.md'],
      process.env,
    ] as const,
  ]) {
    const r = runReadinessCommand(command, args, env)
    results.push(r.ok ? pass(name, 'ok') : fail(name, formatRunFailureDetail(r)))
  }

  // G6: Run consumer smoke with phase-level reporting.
  const smokeResult = runReadinessCommand(
    'bun',
    ['scripts/public-consumer-smoke.ts', '--setup-only', '--skip-build'],
    { ...process.env, WP_SKIP_UPDATE_CHECK: '1' },
    { timeoutMs: PACKED_CONSUMER_SMOKE_TIMEOUT_MS },
  )
  const smokePhaseStatus: PhaseSummary['phases'][number]['status'] = smokeResult.ok ? 'PASS' : 'FAIL'
  const smokeSummary: PhaseSummary = {
    phases: [
      {
        phase: 'packed-consumer-setup-smoke',
        status: smokePhaseStatus,
        durationMs: 0,
        capturedOutput: smokeResult.stdout,
      },
    ],
    overall: smokePhaseStatus,
  }
  console.log(formatPhaseSummary(smokeSummary))
  results.push(
    smokeResult.ok
      ? pass('consumer-smoke-phases', 'ok')
      : fail('consumer-smoke-phases', formatRunFailureDetail(smokeResult)),
  )

  // 2) Package identity / metadata
  const pkg = JSON.parse(read('package.json')) as {
    name?: string
    version?: string
    bin?: Record<string, string>
    optionalDependencies?: Record<string, string>
    publishConfig?: { registry?: string; access?: string }
    scripts?: Record<string, string>
  }
  if (pkg.name !== '@webpresso/agent-kit') {
    results.push(
      fail('package-name', `expected @webpresso/agent-kit, got ${pkg.name ?? 'missing'}`),
    )
  } else if (pkg.publishConfig?.registry !== 'https://registry.npmjs.org/') {
    results.push(
      fail(
        'publish-registry',
        `expected https://registry.npmjs.org/, got ${pkg.publishConfig?.registry ?? 'missing'}`,
      ),
    )
  } else if (pkg.publishConfig?.access !== 'public') {
    results.push(
      fail('publish-access', `expected public, got ${pkg.publishConfig?.access ?? 'missing'}`),
    )
  } else {
    results.push(
      pass('package-metadata', '@webpresso/agent-kit + public npm publishConfig present'),
    )
  }

  const runtimeManifestPath = 'bin/runtime-manifest.json'
  const runtimeBuildScript = 'scripts/build-runtime-binaries.ts'
  const runtimeStageScript = 'scripts/stage-plugin-runtime-artifacts.ts'
  if (!existsSync(resolve(ROOT, runtimeManifestPath))) {
    results.push(fail('compiled-runtime-manifest', `${runtimeManifestPath} missing`))
  } else if (!existsSync(resolve(ROOT, runtimeBuildScript))) {
    results.push(fail('compiled-runtime-build-script', `${runtimeBuildScript} missing`))
  } else if (!existsSync(resolve(ROOT, runtimeStageScript))) {
    results.push(fail('compiled-runtime-stage-script', `${runtimeStageScript} missing`))
  } else {
    const runtimeManifest = JSON.parse(read(runtimeManifestPath)) as RuntimeManifestRecord
    const targets = runtimeManifest.targets ?? []
    const scripts = pkg.scripts ?? {}
    if (
      runtimeManifest.binaryName !== 'wp' ||
      targets.length < 5 ||
      targets.some((target) => !target.id || !target.bunTarget || !target.packageName)
    ) {
      results.push(fail('compiled-runtime-target-matrix', 'runtime manifest is incomplete'))
    } else if (
      !scripts['build:runtime-binaries']?.includes(runtimeBuildScript) ||
      !scripts['stage:plugin-runtime']?.includes(runtimeStageScript)
    ) {
      results.push(fail('compiled-runtime-package-scripts', 'runtime scripts are not wired'))
    } else {
      results.push(
        pass(
          'compiled-runtime-lane',
          `${targets.length} target manifest plus build/stage scripts are wired`,
        ),
      )
    }
  }

  const runtimeManifest = existsSync(resolve(ROOT, runtimeManifestPath))
    ? (JSON.parse(read(runtimeManifestPath)) as RuntimeManifestRecord)
    : null

  let preparedPkg: typeof pkg | null = null
  try {
    syncBlueprintMigrationSqlAssets(ROOT)
    preparePackedManifest(ROOT)
    preparedPkg = JSON.parse(read('package.json')) as typeof pkg
  } finally {
    restorePackedManifest(ROOT)
  }

  if (runtimeManifest?.targets?.length && typeof pkg.version === 'string') {
    const missingOptionalDeps = listMissingRuntimeOptionalDependencies(
      runtimeManifest,
      pkg.version,
      preparedPkg?.optionalDependencies,
    )
    results.push(
      missingOptionalDeps.length === 0
        ? pass(
            'runtime-optional-dependencies',
            `${runtimeManifest.targets.length} prepared runtime packages locked to ${pkg.version}`,
          )
        : fail(
            'runtime-optional-dependencies',
            `missing/mismatched optional deps: ${missingOptionalDeps.join(', ')}`,
          ),
    )
  }

  if (typeof pkg.version === 'string') {
    const missingSessionMemoryNativeOptionalDeps =
      listMissingSessionMemoryNativeOptionalDependencies(
        SESSION_MEMORY_NATIVE_TARGETS,
        pkg.version,
        preparedPkg?.optionalDependencies,
      )
    results.push(
      missingSessionMemoryNativeOptionalDeps.length === 0
        ? pass(
            'session-memory-native-optional-dependencies',
            `${SESSION_MEMORY_NATIVE_TARGETS.length} prepared session-memory native packages locked to ${pkg.version}`,
          )
        : fail(
            'session-memory-native-optional-dependencies',
            `missing/mismatched optional deps: ${missingSessionMemoryNativeOptionalDeps.join(', ')}`,
          ),
    )
  }

  const stagedLauncherPath = resolve(ROOT, 'bin', 'wp')
  const stagedLauncherStatus = validateRootLauncherContract(stagedLauncherPath)
  results.push(
    stagedLauncherStatus.ok
      ? pass(
          'root-wp-selector',
          `${formatRootLauncherContractSuccess('bin/wp')} (contract=${rootContractMode})`,
        )
      : fail(
          'root-wp-selector',
          `${formatRootLauncherContractFailure(stagedLauncherStatus, 'bin/wp')} (contract=${rootContractMode})`,
        ),
  )

  const pluginManifestPath = resolve(ROOT, '.claude-plugin', 'plugin.json')
  if (!existsSync(pluginManifestPath)) {
    results.push(fail('plugin-native-launcher-policy', '.claude-plugin/plugin.json missing'))
  } else {
    const launcherPolicy = evaluatePluginNativeLauncherPolicy(
      JSON.parse(readFileSync(pluginManifestPath, 'utf8')) as PluginManifestRecord,
    )
    results.push(
      launcherPolicy.commandOk && launcherPolicy.argsOk
        ? pass('plugin-native-launcher-policy', 'plugin manifest launches native bin/wp directly')
        : fail(
            'plugin-native-launcher-policy',
            `expected \${CLAUDE_PLUGIN_ROOT}/bin/wp mcp, got ${launcherPolicy.command ?? 'missing'} ${launcherPolicy.args.join(' ')}`.trim(),
          ),
    )
  }

  // 3) Tarball surface
  let pack: ReadinessRunResult = {
    code: 1,
    ok: false,
    stdout: '',
    stderr: '',
    timedOut: false,
    timeoutMs: NPM_PACK_TIMEOUT_MS,
  }
  try {
    syncBlueprintMigrationSqlAssets(ROOT)
    preparePackedManifest(ROOT)
    pack = runReadinessCommand('npm', ['pack', '--ignore-scripts', '--dry-run', '--json'], process.env, {
      timeoutMs: NPM_PACK_TIMEOUT_MS,
    })
  } finally {
    restorePackedManifest(ROOT)
  }
  if (!pack.ok) {
    results.push(fail('npm-pack', formatRunFailureDetail(pack)))
  } else {
    const parsed = JSON.parse(pack.stdout.match(/\[.*\]/s)?.[0] ?? '[]')[0] as
      | { files?: Array<{ path: string }>; size?: number; unpackedSize?: number }
      | undefined
    const files = parsed?.files?.map((f) => f.path) ?? []
    const maps = files.filter((p) => p.endsWith('.map')).length
    const integration = files.filter((p) => p.includes('__integration__/')).length
    const mocks = files.filter((p) => p.includes('__mocks__/')).length
    const evals = files.filter((p) => p.includes('runners/evals/')).length
    const missingRuntimePaths = runtimeManifest
      ? listMissingPackedRuntimePaths(runtimeManifest, files)
      : []
    const leakedRuntimePayloadPaths = listPackedRuntimePayloadLeaks(files)
    if (maps || integration || mocks || evals) {
      results.push(
        fail(
          'tarball-banned-paths',
          `maps=${maps}, integration=${integration}, mocks=${mocks}, evals=${evals}`,
        ),
      )
    } else {
      results.push(
        pass(
          'tarball-banned-paths',
          `entryCount=${files.length}, size=${parsed?.size ?? 0}, unpacked=${parsed?.unpackedSize ?? 0}`,
        ),
      )
    }
    const sizeBudget = evaluateAgentKitTarballSizeBudget(parsed ?? {})
    results.push(
      sizeBudget.sizeOk && sizeBudget.unpackedOk
        ? pass(
            'tarball-size-budget',
            `size=${sizeBudget.size}, unpacked=${sizeBudget.unpackedSize}`,
          )
        : fail(
            'tarball-size-budget',
            `size=${sizeBudget.size}/${AGENT_KIT_TARBALL_SIZE_BUDGET_BYTES}, unpacked=${sizeBudget.unpackedSize}/${AGENT_KIT_TARBALL_UNPACKED_SIZE_BUDGET_BYTES}`,
          ),
    )
    results.push(
      missingRuntimePaths.length === 0 && leakedRuntimePayloadPaths.length === 0
        ? pass(
            'tarball-native-runtime-surface',
            'tarball keeps manifest + launcher, permits prebuilt native artifacts/optionals, and excludes native source trees',
          )
        : fail(
            'tarball-native-runtime-surface',
            [
              missingRuntimePaths.length
                ? `missing required packed runtime paths: ${missingRuntimePaths.join(', ')}`
                : null,
              leakedRuntimePayloadPaths.length
                ? `denied packed native source paths: ${leakedRuntimePayloadPaths.join(', ')}`
                : null,
            ]
              .filter((value): value is string => value !== null)
              .join('; '),
          ),
    )
  }

  // 4) Negative stale-literal checks on shipped/public surfaces
  const shippedSurfacePaths = [
    'README.md',
    'AGENTS.md',
    'docs/README.md',
    'docs/getting-started.md',
    '.npmrc',
    'package.json',
    '.github/workflows/release.yml',
    'src/cli/auto-update/run.ts',
    'src/cli/auto-update/detect-pm.ts',
    'src/hooks/doctor.ts',
    'catalog/AGENTS.md.tpl',
    'catalog/agent/rules/package-conventions.md',
    'catalog/agent/rules/changeset-release.md',
    'catalog/base-kit/.github/workflows/ci.yml.tmpl',
  ]

  const staleHits = countMatches(shippedSurfacePaths, [
    /npm\.pkg\.github\.com/,
    /GH_PACKAGES_TOKEN/,
    /\/Users\/ozby/,
    /~\/\.claude/,
  ])

  results.push(
    staleHits.length === 0
      ? pass(
          'stale-surface-literals',
          'no stale registry/auth/local-path literals on shipped/public surfaces',
        )
      : fail('stale-surface-literals', staleHits.join('; ')),
  )

  // 5) Positive public-target assertions for updater/help surfaces
  const updaterSurface =
    read('src/cli/auto-update/detect-pm.ts') + '\n' + read('src/cli/auto-update/run.ts')
  const doctorSurface = read('src/hooks/doctor.ts')
  const updaterHasPackage = updaterSurface.includes('@webpresso/agent-kit')
  const updaterHasRegistry =
    updaterSurface.includes('https://registry.npmjs.org') &&
    (updaterSurface.includes('@webpresso%2Fagent-kit') ||
      updaterSurface.includes('@webpresso/agent-kit'))
  const doctorHasPackage =
    doctorSurface.includes('@webpresso/agent-kit') || doctorSurface.includes('public npm')

  if (!updaterHasPackage || !updaterHasRegistry || !doctorHasPackage) {
    results.push(
      fail(
        'public-target-positive-assertions',
        `updaterHasPackage=${updaterHasPackage}, updaterHasRegistry=${updaterHasRegistry}, doctorHasPackage=${doctorHasPackage}`,
      ),
    )
  } else {
    results.push(
      pass(
        'public-target-positive-assertions',
        'updater/help surfaces resolve to the intended public package + npm registry target',
      ),
    )
  }

  // 6) README benchmark claim gate
  results.push(evaluateReadmeBenchmarkClaimGate(read('README.md')))
  results.push(evaluatePublicBenchmarkClaimGate(ROOT))

  // G2) Metric-class binding check
  results.push(evaluateMetricClassBindingGate(ROOT))

  // G4) Redaction gate
  results.push(evaluateRedactionGate(ROOT))

  // G5) Capability docs gate
  results.push(evaluateCapabilityDocsGate(ROOT))

  // 7) Generated artifact regression
  const testPlanFiles = runReadinessCommand(
    'git',
    ['ls-files', '.test-plan-service/**'],
    process.env,
    { timeoutMs: GIT_LS_FILES_TIMEOUT_MS },
  )
  results.push(
    testPlanFiles.stdout.trim() === ''
      ? pass('tracked-generated-artifacts', 'no tracked .test-plan-service artifacts')
      : fail('tracked-generated-artifacts', testPlanFiles.stdout.trim()),
  )

  // 8) History strategy evidence
  if (!existsSync(HISTORY_AUDIT_PATH)) {
    results.push(
      fail('history-audit-artifact', 'missing docs/research/2026-05-28-agent-kit-history-audit.md'),
    )
  } else {
    const audit = readFileSync(HISTORY_AUDIT_PATH, 'utf8')
    const classificationMatch = audit.match(/Classification:\s+`([^`]+)`/)
    const classification = classificationMatch?.[1] ?? 'missing'
    if (
      classification !== 'rewrite-required' &&
      classification !== 'clean-public-snapshot-preferred' &&
      classification !== 'forward-only-acceptable'
    ) {
      results.push(fail('history-audit-artifact', `unexpected classification ${classification}`))
    } else {
      results.push(pass('history-audit-artifact', classification))
    }
  }

  // 9) Repo visibility readiness is intentionally separate
  const historyClassification =
    results.find((r) => r.name === 'history-audit-artifact' && r.status === 'PASS')?.detail ??
    'missing'
  const publicHistoryTask = blueprintTaskStatus(PUBLIC_HISTORY_TASK_ID)
  const repoView = runReadinessCommand(
    'gh',
    ['repo', 'view', '--json', 'isPrivate,nameWithOwner'],
    process.env,
    { timeoutMs: GH_REPO_VIEW_TIMEOUT_MS },
  )
  let repoAlreadyPublic = false
  if (repoView.ok) {
    try {
      const parsed = JSON.parse(repoView.stdout) as { isPrivate?: boolean }
      repoAlreadyPublic = parsed.isPrivate === false
    } catch {
      // ignore parse failure; fall through to blueprint/history logic
    }
  }

  results.push(
    evaluateRepoVisibilityReadiness({
      repoAlreadyPublic,
      historyClassification,
      publicHistoryTaskStatus: publicHistoryTask,
    }),
  )

  const packageFailures = results.filter(
    (r) => ['FAIL'].includes(r.status) && r.name !== 'repo-visibility-readiness',
  )
  const repoVisibilityResult = results.find((r) => r.name === 'repo-visibility-readiness')

  const packageStatus: Status = packageFailures.length === 0 ? 'PASS' : 'FAIL'
  const repoStatus: Status = repoVisibilityResult?.status ?? 'FAIL'

  console.log(`Package readiness: ${packageStatus}`)
  console.log(`Repo visibility readiness: ${repoStatus}`)
  console.log('')
  for (const result of results) {
    console.log(`[${result.status}] ${result.name}: ${result.detail}`)
  }

  if (packageStatus === 'FAIL') process.exit(1)
  if (REQUIRE_REPO_VISIBILITY && repoStatus !== 'PASS') process.exit(1)
}
