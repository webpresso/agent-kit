import { existsSync } from 'node:fs';
import { dirname, resolve, parse } from 'node:path';
import { pathToFileURL } from 'node:url';
import { AGENT_KIT_CONFIG_EXPORT_NAME, AGENT_KIT_CONFIG_FILE_NAME, validateAgentKitConfig, } from './config.js';
import { FALLBACK_HOST_ADAPTER_EXPORT_NAMES, isE2eHostAdapter } from './host-adapter.js';
export class AgentKitConfigLoadError extends Error {
    configPath;
    cause;
    constructor(configPath, cause) {
        super(`Failed to load ${AGENT_KIT_CONFIG_FILE_NAME} at ${configPath}: ${cause.message}`, cause instanceof Error ? { cause } : undefined);
        this.configPath = configPath;
        this.cause = cause;
        this.name = 'AgentKitConfigLoadError';
    }
}
export class AgentKitConfigExportError extends Error {
    configPath;
    constructor(configPath) {
        super(`Expected ${AGENT_KIT_CONFIG_FILE_NAME} at ${configPath} to export ${AGENT_KIT_CONFIG_EXPORT_NAME}.`);
        this.configPath = configPath;
        this.name = 'AgentKitConfigExportError';
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
        this.name = 'HostAdapterModuleLoadError';
    }
}
export class HostAdapterExportError extends Error {
    moduleSpecifier;
    availableExports;
    attemptedExports;
    constructor(moduleSpecifier, availableExports, attemptedExports) {
        const availableSummary = availableExports.length > 0 ? availableExports.join(', ') : '<no exports>';
        const attemptedSummary = attemptedExports.join(', ');
        super(`E2E host adapter module "${moduleSpecifier}" does not export a valid adapter. Tried ${attemptedSummary}. Available exports: ${availableSummary}.`);
        this.moduleSpecifier = moduleSpecifier;
        this.availableExports = availableExports;
        this.attemptedExports = attemptedExports;
        this.name = 'HostAdapterExportError';
    }
}
export function getAgentKitConfigPath(cwd = process.cwd()) {
    return resolve(cwd, AGENT_KIT_CONFIG_FILE_NAME);
}
export function resolveAgentKitConfigPath(cwd = process.cwd()) {
    return findAgentKitConfigPath(cwd) ?? getAgentKitConfigPath(cwd);
}
export function findAgentKitConfigPath(cwd = process.cwd()) {
    for (const searchDir of getSearchDirectories(cwd)) {
        const configPath = getAgentKitConfigPath(searchDir);
        if (existsSync(configPath)) {
            return configPath;
        }
    }
    return null;
}
export async function loadAgentKitConfig(options = {}) {
    const configPath = resolveAgentKitConfigPath(options.cwd);
    const configModule = await loadModuleNamespace(pathToFileURL(configPath).href, (cause) => {
        throw new AgentKitConfigLoadError(configPath, cause);
    });
    if (!(AGENT_KIT_CONFIG_EXPORT_NAME in configModule)) {
        throw new AgentKitConfigExportError(configPath);
    }
    return {
        config: validateAgentKitConfig(configModule[AGENT_KIT_CONFIG_EXPORT_NAME], configPath),
        configPath,
    };
}
export async function loadAgentKitConfigSafe(options = {}) {
    const configPath = findAgentKitConfigPath(options.cwd);
    if (!configPath) {
        return null;
    }
    return loadAgentKitConfig({ cwd: dirname(configPath) });
}
export async function loadHostAdapter(options = {}) {
    const loadedConfig = await loadAgentKitConfigSafe(options);
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
    if (moduleSpecifier.startsWith('file:')) {
        return moduleSpecifier;
    }
    if (moduleSpecifier.startsWith('.') || moduleSpecifier.startsWith('/')) {
        return pathToFileURL(resolve(dirname(configPath), moduleSpecifier)).href;
    }
    return moduleSpecifier;
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