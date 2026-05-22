/**
 * `.agent-kitrc.json` read/write. Captures the consumer's opt-in choices so
 * re-runs of `wp init` are idempotent without re-prompting.
 */
import { existsSync, readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { REQUIRED_CORE_CAPABILITIES } from './host-visibility.js';
export const CONFIG_VERSION = '1';
export const CONFIG_FILENAME = '.agent-kitrc.json';
export const DEFAULT_DURABLE_PLANNING_ROOT = '.agent/planning/';
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
export function readConfig(repoRoot) {
    const path = join(repoRoot, CONFIG_FILENAME);
    if (!existsSync(path))
        return null;
    try {
        const raw = readFileSync(path, 'utf8');
        const parsed = JSON.parse(raw);
        const installed = parsed.installed;
        const mcp = parsed.mcp;
        const hosts = parsed.hosts;
        const rules = parsed.rules;
        const scripts = parsed.scripts;
        const tier3 = Array.isArray(installed?.tier3Skills) ? installed.tier3Skills : [];
        const overrides = Array.isArray(rules?.overrides) ? rules.overrides : [];
        const durablePlanningRoot = readOptionalString(parsed.durablePlanningRoot);
        const blueprintsDir = readOptionalString(parsed.blueprintsDir);
        const serverName = readOptionalString(mcp?.serverName);
        const toolPrefix = readOptionalString(mcp?.toolPrefix);
        const normalizedMcp = serverName || toolPrefix
            ? { ...(serverName ? { serverName } : {}), ...(toolPrefix ? { toolPrefix } : {}) }
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
        return {
            version: typeof parsed.version === 'string' ? parsed.version : CONFIG_VERSION,
            installed: { tier3Skills: tier3.filter((s) => typeof s === 'string') },
            hosts: {
                selected: selectedHosts,
                requiredCapabilities,
                ...(visibility ? { visibility } : {}),
            },
            ...(normalizedMcp ? { mcp: normalizedMcp } : {}),
            rules: { overrides: overrides.filter((s) => typeof s === 'string') },
            scripts: {
                'setup-agent': readOptionalString(scripts?.['setup-agent']),
            },
            durablePlanningRoot: durablePlanningRoot ?? DEFAULT_DURABLE_PLANNING_ROOT,
            ...(blueprintsDir ? { blueprintsDir } : {}),
            lastInit: readOptionalString(parsed.lastInit),
            ...(parsed.globalInstall === true
                ? { globalInstall: true }
                : {}),
        };
    }
    catch {
        return null;
    }
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
    return {
        version: incoming.version,
        installed: { tier3Skills: tier3 },
        hosts: incoming.hosts ?? existing.hosts,
        ...(mergedMcp ? { mcp: mergedMcp } : {}),
        rules: { overrides },
        scripts: {
            'setup-agent': incoming.scripts['setup-agent'] ?? existing.scripts['setup-agent'],
        },
        durablePlanningRoot: incoming.durablePlanningRoot || existing.durablePlanningRoot,
        blueprintsDir: incoming.blueprintsDir ?? existing.blueprintsDir,
        lastInit: incoming.lastInit ?? existing.lastInit,
        ...((incoming.globalInstall ?? existing.globalInstall) ? { globalInstall: true } : {}),
    };
}
export function writeConfig(repoRoot, config) {
    const path = join(repoRoot, CONFIG_FILENAME);
    const payload = `${JSON.stringify(config, null, 2)}\n`;
    writeFileSync(path, payload);
}
//# sourceMappingURL=config.js.map