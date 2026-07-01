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
 * @module webpresso/launch/provision-stack
 */
import { assembleEffectiveVars } from "./launch-profile.js";
/**
 * Build a generic launch registration over a host-agnostic profile.
 */
export async function buildLaunchRegistration(input) {
    const { profile } = input;
    const effectiveVars = assembleEffectiveVars({
        vars: profile.vars,
        databaseHandle: profile.databaseHandle,
        databaseUrlSelector: profile.databaseUrlSelector,
        preAssemble: input.preAssemble,
        secretInjector: input.secretInjector,
    });
    const { apiPort, inspectorPort } = await input.allocatePorts();
    const spawnPlan = input.buildSpawnPlan({
        cwd: profile.cwd,
        effectiveVars,
        ports: { api: apiPort, inspector: inspectorPort },
        databaseHandle: profile.databaseHandle,
    });
    return {
        command: spawnPlan.command,
        args: spawnPlan.args,
        cwd: profile.cwd,
        env: spawnPlan.env,
        ports: { api: apiPort, inspector: inspectorPort },
        logFile: profile.logFile,
        databaseHandle: profile.databaseHandle,
    };
}
//# sourceMappingURL=provision-stack.js.map