import { dirname, resolve } from "node:path";
import { pathToFileURL } from "node:url";
import { loadWebpressoConfigSafe } from "#e2e/load-host-adapter";
const DEFAULT_DEPLOY_ADAPTER_EXPORTS = [
    "webpressoDeployAdapter",
    "deployAdapter",
    "default",
];
export class DeployAdapterConfigError extends Error {
    constructor(message) {
        super(message);
        this.name = "DeployAdapterConfigError";
    }
}
export async function loadDeployAdapter(cwd = process.cwd()) {
    const loadedConfig = await loadWebpressoConfigSafe({ cwd });
    const deployConfig = loadedConfig?.config.deploy;
    if (!loadedConfig || !deployConfig?.adapterModule)
        return null;
    const moduleSpecifier = resolveModuleSpecifier(deployConfig.adapterModule, loadedConfig.configPath);
    let moduleNamespace;
    try {
        moduleNamespace = (await import(moduleSpecifier));
    }
    catch (error) {
        const message = error instanceof Error ? error.message : String(error);
        throw new DeployAdapterConfigError(`Failed to load deploy adapter module "${deployConfig.adapterModule}" from ${loadedConfig.configPath}: ${message}`);
    }
    const exportNames = deployConfig.adapterExport
        ? [deployConfig.adapterExport, ...DEFAULT_DEPLOY_ADAPTER_EXPORTS]
        : [...DEFAULT_DEPLOY_ADAPTER_EXPORTS];
    for (const exportName of exportNames) {
        const candidate = moduleNamespace[exportName];
        if (isDeployAdapter(candidate)) {
            return {
                adapter: candidate,
                config: loadedConfig.config,
                configPath: loadedConfig.configPath,
                moduleSpecifier,
                exportName,
            };
        }
    }
    throw new DeployAdapterConfigError(`Deploy adapter module "${deployConfig.adapterModule}" does not export a deploy adapter. Tried ${exportNames.join(", ")}.`);
}
function isDeployAdapter(value) {
    return Boolean(value && typeof value === "object" && typeof value.createPlan === "function");
}
function resolveModuleSpecifier(moduleSpecifier, configPath) {
    if (moduleSpecifier.startsWith("file:"))
        return moduleSpecifier;
    if (moduleSpecifier.startsWith(".") || moduleSpecifier.startsWith("/")) {
        return pathToFileURL(resolve(dirname(configPath), moduleSpecifier)).href;
    }
    return moduleSpecifier;
}
//# sourceMappingURL=load-adapter.js.map