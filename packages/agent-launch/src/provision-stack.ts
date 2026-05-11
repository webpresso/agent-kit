/**
 * Generic launch-registration orchestration.
 *
 * Host adapters provide:
 *   - an async port allocator
 *   - a secret injector
 *   - a spawn-plan builder that turns a resolved launch context into a
 *     concrete (command, args, env) triple
 *
 * launch-engine orchestrates them into a {@link LaunchRegistration}
 * without depending on any host-specific package.
 *
 * @module @webpresso/agent-launch/provision-stack
 */

import type { LaunchProfile, LaunchRegistration, ProvisionedDatabaseHandle } from './contracts'

import { assembleEffectiveVars } from './launch-profile'

export interface LaunchRegistrationSpawnContext {
  /** Resolved launch cwd (mirrors `profile.cwd`). */
  cwd: string
  /** The effective vars after injection and DB-url assembly. */
  effectiveVars: Record<string, string>
  /** Allocated ports for this launch. */
  ports: { api: number; inspector: number }
  /** The provisioned database handle threaded through from the profile. */
  databaseHandle?: ProvisionedDatabaseHandle
}

export interface LaunchRegistrationSpawnPlan {
  command: string
  args: readonly string[]
  env: NodeJS.ProcessEnv
}

export interface BuildLaunchRegistrationInput {
  profile: LaunchProfile
  /**
   * Async port allocator. Called exactly once per registration.
   */
  allocatePorts: () => Promise<{ apiPort: number; inspectorPort: number }>
  /**
   * Secret injector forwarded to {@link assembleEffectiveVars}. Mutate the
   * supplied var bundle in place.
   */
  secretInjector: (vars: Record<string, string>) => void
  /**
   * Optional pre-assembly hook (e.g. inject a repo-root env var) forwarded
   * to {@link assembleEffectiveVars}.
   */
  preAssemble?: (vars: Record<string, string>) => void
  /**
   * Turn a resolved launch context into a concrete spawn plan. Callers
   * own host-specific logic here (wrangler/vite args, docker wrappers,
   * etc.).
   */
  buildSpawnPlan: (context: LaunchRegistrationSpawnContext) => LaunchRegistrationSpawnPlan
}

/**
 * Build a generic launch registration over a host-agnostic profile.
 */
export async function buildLaunchRegistration(
  input: BuildLaunchRegistrationInput,
): Promise<LaunchRegistration> {
  const { profile } = input

  const effectiveVars = assembleEffectiveVars({
    vars: profile.vars,
    databaseHandle: profile.databaseHandle,
    databaseUrlSelector: profile.databaseUrlSelector,
    preAssemble: input.preAssemble,
    secretInjector: input.secretInjector,
  })

  const { apiPort, inspectorPort } = await input.allocatePorts()

  const spawnPlan = input.buildSpawnPlan({
    cwd: profile.cwd,
    effectiveVars,
    ports: { api: apiPort, inspector: inspectorPort },
    databaseHandle: profile.databaseHandle,
  })

  return {
    command: spawnPlan.command,
    args: spawnPlan.args,
    cwd: profile.cwd,
    env: spawnPlan.env,
    ports: { api: apiPort, inspector: inspectorPort },
    logFile: profile.logFile,
    databaseHandle: profile.databaseHandle,
  }
}
