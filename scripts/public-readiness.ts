#!/usr/bin/env bun

import { execFileSync } from 'node:child_process'
import { existsSync, readFileSync } from 'node:fs'
import { resolve } from 'node:path'

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

type Status = 'PASS' | 'FAIL' | 'BLOCKED'

interface CheckResult {
  readonly name: string
  readonly status: Status
  readonly detail: string
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
  'blueprints/completed/2026-06-01-agent-kit-global-distribution-mcp-runtime-fix.md',
)

const DENIED_PACKED_RUNTIME_PREFIXES = [
  'bin/runtime/',
  'dist/runtime/',
  'dist/runtime-packages/',
] as const

function run(
  command: string,
  args: string[],
  env: NodeJS.ProcessEnv = process.env,
): { readonly stdout: string; readonly ok: boolean; readonly code: number } {
  try {
    const stdout = execFileSync(command, args, {
      cwd: ROOT,
      env,
      encoding: 'utf8',
      stdio: ['ignore', 'pipe', 'pipe'],
    })
    return { stdout, ok: true, code: 0 }
  } catch (error) {
    const e = error as { stdout?: string; status?: number }
    return { stdout: String(e.stdout ?? ''), ok: false, code: e.status ?? 1 }
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
  return packedFiles.filter((path) =>
    DENIED_PACKED_RUNTIME_PREFIXES.some((prefix) => path.startsWith(prefix)),
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

if (import.meta.main) {
  const results: CheckResult[] = []

  // 1) Existing gate commands
  for (const [name, command, args, env] of [
    ['forbidden-env-files', 'bun', ['scripts/check-no-dev-vars.ts'], process.env] as const,
    [
      'secret-provider-quarantine',
      'bun',
      ['scripts/audit-secret-provider-quarantine.ts'],
      process.env,
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
    [
      'packed-consumer-setup-smoke',
      'bun',
      ['scripts/public-consumer-smoke.ts', '--setup-only', '--skip-build'],
      { ...process.env, WP_SKIP_UPDATE_CHECK: '1' },
    ] as const,
  ]) {
    const r = run(command, args, env)
    results.push(r.ok ? pass(name, 'ok') : fail(name, `exit ${r.code}`))
  }

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
  let pack: ReturnType<typeof run> = { code: 1, ok: false, stdout: '' }
  try {
    syncBlueprintMigrationSqlAssets(ROOT)
    preparePackedManifest(ROOT)
    pack = run('npm', ['pack', '--ignore-scripts', '--dry-run', '--json'])
  } finally {
    restorePackedManifest(ROOT)
  }
  if (!pack.ok) {
    results.push(fail('npm-pack', `exit ${pack.code}`))
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
            'thin-root tarball keeps manifest + launcher and excludes runtime payload trees',
          )
        : fail(
            'tarball-native-runtime-surface',
            [
              missingRuntimePaths.length
                ? `missing required packed runtime paths: ${missingRuntimePaths.join(', ')}`
                : null,
              leakedRuntimePayloadPaths.length
                ? `denied packed runtime payloads: ${leakedRuntimePayloadPaths.join(', ')}`
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

  if (pack.ok) {
    const parsed = JSON.parse(pack.stdout.match(/\[.*\]/s)?.[0] ?? '[]')[0] as
      | { files?: Array<{ path: string }> }
      | undefined
    const files = parsed?.files?.map((f) => f.path) ?? []
    const sessionNativePrefix = `${['native', 'session-memory-engine'].join('/')}/`
    const sessionNativePaths = files.filter((path) => path.startsWith(sessionNativePrefix))
    results.push(
      sessionNativePaths.length === 0
        ? pass(
            'tarball-session-memory-local-store',
            'packed artifact excludes the retired native session-memory workspace',
          )
        : fail(
            'tarball-session-memory-local-store',
            `retired native session-memory paths still ship: ${sessionNativePaths.join(', ')}`,
          ),
    )
  }

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

  // 6) Generated artifact regression
  const testPlanFiles = run('git', ['ls-files', '.test-plan-service/**'])
  results.push(
    testPlanFiles.stdout.trim() === ''
      ? pass('tracked-generated-artifacts', 'no tracked .test-plan-service artifacts')
      : fail('tracked-generated-artifacts', testPlanFiles.stdout.trim()),
  )

  // 7) History strategy evidence
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

  // 8) Repo visibility readiness is intentionally separate
  const historyClassification =
    results.find((r) => r.name === 'history-audit-artifact' && r.status === 'PASS')?.detail ??
    'missing'
  const task43 = blueprintTaskStatus('4.3')
  const repoView = run('gh', ['repo', 'view', '--json', 'isPrivate,nameWithOwner'])
  let repoAlreadyPublic = false
  if (repoView.ok) {
    try {
      const parsed = JSON.parse(repoView.stdout) as { isPrivate?: boolean }
      repoAlreadyPublic = parsed.isPrivate === false
    } catch {
      // ignore parse failure; fall through to blueprint/history logic
    }
  }

  if (repoAlreadyPublic) {
    results.push(
      pass(
        'repo-visibility-readiness',
        'repository already public; snapshot strategy superseded by operator override',
      ),
    )
  } else if (historyClassification === 'forward-only-acceptable') {
    results.push(pass('repo-visibility-readiness', 'forward-only-acceptable'))
  } else if (
    (historyClassification === 'clean-public-snapshot-preferred' ||
      historyClassification === 'rewrite-required') &&
    task43 === 'done'
  ) {
    results.push(pass('repo-visibility-readiness', `${historyClassification} executed`))
  } else if (
    historyClassification === 'clean-public-snapshot-preferred' ||
    historyClassification === 'rewrite-required'
  ) {
    results.push(
      blocked('repo-visibility-readiness', `${historyClassification}; Task 4.3 still pending`),
    )
  } else {
    results.push(fail('repo-visibility-readiness', 'missing or invalid history strategy evidence'))
  }

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
