import { spawnSync } from 'node:child_process'
import { dirname, resolve } from 'node:path'
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

const scriptDir = dirname(fileURLToPath(import.meta.url))
const packageRoot = dirname(scriptDir)

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
    }
  }
} finally {
  if (rootManifestPrepared) {
    restorePackedManifest(packageRoot)
  }
}

process.exit(publishExitCode)
