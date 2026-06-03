import { resolveRunner, } from './resolve-runner.js';
const runtimeCache = new Map();
function cacheKey(tool, options) {
    const outputPolicy = options.outputPolicy ?? (options.filterOutput === false ? 'structured' : 'rtk-filtered');
    return JSON.stringify({
        tool,
        outputPolicy,
        fallbackCommand: options.fallbackCommand ?? null,
        fallbackArgs: options.fallbackArgs ?? [],
    });
}
export function getManagedRunner(tool, options = {}) {
    const key = cacheKey(tool, options);
    const cached = runtimeCache.get(key);
    if (cached)
        return cached;
    const resolved = resolveRunner(tool, options);
    runtimeCache.set(key, resolved);
    return resolved;
}
export function clearManagedRunnerCache() {
    runtimeCache.clear();
}
//# sourceMappingURL=index.js.map