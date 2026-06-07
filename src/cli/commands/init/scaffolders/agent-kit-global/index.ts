/**
 * `agent-kit-global` self-update scaffolder.
 *
 * Keeps the globally-distributed `@webpresso/agent-kit` install fresh on every
 * `wp setup`, mirroring how omx / omc / codex / claude self-update their own
 * global installs. The PATH `wp` launcher resolves through this install, so
 * refreshing it here means the next global invocation runs the latest
 * published release.
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
import { chmodSync, mkdirSync, writeFileSync } from 'node:fs'
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
import {
  formatRootLauncherContractFailure,
  expectedRootWpBinRelativePath,
  rootContractMode,
  rootWpDispatcherSource,
  validateRootLauncherContract,
} from '#launcher/root-contract.js'

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
  | { kind: 'agent-kit-global-updated'; command: readonly string[]; repairedLauncher?: string }
  | { kind: 'agent-kit-global-skipped-dry-run' }
  | { kind: 'agent-kit-global-skipped-opt-out' }
  | { kind: 'agent-kit-global-skipped-source-clone'; repoRoot: string }
  | { kind: 'agent-kit-global-skipped-no-vp'; hint: string }
  | { kind: 'agent-kit-global-failed'; exitCode: number; command: readonly string[] }
  | { kind: 'agent-kit-global-repair-failed'; reason: string; command: readonly string[] }

const NO_VP_HINT =
  'vp (vite-plus) is not on PATH; cannot refresh the global ' +
  `${PUBLIC_PACKAGE_NAME}. Install vite-plus, then re-run \`wp setup\`.`

function resolvePackageRootForStaging(argv1: string): string | null {
  const fromArgv = argv1.length > 0 ? findAgentKitPackageRoot(argv1) : null
  if (fromArgv) return fromArgv
  return resolveAgentKitPackageRoot({ moduleUrl: import.meta.url })
}

function repairRootWpLauncher(packageRoot: string): string {
  const destination = join(packageRoot, expectedRootWpBinRelativePath)
  const destinationStatus = validateRootLauncherContract(destination)
  if (destinationStatus.ok) return destination

  mkdirSync(dirname(destination), { recursive: true })
  writeFileSync(destination, rootWpDispatcherSource, 'utf8')
  chmodSync(destination, 0o755)

  const repairedStatus = validateRootLauncherContract(destination)
  if (!repairedStatus.ok) {
    throw new Error(
      `repaired ${destination} does not satisfy ${rootContractMode}: ${formatRootLauncherContractFailure(repairedStatus, 'bin/wp')}`,
    )
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

  let repairedLauncher: string | undefined
  const packageRoot =
    input.packageRoot ??
    (input.resolvePackageRootForStaging ?? resolvePackageRootForStaging)(argv1)
  if (!packageRoot) {
    spinner.fail('agent-kit root launcher repair failed')
    return {
      kind: 'agent-kit-global-repair-failed',
      reason: 'could not resolve the owning @webpresso/agent-kit package root for launcher repair',
      command,
    }
  }

  try {
    repairedLauncher = repairRootWpLauncher(packageRoot)
  } catch (error) {
    spinner.fail('agent-kit root launcher repair failed')
    return {
      kind: 'agent-kit-global-repair-failed',
      reason: error instanceof Error ? error.message : String(error),
      command,
    }
  }

  spinner.succeed('agent-kit global up to date')
  return { kind: 'agent-kit-global-updated', command, repairedLauncher }
}
