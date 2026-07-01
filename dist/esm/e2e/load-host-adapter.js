import { existsSync } from "node:fs";
import { dirname, resolve, parse } from "node:path";
import { pathToFileURL } from "node:url";
import { WEBPRESSO_CONFIG_CANDIDATES, WEBPRESSO_CONFIG_EXPORT_NAME, WEBPRESSO_CONFIG_FILE_NAME, validateWebpressoConfig, } from "./config.js";
import { FALLBACK_HOST_ADAPTER_EXPORT_NAMES, isE2eHostAdapter } from "./host-adapter.js";
export class WebpressoConfigLoadError extends Error {
    configPath;
    cause;
    constructor(configPath, cause) {
        super(`Failed to load ${WEBPRESSO_CONFIG_FILE_NAME} at ${configPath}: ${cause.message}`, cause instanceof Error ? { cause } : undefined);
        this.configPath = configPath;
        this.cause = cause;
        this.name = "WebpressoConfigLoadError";
    }
}
export class WebpressoConfigExportError extends Error {
    configPath;
    exportName;
    constructor(configPath, exportName = WEBPRESSO_CONFIG_EXPORT_NAME) {
        super(`Expected config at ${configPath} to export ${exportName}.`);
        this.configPath = configPath;
        this.exportName = exportName;
        this.name = "WebpressoConfigExportError";
    }
}
export class HostAdapterModuleLoadError extends Error {
    moduleSpecifier;
    configPath;
    cause;
    constructor(moduleSpecifier, configPath, cause) {
        super(`Failed to load E2E host adapter module "${moduleSpecifier}" from ${configPath}: ${cause.message}`, cause instanceof Error ? { cause } : undefined);
        this.moduleSpecifier = moduleSpecifier;
        this.configPath = configPath;
        this.cause = cause;
        this.name = "HostAdapterModuleLoadError";
    }
}
export class HostAdapterExportError extends Error {
    moduleSpecifier;
    availableExports;
    attemptedExports;
    constructor(moduleSpecifier, availableExports, attemptedExports) {
        const availableSummary = availableExports.length > 0 ? availableExports.join(", ") : "<no exports>";
        const attemptedSummary = attemptedExports.join(", ");
        super(`E2E host adapter module "${moduleSpecifier}" does not export a valid adapter. Tried ${attemptedSummary}. Available exports: ${availableSummary}.`);
        this.moduleSpecifier = moduleSpecifier;
        this.availableExports = availableExports;
        this.attemptedExports = attemptedExports;
        this.name = "HostAdapterExportError";
    }
}
export function getWebpressoConfigPath(cwd = process.cwd()) {
    return resolve(cwd, WEBPRESSO_CONFIG_FILE_NAME);
}
export function resolveWebpressoConfigPath(cwd = process.cwd()) {
    return findWebpressoConfigPath(cwd) ?? getWebpressoConfigPath(cwd);
}
export function findWebpressoConfigPath(cwd = process.cwd()) {
    for (const searchDir of getSearchDirectories(cwd)) {
        for (const candidate of WEBPRESSO_CONFIG_CANDIDATES) {
            const configPath = resolve(searchDir, candidate.fileName);
            if (existsSync(configPath)) {
                return configPath;
            }
        }
    }
    return null;
}
export async function loadWebpressoConfig(options = {}) {
    const configPath = resolveWebpressoConfigPath(options.cwd);
    const configModule = await loadModuleNamespace(pathToFileURL(configPath).href, (cause) => {
        throw new WebpressoConfigLoadError(configPath, cause);
    });
    const exportName = expectedConfigExportName(configPath);
    if (!(exportName in configModule)) {
        throw new WebpressoConfigExportError(configPath, exportName);
    }
    return {
        config: validateWebpressoConfig(configModule[exportName], configPath),
        configPath,
    };
}
export async function loadWebpressoConfigSafe(options = {}) {
    const configPath = findWebpressoConfigPath(options.cwd);
    if (!configPath) {
        return null;
    }
    return loadWebpressoConfig({ cwd: dirname(configPath) });
}
export async function loadHostAdapter(options = {}) {
    const loadedConfig = await loadWebpressoConfigSafe(options);
    if (!loadedConfig?.config.e2e) {
        return null;
    }
    const moduleSpecifier = resolveModuleSpecifier(loadedConfig.config.e2e.hostAdapterModule, loadedConfig.configPath);
    const hostAdapterModule = await loadModuleNamespace(moduleSpecifier, (cause) => {
        throw new HostAdapterModuleLoadError(moduleSpecifier, loadedConfig.configPath, cause);
    });
    const exportNames = getHostAdapterExportLookupOrder(loadedConfig.config.e2e.hostAdapterExport);
    for (const exportName of exportNames) {
        if (!(exportName in hostAdapterModule)) {
            continue;
        }
        const candidate = hostAdapterModule[exportName];
        if (isE2eHostAdapter(candidate)) {
            return {
                ...loadedConfig,
                adapter: candidate,
                exportName,
                moduleSpecifier,
            };
        }
    }
    throw new HostAdapterExportError(moduleSpecifier, Object.keys(hostAdapterModule), exportNames);
}
export async function loadConfiguredHostAdapter(cwd = process.cwd()) {
    return loadHostAdapter({ cwd });
}
function getHostAdapterExportLookupOrder(explicitExportName) {
    return explicitExportName
        ? [explicitExportName, ...FALLBACK_HOST_ADAPTER_EXPORT_NAMES]
        : [...FALLBACK_HOST_ADAPTER_EXPORT_NAMES];
}
function getSearchDirectories(cwd) {
    const absoluteStart = resolve(cwd);
    const rootDir = parse(absoluteStart).root;
    const directories = [];
    let current = absoluteStart;
    while (true) {
        directories.push(current);
        if (current === rootDir) {
            return directories;
        }
        current = dirname(current);
    }
}
function resolveModuleSpecifier(moduleSpecifier, configPath) {
    if (moduleSpecifier.startsWith("file:")) {
        return moduleSpecifier;
    }
    if (moduleSpecifier.startsWith(".") || moduleSpecifier.startsWith("/")) {
        return pathToFileURL(resolve(dirname(configPath), moduleSpecifier)).href;
    }
    return moduleSpecifier;
}
function expectedConfigExportName(configPath) {
    const candidate = WEBPRESSO_CONFIG_CANDIDATES.find((item) => configPath.endsWith(item.fileName));
    return candidate?.exportName ?? WEBPRESSO_CONFIG_EXPORT_NAME;
}
async function loadModuleNamespace(moduleSpecifier, onError) {
    try {
        const moduleNamespace = await import(moduleSpecifier);
        return moduleNamespace;
    }
    catch (error) {
        onError(error);
    }
}
//# sourceMappingURL=load-host-adapter.js.map