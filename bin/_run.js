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
  builtExists,
  sourceExists,
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

  const builtRelativePath = sourceToBuiltRelativePath(sourceRelativePath)
  const builtEntrypoint = join(repoRoot, builtRelativePath)
  const sourceEntrypoint = join(repoRoot, sourceRelativePath)

  const hasBuilt = builtExists ?? existsSync(builtEntrypoint)
  const hasSource = sourceExists ?? existsSync(sourceEntrypoint)
  const resolvedBuiltMtimeMs =
    builtMtimeMs ?? (builtExists === undefined && hasBuilt ? statSync(builtEntrypoint).mtimeMs : null)
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
  const child = spawnSync(plan.runtime, plan.args, { stdio: 'inherit' })

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
