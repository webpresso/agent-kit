#!/usr/bin/env bun

import { execFileSync } from 'node:child_process'
import { existsSync, readFileSync } from 'node:fs'
import { resolve } from 'node:path'

type Status = 'PASS' | 'FAIL' | 'BLOCKED'

interface CheckResult {
  readonly name: string
  readonly status: Status
  readonly detail: string
}

const ROOT = process.cwd()
const REQUIRE_REPO_VISIBILITY = process.argv.includes('--require-repo-visibility')
const HISTORY_AUDIT_PATH = resolve(ROOT, 'docs/research/2026-05-28-agent-kit-history-audit.md')
const BLUEPRINT_PATH = resolve(
  ROOT,
  'blueprints/in-progress/agent-kit-public-npm-cutover-implementation/_overview.md',
)

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
    ['scripts/public-consumer-smoke.ts', '--setup-only'],
    { ...process.env, WP_SKIP_UPDATE_CHECK: '1' },
  ] as const,
]) {
  const r = run(command, args, env)
  results.push(r.ok ? pass(name, 'ok') : fail(name, `exit ${r.code}`))
}

// 2) Package identity / metadata
const pkg = JSON.parse(read('package.json')) as {
  name?: string
  publishConfig?: { registry?: string; access?: string }
}

if (pkg.name !== '@webpresso/agent-kit') {
  results.push(fail('package-name', `expected @webpresso/agent-kit, got ${pkg.name ?? 'missing'}`))
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
  results.push(pass('package-metadata', '@webpresso/agent-kit + public npm publishConfig present'))
}

// 3) Tarball surface
const pack = run('npm', ['pack', '--dry-run', '--json'])
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
  'catalog/base-kit/.github/workflows/ci.webpresso.yml.tmpl',
]

const staleHits = countMatches(shippedSurfacePaths, [
  /npm\.pkg\.github\.com/,
  /GH_PACKAGES_TOKEN/,
  /\/Users\/ozby/,
  /~\/\.claude/,
  /ozby\/context-mode/,
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
