import { existsSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
export function resolveInstalledHooksPath(repoRoot, vendor) {
    return vendor === 'claude'
        ? join(repoRoot, '.claude', 'settings.json')
        : join(repoRoot, '.codex', 'hooks.json');
}
export function readInstalledHooksMap(repoRoot, vendor) {
    const configPath = resolveInstalledHooksPath(repoRoot, vendor);
    if (!existsSync(configPath)) {
        return {};
    }
    const raw = JSON.parse(readFileSync(configPath, 'utf8'));
    if (typeof raw !== 'object' || raw === null) {
        return {};
    }
    const withHooks = raw;
    const hookSource = typeof withHooks['hooks'] === 'object' && withHooks['hooks'] !== null
        ? withHooks['hooks']
        : withHooks;
    const result = {};
    for (const [key, value] of Object.entries(hookSource)) {
        if (!Array.isArray(value))
            continue;
        result[key] = value;
    }
    return result;
}
//# sourceMappingURL=installed-hooks.js.map