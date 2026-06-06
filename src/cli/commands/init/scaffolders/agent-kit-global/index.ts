/**
 * `agent-kit-global` self-update scaffolder.
 *
 * Keeps the ONE globally-distributed `@webpresso/agent-kit` binary fresh on
 * every `wp setup`, mirroring how omx / omc / codex / claude self-update their
 * own global installs. The PATH `wp`, the Claude plugin MCP, and the agent
 * hooks all resolve to this single global binary, so refreshing it here means
 * the next invocation everywhere runs the latest published release.
 *
 * Uses the exact same command the auto-update installer infers
 * (`buildVpGlobalInstallCommand` — single source of truth), so there is no
 * second place that can drift on the install incantation.
 *
 * Skipped (no-op, non-fatal) when:
 *   - `--dry-run` (no writes anywhere),
 *   - `WP_SKIP_AUTO_INSTALL=1` (the documented opt-out, surfaced in the update
 *     banner),
 *   - the running binary resolves into a webpresso source/git clone — a global
 *     install would clobber the developer's working clone with a published
 *     tarball (`detectGitInstall`),
 *   - `vp` is not on PATH (nothing to install with).
 *
 * A failed refresh is reported but NEVER fails consumer setup: keeping the
 * global tool current is ancillary to scaffolding the consumer repo (same
 * warn-only contract as the codex-cli scaffolder).
 */
import { spawnSync } from 'node:child_process'
import {
  chmodSync,
  copyFileSync,
  existsSync,
  mkdirSync,
  readFileSync,
  statSync,
} from 'node:fs'
import { dirname, join } from 'node:path'

import type { MergeOptions } from '#cli/commands/init/merge'
import {
  findAgentKitPackageRoot,
  resolveAgentKitPackageRoot,
} from '#cli/commands/init/package-root'
import { makeNoopSpinnerFactory, type SpinnerFactory } from '#cli/commands/init/scaffolders/spinner'
import {
  buildVpGlobalInstallCommand,
  detectGitInstall,
  PUBLIC_PACKAGE_NAME,
} from '#cli/auto-update/detect-pm.js'

export interface EnsureAgentKitGlobalInput {
  options: MergeOptions
  /** DI seam for child_process.spawnSync. */
  spawn?: typeof spawnSync
  /** DI seam for environment-backed opt-out. */
  env?: NodeJS.ProcessEnv
  /** The running binary path (defaults to process.argv[1]). Used for source-clone detection. */
  argv1?: string
  /** DI seam for source/git-clone detection. */
  detectGit?: (argv1: string) => string | null
  /** DI seam for tests/global installs; defaults to the package root owning argv1/import. */
  packageRoot?: string
  /** DI seam for staging-root fallback when argv1 cannot be mapped back to the owning package. */
  resolvePackageRootForStaging?: (argv1: string) => string | null
  /** DI seam for spinner. Defaults to noop when !process.stdout.isTTY. */
  spinnerFactory?: SpinnerFactory
}

export type EnsureAgentKitGlobalResult =
  | { kind: 'agent-kit-global-updated'; command: readonly string[]; stagedBin?: string }
  | { kind: 'agent-kit-global-skipped-dry-run' }
  | { kind: 'agent-kit-global-skipped-opt-out' }
  | { kind: 'agent-kit-global-skipped-source-clone'; repoRoot: string }
  | { kind: 'agent-kit-global-skipped-no-vp'; hint: string }
  | { kind: 'agent-kit-global-failed'; exitCode: number; command: readonly string[] }
  | { kind: 'agent-kit-global-staging-failed'; reason: string; command: readonly string[] }

const NO_VP_HINT =
  'vp (vite-plus) is not on PATH; cannot refresh the global ' +
  `${PUBLIC_PACKAGE_NAME}. Install vite-plus, then re-run \`wp setup\`.`

interface RuntimeManifestTarget {
  readonly id?: string
  readonly os?: NodeJS.Platform
  readonly cpu?: NodeJS.Architecture
  readonly packageName?: string
}

interface RuntimeManifest {
  readonly binaryName?: string
  readonly targets?: RuntimeManifestTarget[]
}

function resolvePackageRootForStaging(argv1: string): string | null {
  const fromArgv = argv1.length > 0 ? findAgentKitPackageRoot(argv1) : null
  if (fromArgv) return fromArgv
  return resolveAgentKitPackageRoot({ moduleUrl: import.meta.url })
}

function runtimeFilename(manifest: RuntimeManifest, target: RuntimeManifestTarget): string {
  const binaryName = manifest.binaryName ?? 'wp'
  return target.os === 'win32' ? `${binaryName}.exe` : binaryName
}

function runtimePackageDirName(packageName: string): string {
  return packageName.split('/').at(-1) ?? packageName
}

function resolveHostRuntimeBinary(packageRoot: string): {
  readonly source: string
  readonly targetId: string
} | null {
  const manifestPath = join(packageRoot, 'bin', 'runtime-manifest.json')
  if (!existsSync(manifestPath)) return null

  const manifest = JSON.parse(readFileSync(manifestPath, 'utf8')) as RuntimeManifest
  const target = manifest.targets?.find(
    (candidate) => candidate.os === process.platform && candidate.cpu === process.arch,
  )
  if (!target?.id || !target.packageName) return null

  const filename = runtimeFilename(manifest, target)
  const candidates = [
    join(packageRoot, 'bin', 'runtime', target.id, filename),
    join(packageRoot, 'dist', 'runtime', target.id, filename),
    join(packageRoot, '..', runtimePackageDirName(target.packageName), 'bin', filename),
    join(
      packageRoot,
      'node_modules',
      '@webpresso',
      runtimePackageDirName(target.packageName),
      'bin',
      filename,
    ),
  ]
  const source = candidates.find((candidate) => existsSync(candidate))
  return source ? { source, targetId: target.id } : null
}

function stageHostRuntimeLauncher(packageRoot: string): string | null {
  const runtime = resolveHostRuntimeBinary(packageRoot)
  if (!runtime) return null

  const destination = join(packageRoot, 'bin', 'wp')
  mkdirSync(dirname(destination), { recursive: true })
  copyFileSync(runtime.source, destination)
  chmodSync(destination, 0o755)

  const stat = statSync(destination)
  if (!stat.isFile()) {
    throw new Error(`staged ${destination} for ${runtime.targetId} is not a regular file`)
  }
  return destination
}

/**
 * Refresh the single global `@webpresso/agent-kit` install via `vp install -g`.
 */
export function ensureAgentKitGlobal(
  input: EnsureAgentKitGlobalInput,
): EnsureAgentKitGlobalResult {
  if (input.options.dryRun) return { kind: 'agent-kit-global-skipped-dry-run' }

  const env = input.env ?? process.env
  if (env.WP_SKIP_AUTO_INSTALL === '1') {
    return { kind: 'agent-kit-global-skipped-opt-out' }
  }

  const argv1 = input.argv1 ?? process.argv[1] ?? ''
  const detectGit = input.detectGit ?? detectGitInstall
  const sourceCloneRoot = argv1.length > 0 ? detectGit(argv1) : null
  if (sourceCloneRoot !== null) {
    return { kind: 'agent-kit-global-skipped-source-clone', repoRoot: sourceCloneRoot }
  }

  const spawn = input.spawn ?? spawnSync
  const spinner = (input.spinnerFactory ?? makeNoopSpinnerFactory())('agent-kit-global')

  const probe = spawn('vp', ['--version'], { encoding: 'utf8' })
  if (probe.error || (probe.status !== null && probe.status !== 0)) {
    return { kind: 'agent-kit-global-skipped-no-vp', hint: NO_VP_HINT }
  }

  const command = buildVpGlobalInstallCommand()
  spinner.start()
  const install = spawn(command[0], command.slice(1), { stdio: 'inherit' })
  if (install.status !== 0) {
    spinner.fail('agent-kit global refresh failed')
    return { kind: 'agent-kit-global-failed', exitCode: install.status ?? -1, command }
  }

  let stagedBin: string | undefined
  const packageRoot =
    input.packageRoot ??
    (input.resolvePackageRootForStaging ?? resolvePackageRootForStaging)(argv1)
  if (!packageRoot) {
    spinner.fail('agent-kit native launcher staging failed')
    return {
      kind: 'agent-kit-global-staging-failed',
      reason: 'could not resolve the owning @webpresso/agent-kit package root for staging',
      command,
    }
  }

  try {
    stagedBin = stageHostRuntimeLauncher(packageRoot) ?? undefined
    if (!stagedBin) {
      spinner.fail('agent-kit native launcher staging failed')
      return {
        kind: 'agent-kit-global-staging-failed',
        reason: `could not resolve a host runtime binary under ${packageRoot}`,
        command,
      }
    }
  } catch (error) {
    spinner.fail('agent-kit native launcher staging failed')
    return {
      kind: 'agent-kit-global-staging-failed',
      reason: error instanceof Error ? error.message : String(error),
      command,
    }
  }

  spinner.succeed('agent-kit global up to date')
  return { kind: 'agent-kit-global-updated', command, stagedBin }
}
