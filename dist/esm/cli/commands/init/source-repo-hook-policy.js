import { existsSync, readFileSync } from "node:fs";
import { join } from "node:path";
export const AGENT_KIT_PACKAGE_NAME = "@webpresso/agent-kit";
function readPackageName(repoRoot) {
    try {
        const parsed = JSON.parse(readFileSync(join(repoRoot, "package.json"), "utf8"));
        return typeof parsed.name === "string" ? parsed.name : undefined;
    }
    catch {
        return undefined;
    }
}
export function isAgentKitSourceRepo(repoRoot) {
    return (readPackageName(repoRoot) === AGENT_KIT_PACKAGE_NAME &&
        existsSync(join(repoRoot, "src", "cli", "cli.ts")));
}
export function sourceRepoHooksMustForceSource(repoRoot) {
    return isAgentKitSourceRepo(repoRoot);
}
export function hookCommandEnvPrefix(repoRoot) {
    return sourceRepoHooksMustForceSource(repoRoot) ? "WP_FORCE_SOURCE=1 " : "";
}
export function setupCommandForHookPolicy(repoRoot, options = {}) {
    const source = isAgentKitSourceRepo(repoRoot);
    const env = source ? "WP_FORCE_SOURCE=1 " : "";
    const restoreHooks = options.restoreHooks === true ? " --restore-hooks" : "";
    const sourceMaintenance = source ? " --source-maintenance" : "";
    return `${env}wp setup${restoreHooks}${sourceMaintenance}`;
}
//# sourceMappingURL=source-repo-hook-policy.js.map