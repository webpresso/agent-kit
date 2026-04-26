/**
 * `.agent-kitrc.json` read/write. Captures the consumer's opt-in choices so
 * re-runs of `ak init` are idempotent without re-prompting.
 */
import { existsSync, readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
export const CONFIG_VERSION = '1';
export const CONFIG_FILENAME = '.agent-kitrc.json';
export const DEFAULT_DURABLE_PLANNING_ROOT = '.agent/planning/';
export function defaultConfig() {
    return {
        version: CONFIG_VERSION,
        installed: { tier3Skills: [] },
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
        const tier3 = Array.isArray(installed?.tier3Skills) ? installed.tier3Skills : [];
        return {
            version: typeof parsed.version === 'string' ? parsed.version : CONFIG_VERSION,
            installed: { tier3Skills: tier3.filter((s) => typeof s === 'string') },
            durablePlanningRoot: typeof parsed.durablePlanningRoot === 'string'
                ? parsed.durablePlanningRoot
                : DEFAULT_DURABLE_PLANNING_ROOT,
            lastInit: typeof parsed.lastInit === 'string' ? parsed.lastInit : undefined,
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
    return {
        version: incoming.version,
        installed: { tier3Skills: tier3 },
        durablePlanningRoot: incoming.durablePlanningRoot || existing.durablePlanningRoot,
        lastInit: incoming.lastInit ?? existing.lastInit,
    };
}
export function writeConfig(repoRoot, config) {
    const path = join(repoRoot, CONFIG_FILENAME);
    const payload = `${JSON.stringify(config, null, 2)}\n`;
    writeFileSync(path, payload);
}
//# sourceMappingURL=config.js.map