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
const defaultDatabaseUrlSelector = (handle) => ({
    runtimeDatabaseUrl: handle.primaryConnectionUri,
});
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
export function assembleEffectiveVars(input) {
    const effectiveVars = { ...input.vars };
    input.preAssemble?.(effectiveVars);
    input.secretInjector?.(effectiveVars);
    if (input.databaseHandle) {
        const selector = input.databaseUrlSelector ?? defaultDatabaseUrlSelector;
        const selected = selector(input.databaseHandle);
        effectiveVars.DATABASE_URL = selected.runtimeDatabaseUrl;
        if (selected.metadataDatabaseUrl) {
            effectiveVars.HASURA_GRAPHQL_METADATA_DATABASE_URL = selected.metadataDatabaseUrl;
        }
    }
    return effectiveVars;
}
//# sourceMappingURL=launch-profile.js.map