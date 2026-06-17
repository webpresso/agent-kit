import { existsSync, readFileSync, readdirSync, writeFileSync } from 'node:fs'
import { spawnSync } from 'node:child_process'
import { dirname, relative, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'

import { preparePackedManifest, restorePackedManifest } from '../src/build/package-manifest.js'
import { RUNTIME_TARGETS, runtimePackageDirName } from '../src/build/runtime-targets.js'
import {
  PUBLISH_RUNTIME_MATRIX_ENV,
  shouldPublishRuntimeMatrix,
} from '../src/build/release-policy.js'

const ALREADY_PUBLISHED_PATTERNS = [
  /cannot publish over the previously published version/i,
  /cannot publish over the previously published versions/i,
  /you cannot publish over the previously published version/i,
  /you cannot publish over the previously published versions/i,
]

const RELEASE_PUBLISH_RESULT_FILE_ENV = 'RELEASE_PUBLISH_RESULT_FILE'
const ROOT_PACKAGE_NAME = '@webpresso/agent-kit'

type PublishState = 'published' | 'already-published'

interface PackageManifest {
  name?: string
  version?: string
  private?: boolean
}

interface PublishablePackage {
  name: string
  version: string
  root: string
  manifestPath: string
}

interface PublishedPackage {
  packageName: string
  version: string
  publishState: PublishState
}

function run(command: string, args: string[], cwd = process.cwd()) {
  const result = spawnSync(command, args, {
    cwd,
    encoding: 'utf8',
    stdio: 'pipe',
    env: process.env,
  })
  if (result.stdout) process.stdout.write(result.stdout)
  if (result.stderr) process.stderr.write(result.stderr)
  return result
}

function exitCode(result: ReturnType<typeof run>): number {
  return result.status ?? 1
}

function readManifest(manifestPath: string): PackageManifest {
  return JSON.parse(readFileSync(manifestPath, 'utf8')) as PackageManifest
}

function readPublishablePackage(packageRoot: string): PublishablePackage | null {
  const manifestPath = resolve(packageRoot, 'package.json')
  if (!existsSync(manifestPath)) return null
  const manifest = readManifest(manifestPath)
  if (manifest.private === true) return null
  if (!manifest.name || !manifest.version) return null
  if (!manifest.name.startsWith('@webpresso/')) return null
  return { name: manifest.name, version: manifest.version, root: packageRoot, manifestPath }
}

function discoverWorkspacePackages(root: string): PublishablePackage[] {
  const packagesRoot = resolve(root, 'packages')
  if (!existsSync(packagesRoot)) return []
  return readdirSync(packagesRoot, { withFileTypes: true })
    .filter((entry) => entry.isDirectory())
    .map((entry) => readPublishablePackage(resolve(packagesRoot, entry.name)))
    .filter((entry): entry is PublishablePackage => entry !== null)
    .toSorted((left, right) => left.name.localeCompare(right.name))
}

function npmView(packageSpecifier: string, field: string): string | null {
  const result = spawnSync('npm', ['view', packageSpecifier, field, '--json'], {
    encoding: 'utf8',
    stdio: 'pipe',
    env: process.env,
  })
  if (result.status !== 0) return null
  const raw = result.stdout.trim()
  if (!raw) return null
  try {
    const parsed = JSON.parse(raw) as unknown
    return typeof parsed === 'string' ? parsed : null
  } catch {
    return raw.replace(/^"|"$/g, '')
  }
}

function npmVersionExists(packageName: string, version: string): boolean {
  return npmView(`${packageName}@${version}`, 'version') === version
}

function npmLatestVersion(packageName: string): string | null {
  return npmView(packageName, 'version')
}

function compareVersions(left: string, right: string): number {
  const leftParts = parseVersion(left)
  const rightParts = parseVersion(right)
  for (let index = 0; index < 3; index += 1) {
    const delta = (leftParts[index] ?? 0) - (rightParts[index] ?? 0)
    if (delta !== 0) return delta
  }
  return 0
}

function parseVersion(version: string): [number, number, number] {
  const match = /^(\d+)\.(\d+)\.(\d+)/.exec(version)
  return [Number(match?.[1] ?? 0), Number(match?.[2] ?? 0), Number(match?.[3] ?? 0)]
}

function assertNotBehindRegistry(pkg: PublishablePackage): void {
  const latest = npmLatestVersion(pkg.name)
  if (latest && compareVersions(pkg.version, latest) < 0) {
    throw new Error(
      `${pkg.name}@${pkg.version} is behind npm latest ${latest}. ` +
        'Sync the local package manifest to the published baseline before creating a new changeset.',
    )
  }
}

function manifestVersionChangedSinceFirstParent(pkg: PublishablePackage): boolean {
  const relativeManifestPath = relative(packageRoot, pkg.manifestPath)
  const result = spawnSync('git', ['show', `HEAD^:${relativeManifestPath}`], {
    cwd: packageRoot,
    encoding: 'utf8',
    stdio: 'pipe',
    env: process.env,
  })
  if (result.status !== 0) return true
  try {
    const previous = JSON.parse(result.stdout) as PackageManifest
    return previous.version !== pkg.version
  } catch {
    return true
  }
}

function publishSimpleWorkspacePackage(pkg: PublishablePackage): PublishState | null {
  assertNotBehindRegistry(pkg)
  if (npmVersionExists(pkg.name, pkg.version)) {
    if (manifestVersionChangedSinceFirstParent(pkg)) {
      process.stdout.write(
        `[release:publish] ${pkg.name}@${pkg.version} already published; treating as success\n`,
      )
      return 'already-published'
    }
    process.stdout.write(`[release:publish] ${pkg.name}@${pkg.version} already published; skipping\n`)
    return null
  }

  const buildResult = run('pnpm', ['--filter', pkg.name, 'run', 'build'], packageRoot)
  if (exitCode(buildResult) !== 0) process.exit(exitCode(buildResult))

  const publishResult = run('npm', ['publish', '--provenance', '--access', 'public'], pkg.root)
  if (exitCode(publishResult) === 0) return 'published'

  const combinedOutput = `${publishResult.stdout ?? ''}\n${publishResult.stderr ?? ''}`
  if (ALREADY_PUBLISHED_PATTERNS.some((pattern) => pattern.test(combinedOutput))) {
    process.stdout.write(`[release:publish] ${pkg.name}@${pkg.version} already published; treating as success\n`)
    return 'already-published'
  }
  process.exit(exitCode(publishResult))
}

function toPublishedPackage(pkg: PublishablePackage, publishState: PublishState): PublishedPackage {
  return {
    packageName: pkg.name,
    version: pkg.version,
    publishState,
  }
}

function writePublishResultFile(packages: readonly PublishedPackage[]) {
  const resultPath = process.env[RELEASE_PUBLISH_RESULT_FILE_ENV]
  if (!resultPath) return
  if (packages.length === 0) return

  const primaryPackage =
    packages.find((publishedPackage) => publishedPackage.packageName === ROOT_PACKAGE_NAME) ??
    packages[0]
  if (!primaryPackage) {
    return
  }

  writeFileSync(
    resultPath,
    JSON.stringify(
      {
        packageName: primaryPackage.packageName,
        version: primaryPackage.version,
        publishState: primaryPackage.publishState,
        packages,
      },
      null,
      2,
    ),
    'utf8',
  )
}

const scriptDir = dirname(fileURLToPath(import.meta.url))
const packageRoot = dirname(scriptDir)
const rootPackage = readPublishablePackage(packageRoot)
if (!rootPackage || rootPackage.name !== ROOT_PACKAGE_NAME) {
  throw new Error(`release-publish must run from ${ROOT_PACKAGE_NAME}`)
}

const publishedPackages: PublishedPackage[] = []
for (const workspacePackage of discoverWorkspacePackages(packageRoot)) {
  if (workspacePackage.name === ROOT_PACKAGE_NAME) continue
  const publishState = publishSimpleWorkspacePackage(workspacePackage)
  if (publishState) {
    publishedPackages.push(toPublishedPackage(workspacePackage, publishState))
  }
}

const rootVersionExists = npmVersionExists(rootPackage.name, rootPackage.version)
const rootVersionChanged = manifestVersionChangedSinceFirstParent(rootPackage)
if (rootVersionExists && !rootVersionChanged) {
  process.stdout.write(
    `[release:publish] ${rootPackage.name}@${rootPackage.version} already published and unchanged; skipping root publish\n`,
  )
  writePublishResultFile(publishedPackages)
  process.exit(0)
}
assertNotBehindRegistry(rootPackage)

const buildResult = run('pnpm', ['run', 'build'])
if (exitCode(buildResult) !== 0) {
  process.exit(exitCode(buildResult))
}

// The native runtime matrix is part of the canonical public package surface.
// Publish it before the root package so consumers can resolve the staged native
// launcher from the same version cut.
if (shouldPublishRuntimeMatrix(process.env)) {
  const runtimeBuildResult = run('pnpm', ['run', 'build:runtime-binaries'])
  if (exitCode(runtimeBuildResult) !== 0) {
    process.exit(exitCode(runtimeBuildResult))
  }

  const runtimeStageResult = run('pnpm', ['run', 'stage:plugin-runtime'])
  if (exitCode(runtimeStageResult) !== 0) {
    process.exit(exitCode(runtimeStageResult))
  }

  const runtimePackageRoot = resolve(packageRoot, 'dist', 'runtime-packages')
  for (const target of RUNTIME_TARGETS) {
    const runtimePackage = runtimePackageDirName(target.packageName)
    const runtimePublishResult = run(
      'npm',
      ['publish', '--provenance', '--access', 'public'],
      resolve(runtimePackageRoot, runtimePackage),
    )
    if (exitCode(runtimePublishResult) !== 0) {
      const combinedOutput = `${runtimePublishResult.stdout ?? ''}\n${runtimePublishResult.stderr ?? ''}`
      if (ALREADY_PUBLISHED_PATTERNS.some((pattern) => pattern.test(combinedOutput))) {
        process.stdout.write(
          `[release:publish] ${runtimePackage} already published; treating as success\n`,
        )
        continue
      }
      process.exit(exitCode(runtimePublishResult))
    }
  }
} else {
  process.stdout.write(
    `[release:publish] runtime matrix publish skipped by explicit override. ` +
      `Unset ${PUBLISH_RUNTIME_MATRIX_ENV} or set it to 1 to publish the ` +
      `@webpresso/agent-kit-runtime-* packages.\n`,
  )
}

let publishExitCode = 1
let rootManifestPrepared = false
let rootPublishState: PublishState | null = null

try {
  preparePackedManifest(packageRoot)
  rootManifestPrepared = true

  const publishResult = run('npm', [
    'publish',
    '--ignore-scripts',
    '--provenance',
    '--access',
    'public',
  ])
  publishExitCode = exitCode(publishResult)
  if (publishExitCode !== 0) {
    const combinedOutput = `${publishResult.stdout ?? ''}\n${publishResult.stderr ?? ''}`
    if (ALREADY_PUBLISHED_PATTERNS.some((pattern) => pattern.test(combinedOutput))) {
      process.stdout.write('[release:publish] version already published; treating as success\n')
      publishExitCode = 0
      rootPublishState = 'already-published'
    }
  } else {
    rootPublishState = 'published'
  }
} finally {
  if (rootManifestPrepared) {
    restorePackedManifest(packageRoot)
  }
}

if (publishExitCode === 0 && rootPublishState) {
  publishedPackages.push(toPublishedPackage(rootPackage, rootPublishState))
  writePublishResultFile(publishedPackages)
}

process.exit(publishExitCode)
