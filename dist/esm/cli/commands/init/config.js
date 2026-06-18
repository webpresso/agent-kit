/**
 * `.webpressorc.json` read/write. Captures the consumer's opt-in choices so
 * re-runs of `wp init` are idempotent without re-prompting.
 */
import { existsSync, readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { REQUIRED_CORE_CAPABILITIES } from './host-visibility.js';
export const CONFIG_VERSION = '1';
export const CONFIG_FILENAME = '.webpressorc.json';
export const LEGACY_CONFIG_FILENAME = '.agent-kitrc.json';
export const DEFAULT_DURABLE_PLANNING_ROOT = '.agent/planning/';
export const EXTERNAL_INTEGRATIONS = ['omx', 'omc', 'gstack'];
function readOptionalString(value) {
    if (typeof value !== 'string')
        return undefined;
    const trimmed = value.trim();
    return trimmed.length > 0 ? trimmed : undefined;
}
export function defaultConfig() {
    return {
        version: CONFIG_VERSION,
        installed: { tier3Skills: [] },
        hosts: {
            selected: [],
            requiredCapabilities: [...REQUIRED_CORE_CAPABILITIES],
        },
        rules: { overrides: [] },
        scripts: {},
        durablePlanningRoot: DEFAULT_DURABLE_PLANNING_ROOT,
    };
}
function parseConfigFile(path) {
    try {
        const raw = readFileSync(path, 'utf8');
        const parsed = JSON.parse(raw);
        const installed = parsed.installed;
        const audit = parsed.audit;
        const mcp = parsed.mcp;
        const hosts = parsed.hosts;
        const rules = parsed.rules;
        const scripts = parsed.scripts;
        const rawIntegrations = parsed.integrations;
        const tier3 = Array.isArray(installed?.tier3Skills) ? installed.tier3Skills : [];
        const overrides = Array.isArray(rules?.overrides) ? rules.overrides : [];
        const durablePlanningRoot = readOptionalString(parsed.durablePlanningRoot);
        const blueprintsDir = readOptionalString(parsed.blueprintsDir);
        const serverName = readOptionalString(mcp?.serverName);
        const toolPrefix = readOptionalString(mcp?.toolPrefix);
        const normalizedMcp = serverName || toolPrefix
            ? { ...(serverName ? { serverName } : {}), ...(toolPrefix ? { toolPrefix } : {}) }
            : undefined;
        const guard = parsed.guard;
        const packageManager = guard?.packageManager === 'vp-only' ? 'vp-only' : undefined;
        const rawScriptRoutes = guard?.scriptRoutes && typeof guard.scriptRoutes === 'object'
            ? Object.fromEntries(Object.entries(guard.scriptRoutes).filter(([key, value]) => typeof key === 'string' && typeof value === 'string'))
            : undefined;
        const scriptRoutes = rawScriptRoutes && Object.keys(rawScriptRoutes).length > 0 ? rawScriptRoutes : undefined;
        const normalizedGuard = packageManager || scriptRoutes
            ? {
                ...(packageManager ? { packageManager } : {}),
                ...(scriptRoutes ? { scriptRoutes } : {}),
            }
            : undefined;
        const rawToolchainIsolation = audit?.toolchainIsolation;
        const allowDependencies = Array.isArray(rawToolchainIsolation?.allowDependencies)
            ? rawToolchainIsolation.allowDependencies.filter((value) => typeof value === 'string' && value.length > 0)
            : undefined;
        const normalizedAudit = allowDependencies && allowDependencies.length > 0
            ? {
                toolchainIsolation: {
                    allowDependencies,
                },
            }
            : undefined;
        const selectedHosts = Array.isArray(hosts?.selected)
            ? hosts.selected.filter((s) => ['codex', 'claude', 'opencode'].includes(String(s)))
            : [];
        const requiredCapabilities = Array.isArray(hosts?.requiredCapabilities)
            ? hosts.requiredCapabilities.filter((s) => typeof s === 'string')
            : [...REQUIRED_CORE_CAPABILITIES];
        const visibility = hosts?.visibility && typeof hosts.visibility === 'object'
            ? hosts.visibility
            : undefined;
        const integrations = Object.fromEntries(EXTERNAL_INTEGRATIONS.flatMap((name) => {
            const raw = rawIntegrations?.[name];
            if (raw === null || typeof raw !== 'object')
                return [];
            const record = raw;
            if (record.enabled !== true)
                return [];
            const scope = (name === 'omx' || name === 'omc') &&
                (record.scope === 'user' || record.scope === 'project')
                ? record.scope
                : undefined;
            return [[name, { enabled: true, ...(scope ? { scope } : {}) }]];
        }));
        return {
            version: typeof parsed.version === 'string' ? parsed.version : CONFIG_VERSION,
            installed: { tier3Skills: tier3.filter((s) => typeof s === 'string') },
            ...(Object.keys(integrations).length > 0 ? { integrations } : {}),
            hosts: {
                selected: selectedHosts,
                requiredCapabilities,
                ...(visibility ? { visibility } : {}),
            },
            ...(normalizedAudit ? { audit: normalizedAudit } : {}),
            ...(normalizedMcp ? { mcp: normalizedMcp } : {}),
            ...(normalizedGuard ? { guard: normalizedGuard } : {}),
            rules: { overrides: overrides.filter((s) => typeof s === 'string') },
            scripts: {
                'setup-agent': readOptionalString(scripts?.['setup-agent']),
            },
            durablePlanningRoot: durablePlanningRoot ?? DEFAULT_DURABLE_PLANNING_ROOT,
            ...(blueprintsDir ? { blueprintsDir } : {}),
            lastInit: readOptionalString(parsed.lastInit),
        };
    }
    catch {
        return null;
    }
}
export function readConfig(repoRoot) {
    const configPath = join(repoRoot, CONFIG_FILENAME);
    if (existsSync(configPath))
        return parseConfigFile(configPath);
    const legacyConfigPath = join(repoRoot, LEGACY_CONFIG_FILENAME);
    if (existsSync(legacyConfigPath))
        return parseConfigFile(legacyConfigPath);
    return null;
}
export function mergeConfig(existing, incoming) {
    if (!existing)
        return incoming;
    const tier3 = Array.from(new Set([...existing.installed.tier3Skills, ...incoming.installed.tier3Skills])).toSorted();
    const overrides = Array.from(new Set([...existing.rules.overrides, ...incoming.rules.overrides])).toSorted();
    const mergedMcp = existing.mcp || incoming.mcp
        ? {
            ...existing.mcp,
            ...incoming.mcp,
        }
        : undefined;
    const mergedAllowDependencies = Array.from(new Set([
        ...(existing.audit?.toolchainIsolation?.allowDependencies ?? []),
        ...(incoming.audit?.toolchainIsolation?.allowDependencies ?? []),
    ])).toSorted();
    const mergedAudit = mergedAllowDependencies.length > 0
        ? {
            toolchainIsolation: {
                allowDependencies: mergedAllowDependencies,
            },
        }
        : undefined;
    const mergedScriptRoutes = existing.guard?.scriptRoutes || incoming.guard?.scriptRoutes
        ? { ...existing.guard?.scriptRoutes, ...incoming.guard?.scriptRoutes }
        : undefined;
    const mergedGuard = existing.guard || incoming.guard
        ? {
            ...existing.guard,
            ...incoming.guard,
            ...(mergedScriptRoutes ? { scriptRoutes: mergedScriptRoutes } : {}),
        }
        : undefined;
    return {
        version: incoming.version,
        installed: { tier3Skills: tier3 },
        ...(incoming.integrations !== undefined
            ? { integrations: incoming.integrations }
            : existing.integrations !== undefined
                ? { integrations: existing.integrations }
                : {}),
        hosts: incoming.hosts ?? existing.hosts,
        ...(mergedAudit ? { audit: mergedAudit } : {}),
        ...(mergedMcp ? { mcp: mergedMcp } : {}),
        ...(mergedGuard ? { guard: mergedGuard } : {}),
        rules: { overrides },
        scripts: {
            'setup-agent': incoming.scripts['setup-agent'] ?? existing.scripts['setup-agent'],
        },
        durablePlanningRoot: incoming.durablePlanningRoot || existing.durablePlanningRoot,
        blueprintsDir: incoming.blueprintsDir ?? existing.blueprintsDir,
        lastInit: incoming.lastInit ?? existing.lastInit,
    };
}
export function writeConfig(repoRoot, config) {
    const path = join(repoRoot, CONFIG_FILENAME);
    const payload = `${JSON.stringify(config, null, 2)}\n`;
    writeFileSync(path, payload);
}
//# sourceMappingURL=config.js.map