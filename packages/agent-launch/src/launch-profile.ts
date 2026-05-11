/**
 * Generic var-assembly for a launch profile.
 *
 * Given an optional pre-assembly hook, an optional secret injector, and an
 * optional provisioned database handle plus URL selector, produce the
 * effective environment-variable bundle a spawn will use. No wrangler,
 * vite, or host-specific logic lives here.
 *
 * @module @webpresso/agent-launch/launch-profile
 */

import type { DatabaseUrlSelector, ProvisionedDatabaseHandle } from './contracts'

export interface AssembleEffectiveVarsInput {
  /** Starting var bundle. Not mutated; copied internally. */
  vars: Record<string, string>
  /** Optional database handle whose URLs are exported to the launch env. */
  databaseHandle?: ProvisionedDatabaseHandle
  /**
   * Optional selector that maps a handle to runtime/metadata URLs.
   * Defaults to `{ runtimeDatabaseUrl: handle.primaryConnectionUri }`.
   */
  databaseUrlSelector?: DatabaseUrlSelector
  /**
   * Optional pre-assembly hook invoked with the var-copy before any
   * secrets or DB URLs are injected. Use to install defaults like a
   * repo-root env var. Must only mutate the target in place.
   */
  preAssemble?: (vars: Record<string, string>) => void
  /**
   * Optional secret injector invoked with the var-copy after the
   * pre-assembly hook but before DB URLs are written. Must only mutate
   * the target in place; throws propagate unmodified.
   */
  secretInjector?: (vars: Record<string, string>) => void
}

const defaultDatabaseUrlSelector: DatabaseUrlSelector = (handle) => ({
  runtimeDatabaseUrl: handle.primaryConnectionUri,
})

/**
 * Assemble the effective launch environment-variable bundle.
 *
 * Order of operations (observable from tests):
 *   1. copy caller-provided vars (never mutate caller input)
 *   2. run optional {@link AssembleEffectiveVarsInput.preAssemble} hook
 *   3. run optional {@link AssembleEffectiveVarsInput.secretInjector}
 *   4. if a database handle is supplied, run the URL selector and assign
 *      `DATABASE_URL` (and `HASURA_GRAPHQL_METADATA_DATABASE_URL` when
 *      returned)
 */
export function assembleEffectiveVars(input: AssembleEffectiveVarsInput): Record<string, string> {
  const effectiveVars: Record<string, string> = { ...input.vars }

  input.preAssemble?.(effectiveVars)
  input.secretInjector?.(effectiveVars)

  if (input.databaseHandle) {
    const selector = input.databaseUrlSelector ?? defaultDatabaseUrlSelector
    const selected = selector(input.databaseHandle)
    effectiveVars.DATABASE_URL = selected.runtimeDatabaseUrl
    if (selected.metadataDatabaseUrl) {
      effectiveVars.HASURA_GRAPHQL_METADATA_DATABASE_URL = selected.metadataDatabaseUrl
    }
  }

  return effectiveVars
}
