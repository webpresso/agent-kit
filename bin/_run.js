#!/usr/bin/env node

import { spawnSync } from 'node:child_process'
import { existsSync, readFileSync, readdirSync, statSync } from 'node:fs'
import { basename, dirname, join, relative } from 'node:path'
import { fileURLToPath } from 'node:url'

import {
  getDirectBinRuntimeArgs,
  isMigratedRuntimeWpInvocation,
  isRuntimeRequiredDirectBin,
} from './runtime-lanes.js'

export const BIN_ENTRYPOINTS = {
  wp: 'src/cli/cli.ts',
  'with-secrets': 'src/runtime/with-secrets-cli.ts',
  'wp-pretool-guard': 'src/hooks/pretool-guard/index.ts',
  'wp-post-tool': 'src/hooks/post-tool/lint-after-edit.ts',
  'wp-stop-qa': 'src/hooks/stop/qa-changed-files.ts',
  'wp-guard-switch': 'src/hooks/guard-switch/index.ts',
  'wp-test-quality-check': 'src/hooks/test-quality-check.ts',
  'wp-sessionstart-routing': 'src/hooks/sessionstart/index.ts',
  'wp-precompact-snapshot': 'src/hooks/precompact/index.ts',
  'docs-check-internal-links': 'src/config/docs-lint/cli/check-internal-links.ts',
  'docs-check-refs': 'src/config/docs-lint/cli/check-refs.ts',
  'docs-check-stale': 'src/config/docs-lint/cli/check-stale.ts',
  'docs-lint': 'src/config/docs-lint/cli/validate.ts',
  'docs-migrate': 'src/config/docs-lint/cli/migrate.ts',
}

const LATENCY_SENSITIVE_BUILT_BINS = new Set([
  'wp-pretool-guard',
  'wp-post-tool',
  'wp-stop-qa',
  'wp-guard-switch',
  'wp-test-quality-check',
  'wp-sessionstart-routing',
  'wp-precompact-snapshot',
])

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

function readPackageOptionalDependencies(repoRoot) {
  const packageJsonPath = join(repoRoot, 'package.json')
  if (!existsSync(packageJsonPath)) return {}
  try {
    const packageJson = JSON.parse(readFileSync(packageJsonPath, 'utf8'))
    return packageJson?.optionalDependencies && typeof packageJson.optionalDependencies === 'object'
      ? packageJson.optionalDependencies
      : {}
  } catch {
    return {}
  }
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

function formatMissingRuntimeDiagnostic({ binName, repoRoot, manifest, target, candidates }) {
  const packageDir = runtimePackageDirName(target.packageName)
  const packageRoot = join(repoRoot, 'node_modules', '@webpresso', packageDir)
  const optionalDependencies = readPackageOptionalDependencies(repoRoot)
  const optionalDependencyValue = optionalDependencies[target.packageName]
  const optionalDependencyDetail = optionalDependencyValue
    ? `optional dependency wiring declares ${target.packageName}@${optionalDependencyValue}.`
    : `optional dependency wiring for ${target.packageName} is missing from package.json.`

  return [
    `Unable to launch ${binName}: required platform runtime ${target.packageName} (${target.id}) is unavailable.`,
    `Runtime package absent or omitted: ${packageRoot}.`,
    `Runtime binary missing or corrupt: expected ${runtimeBinaryFilename(manifest, target)} in one of ${candidates.join(', ')}.`,
    optionalDependencyDetail,
    'This install is unsupported for migrated runtime-lane commands if optional dependencies were omitted (for example npm/pnpm --omit=optional).',
    'Run `wp hooks doctor` to diagnose the install, reinstall without omitting optional dependencies, or use a supported platform/arch target.',
  ].join(' ')
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

function shouldPreferBuiltDist(binName) {
  return LATENCY_SENSITIVE_BUILT_BINS.has(binName)
}

function isRuntimeSourceFile(name) {
  return (
    name.endsWith('.ts') &&
    !name.endsWith('.test.ts') &&
    !name.endsWith('.integration.test.ts') &&
    !name.endsWith('.spec.ts')
  )
}

function runtimeSourceRequiresSourceLaunch(sourceRootDir, builtRootDir) {
  if (!existsSync(sourceRootDir)) return false

  const stack = [sourceRootDir]
  while (stack.length > 0) {
    const current = stack.pop()
    if (!current) continue

    for (const entry of readdirSync(current, { withFileTypes: true })) {
      const sourcePath = join(current, entry.name)
      if (entry.isDirectory()) {
        stack.push(sourcePath)
        continue
      }
      if (!entry.isFile() || !isRuntimeSourceFile(entry.name)) continue

      const relPath = relative(sourceRootDir, sourcePath)
      const builtPath = join(builtRootDir, relPath.replace(/\.ts$/u, '.js'))
      if (!existsSync(builtPath)) return true
      if (statSync(sourcePath).mtimeMs > statSync(builtPath).mtimeMs) return true
    }
  }

  return false
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
  allowRuntimeFallback,
}) {
  const selectorArgs =
    binName === 'wp'
      ? isMigratedRuntimeWpInvocation(forwardedArgs) || forceCompiledRuntime
        ? []
        : null
      : getDirectBinRuntimeArgs(binName)
  if (!selectorArgs) return null
  if (binName === 'wp') {
    if (!isMigratedRuntimeWpInvocation(forwardedArgs) && !forceCompiledRuntime) return null
  }

  const manifest = runtimeManifest ?? readRuntimeManifest(repoRoot)
  if (!manifest) {
    if (allowRuntimeFallback) return null
    throw new Error(
      [
        `Unable to launch ${binName}: required compiled runtime manifest is missing at bin/runtime-manifest.json.`,
        'This install is unsupported for migrated runtime-lane commands; reinstall @webpresso/agent-kit without omitting package files.',
      ].join(' '),
    )
  }

  const target = resolveRuntimeTarget(manifest, platform, arch)
  if (!target) {
    if (allowRuntimeFallback) return null
    throw new Error(
      [
        `Unable to launch ${binName}: unsupported platform/arch target ${platform}/${arch}.`,
        'No platform runtime package is declared for this host in bin/runtime-manifest.json.',
      ].join(' '),
    )
  }

  const candidates = runtimeBinaryPath
    ? [runtimeBinaryPath]
    : resolveRuntimeBinaryCandidates(repoRoot, manifest, target)
  const binaryPath = candidates.find((candidate) =>
    runtimeBinaryExists ? runtimeBinaryExists(candidate) : existsSync(candidate),
  )

  if (!binaryPath) {
    if (allowRuntimeFallback) return null
    throw new Error(
      formatMissingRuntimeDiagnostic({ binName, repoRoot, manifest, target, candidates }),
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
      WP_AGENT_KIT_ROOT: repoRoot,
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
  sourceOverride = process.env.WP_FORCE_SOURCE === '1',
  nodeExecPath = process.execPath,
  currentNodeVersion = process.version,
  pinnedNodeVersion = resolvePinnedNodeVersion(repoRoot),
  runtimeManager = resolveNodeRuntimeManager(),
  builtMtimeMs,
  sourceMtimeMs,
  sourceNeedsSourceLaunch,
}) {
  const sourceRelativePath = BIN_ENTRYPOINTS[binName]
  if (!sourceRelativePath) {
    throw new Error(`Unknown webpresso bin: ${binName}`)
  }

  const sourceEntrypoint = join(repoRoot, sourceRelativePath)
  const hasSource = sourceExists ?? existsSync(sourceEntrypoint)

  // WP_FORCE_SOURCE=1 forces agent-kit's own dev CLI gates (audit/test/lint/...) to run
  // from source, so a stale compiled `bin/runtime/<arch>/wp` never gates dev work. It is
  // the explicit counterpart to WP_FORCE_COMPILED_RUNTIME and wins when both are set.
  // Excludes the latency-sensitive per-tool-call hook bins (shouldPreferBuiltDist) so a
  // global `export WP_FORCE_SOURCE=1` doesn't pay cold-bun startup on every Edit/Write;
  // iterate on hook code via `bun src/hooks/...` instead. No-op without source (consumers).
  if (sourceOverride && hasSource && !shouldPreferBuiltDist(binName)) {
    return buildSourceLaunchPlan(sourceEntrypoint, forwardedArgs)
  }

  const runtimeRequired =
    binName === 'wp'
      ? isMigratedRuntimeWpInvocation(forwardedArgs)
      : isRuntimeRequiredDirectBin(binName)
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
    allowRuntimeFallback: !forceCompiledRuntime && hasSource && runtimeRequired,
  })
  if (runtimePlan) return runtimePlan

  const builtRelativePath = sourceToBuiltRelativePath(sourceRelativePath)
  const builtEntrypoint = join(repoRoot, builtRelativePath)

  const hasBuilt = builtExists ?? existsSync(builtEntrypoint)
  const resolvedBuiltMtimeMs =
    builtMtimeMs ??
    (builtExists === undefined && hasBuilt ? statSync(builtEntrypoint).mtimeMs : null)
  const resolvedSourceNeedsSourceLaunch =
    sourceNeedsSourceLaunch ??
    (!shouldPreferBuiltDist(binName) &&
      hasSource &&
      (binName === 'wp'
        ? runtimeSourceRequiresSourceLaunch(
            join(repoRoot, 'src', 'cli'),
            join(repoRoot, 'dist', 'esm', 'cli'),
          )
        : typeof sourceMtimeMs === 'number' && typeof resolvedBuiltMtimeMs === 'number'
          ? sourceMtimeMs > resolvedBuiltMtimeMs
          : hasBuilt && hasSource
            ? statSync(sourceEntrypoint).mtimeMs > statSync(builtEntrypoint).mtimeMs
            : false))
  const shouldPreferSource =
    !shouldPreferBuiltDist(binName) && hasSource && resolvedSourceNeedsSourceLaunch

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
