#!/usr/bin/env node

import { spawnSync } from 'node:child_process'
import { existsSync, readFileSync, statSync } from 'node:fs'
import { basename, dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'

export const BIN_ENTRYPOINTS = {
  wp: 'src/cli/cli.ts',
  'wp-pretool-guard': 'src/hooks/pretool-guard/index.ts',
  'wp-post-tool': 'src/hooks/post-tool/lint-after-edit.ts',
  'wp-stop-qa': 'src/hooks/stop/qa-changed-files.ts',
  'wp-guard-switch': 'src/hooks/guard-switch/index.ts',
  'wp-test-quality-check': 'src/hooks/test-quality-check.ts',
  'wp-sessionstart-routing': 'src/hooks/sessionstart/index.ts',
  'wp-check-dev-link': 'src/hooks/check-dev-link/index.ts',
  'wp-restore-dev-links': 'src/dev/restore-dev-links/index.ts',
  'docs-check-internal-links': 'src/config/docs-lint/cli/check-internal-links.ts',
  'docs-check-refs': 'src/config/docs-lint/cli/check-refs.ts',
  'docs-check-stale': 'src/config/docs-lint/cli/check-stale.ts',
  'docs-lint': 'src/config/docs-lint/cli/validate.ts',
  'docs-migrate': 'src/config/docs-lint/cli/migrate.ts',
}

const RUNTIME_BIN_ARGS = {
  wp: [],
  'wp-pretool-guard': ['hook', 'pretool-guard'],
  'wp-post-tool': ['hook', 'post-tool'],
  'wp-stop-qa': ['hook', 'stop-qa'],
  'wp-guard-switch': ['hook', 'guard-switch'],
  'wp-sessionstart-routing': ['hook', 'sessionstart-routing'],
}

function resolvePackageRoot() {
  return join(dirname(fileURLToPath(import.meta.url)), '..')
}

function normalizeNodeVersion(version) {
  return version.replace(/^v/u, '')
}

function isExactNodeVersion(version) {
  return /^\d+\.\d+\.\d+$/u.test(version)
}

function readTextIfExists(path) {
  return existsSync(path) ? readFileSync(path, 'utf8').trim() : null
}

function readRuntimeManifest(repoRoot) {
  const manifestPath = join(repoRoot, 'bin', 'runtime-manifest.json')
  if (!existsSync(manifestPath)) return null

  try {
    return JSON.parse(readFileSync(manifestPath, 'utf8'))
  } catch (error) {
    throw new Error(
      `Unable to read compiled runtime manifest at ${manifestPath}: ${
        error instanceof Error ? error.message : String(error)
      }`,
    )
  }
}

function resolveRuntimeTarget(manifest, platform, arch) {
  const targets = Array.isArray(manifest?.targets) ? manifest.targets : []
  return targets.find((target) => target?.os === platform && target?.cpu === arch) ?? null
}

function runtimeBinaryFilename(manifest, target) {
  const binaryName = typeof manifest?.binaryName === 'string' ? manifest.binaryName : 'wp'
  return target?.os === 'win32' ? `${binaryName}.exe` : binaryName
}

function runtimePackageDirName(packageName) {
  return String(packageName).split('/').at(-1)
}

function resolveRuntimeBinaryCandidates(repoRoot, manifest, target) {
  const filename = runtimeBinaryFilename(manifest, target)
  const packageDir = runtimePackageDirName(target.packageName)
  return [
    join(repoRoot, 'bin', 'runtime', target.id, filename),
    join(repoRoot, 'dist', 'runtime', target.id, filename),
    join(repoRoot, '..', packageDir, 'bin', filename),
    join(repoRoot, 'node_modules', '@webpresso', packageDir, 'bin', filename),
  ]
}

export function resolvePinnedNodeVersion(repoRoot = resolvePackageRoot()) {
  const nodeVersionFile = readTextIfExists(join(repoRoot, '.node-version'))
  if (nodeVersionFile && isExactNodeVersion(nodeVersionFile)) return nodeVersionFile

  const nvmrc = readTextIfExists(join(repoRoot, '.nvmrc'))
  if (nvmrc && isExactNodeVersion(nvmrc)) return nvmrc

  const packageJsonPath = join(repoRoot, 'package.json')
  if (!existsSync(packageJsonPath)) return null

  try {
    const packageJson = JSON.parse(readFileSync(packageJsonPath, 'utf8'))
    const engineNode = packageJson?.engines?.node
    return typeof engineNode === 'string' && isExactNodeVersion(engineNode) ? engineNode : null
  } catch {
    return null
  }
}

export function resolveNodeRuntimeManager() {
  const result = spawnSync('mise', ['--version'], { encoding: 'utf8' })
  if (!result.error && (result.status === 0 || result.status === null)) {
    return { kind: 'mise', command: 'mise' }
  }

  return null
}

function sourceToBuiltRelativePath(sourceRelativePath) {
  if (!sourceRelativePath.startsWith('src/')) {
    throw new Error(`Unsupported bin source path: ${sourceRelativePath}`)
  }
  return `dist/esm/${sourceRelativePath.slice(4).replace(/\.ts$/u, '.js')}`
}

function buildSourceLaunchPlan(sourceEntrypoint, forwardedArgs) {
  return {
    mode: 'source',
    runtime: process.env.BUN ?? 'bun',
    entrypoint: sourceEntrypoint,
    args: [sourceEntrypoint, ...forwardedArgs],
  }
}

function buildRuntimeLaunchPlan({
  binName,
  repoRoot,
  forwardedArgs,
  platform,
  arch,
  runtimeManifest,
  runtimeBinaryExists,
  runtimeBinaryPath,
  forceCompiledRuntime,
}) {
  const selectorArgs = RUNTIME_BIN_ARGS[binName]
  if (!selectorArgs) return null

  const manifest = runtimeManifest ?? readRuntimeManifest(repoRoot)
  if (!manifest) return null

  const target = resolveRuntimeTarget(manifest, platform, arch)
  if (!target) {
    if (!forceCompiledRuntime) return null
    throw new Error(
      `Unable to launch ${binName}: no compiled runtime target for ${platform}/${arch}.`,
    )
  }

  const candidates = runtimeBinaryPath
    ? [runtimeBinaryPath]
    : resolveRuntimeBinaryCandidates(repoRoot, manifest, target)
  const binaryPath = candidates.find((candidate) =>
    runtimeBinaryExists ? runtimeBinaryExists(candidate) : existsSync(candidate),
  )

  if (!binaryPath) {
    if (!forceCompiledRuntime) return null
    throw new Error(
      [
        `Unable to launch ${binName}: compiled runtime target ${target.id} is missing.`,
        `Looked for ${candidates.join(', ')}.`,
        'Run `wp hooks doctor` to diagnose the install, or rebuild/reinstall the runtime package.',
      ].join(' '),
    )
  }

  return {
    mode: 'runtime',
    runtime: binaryPath,
    entrypoint: binaryPath,
    args: [...selectorArgs, ...forwardedArgs],
    env: {
      ...process.env,
      WP_COMPILED_RUNTIME: '1',
      WP_MCP_TOOL_MODE: 'registry',
    },
  }
}

export function resolveInvokedBinName(argv = process.argv.slice(1)) {
  const invoked = argv[0]
  if (typeof invoked !== 'string' || invoked.length === 0) {
    throw new Error('Unable to determine which webpresso bin was invoked.')
  }
  return basename(invoked).replace(/\.js$/u, '')
}

export function buildLaunchPlan({
  binName,
  repoRoot = resolvePackageRoot(),
  forwardedArgs = process.argv.slice(2),
  platform = process.platform,
  arch = process.arch,
  builtExists,
  sourceExists,
  runtimeBinaryExists,
  runtimeBinaryPath,
  runtimeManifest,
  forceCompiledRuntime = process.env.WP_FORCE_COMPILED_RUNTIME === '1',
  nodeExecPath = process.execPath,
  currentNodeVersion = process.version,
  pinnedNodeVersion = resolvePinnedNodeVersion(repoRoot),
  runtimeManager = resolveNodeRuntimeManager(),
  builtMtimeMs,
  sourceMtimeMs,
}) {
  const sourceRelativePath = BIN_ENTRYPOINTS[binName]
  if (!sourceRelativePath) {
    throw new Error(`Unknown webpresso bin: ${binName}`)
  }

  const runtimePlan = buildRuntimeLaunchPlan({
    binName,
    repoRoot,
    forwardedArgs,
    platform,
    arch,
    runtimeManifest,
    runtimeBinaryExists,
    runtimeBinaryPath,
    forceCompiledRuntime,
  })
  if (runtimePlan) return runtimePlan

  const builtRelativePath = sourceToBuiltRelativePath(sourceRelativePath)
  const builtEntrypoint = join(repoRoot, builtRelativePath)
  const sourceEntrypoint = join(repoRoot, sourceRelativePath)

  const hasBuilt = builtExists ?? existsSync(builtEntrypoint)
  const hasSource = sourceExists ?? existsSync(sourceEntrypoint)
  const resolvedBuiltMtimeMs =
    builtMtimeMs ??
    (builtExists === undefined && hasBuilt ? statSync(builtEntrypoint).mtimeMs : null)
  const resolvedSourceMtimeMs =
    sourceMtimeMs ??
    (sourceExists === undefined && hasSource ? statSync(sourceEntrypoint).mtimeMs : null)
  const shouldPreferSource =
    hasSource &&
    typeof resolvedBuiltMtimeMs === 'number' &&
    typeof resolvedSourceMtimeMs === 'number' &&
    resolvedSourceMtimeMs > resolvedBuiltMtimeMs

  if (shouldPreferSource) {
    return buildSourceLaunchPlan(sourceEntrypoint, forwardedArgs)
  }

  if (hasBuilt) {
    const normalizedCurrent = normalizeNodeVersion(currentNodeVersion)
    if (
      pinnedNodeVersion &&
      isExactNodeVersion(pinnedNodeVersion) &&
      normalizedCurrent !== pinnedNodeVersion
    ) {
      if (runtimeManager?.kind === 'mise') {
        return {
          mode: 'built',
          runtime: runtimeManager.command,
          entrypoint: builtEntrypoint,
          args: [
            'exec',
            `node@${pinnedNodeVersion}`,
            '--',
            nodeExecPath,
            builtEntrypoint,
            ...forwardedArgs,
          ],
        }
      }

      throw new Error(
        [
          `Unable to launch ${binName}: current Node is ${normalizedCurrent}, but this package pins Node ${pinnedNodeVersion}.`,
          'Install `mise` or switch to the pinned Node version before retrying.',
        ].join(' '),
      )
    }

    return {
      mode: 'built',
      runtime: nodeExecPath,
      entrypoint: builtEntrypoint,
      args: [builtEntrypoint, ...forwardedArgs],
    }
  }

  if (hasSource) {
    return buildSourceLaunchPlan(sourceEntrypoint, forwardedArgs)
  }

  throw new Error(
    [
      `Unable to launch ${binName}: neither ${builtRelativePath} nor ${sourceRelativePath} exists.`,
      'Run `wp hooks doctor` to diagnose the install, or rebuild/reinstall the package before retrying.',
    ].join(' '),
  )
}

export function runNamedBin(binName, argv = process.argv.slice(2)) {
  const plan = buildLaunchPlan({ binName, forwardedArgs: argv })
  const child = spawnSync(plan.runtime, plan.args, {
    stdio: 'inherit',
    env: plan.env ?? process.env,
  })

  if (child.error) {
    const detail =
      plan.mode === 'source'
        ? `Bun is required for source-checkout fallback (${plan.entrypoint}). Install bun or rebuild so dist/esm exists.`
        : child.error.message
    throw new Error(detail)
  }

  if (child.signal) {
    process.kill(process.pid, child.signal)
    return
  }

  process.exit(child.status ?? 1)
}
