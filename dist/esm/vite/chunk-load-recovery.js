const DEFAULT_RELOAD_KEY = 'vite-preload-error-reloaded';
const installedTargets = new WeakSet();
let memoryReloaded = false;
export function installChunkLoadRecovery(options = {}) {
    const target = options.target ?? getDefaultTarget();
    if (!target)
        return false;
    if (installedTargets.has(target))
        return false;
    const storage = options.storage ?? getDefaultStorage();
    const reload = options.reload ?? getDefaultReload();
    const key = options.key ?? DEFAULT_RELOAD_KEY;
    target.addEventListener('vite:preloadError', (event) => {
        event.preventDefault?.();
        if (hasReloaded(storage, key))
            return;
        markReloaded(storage, key);
        reload();
    });
    installedTargets.add(target);
    return true;
}
function hasReloaded(storage, key) {
    if (!storage)
        return memoryReloaded;
    try {
        return storage.getItem(key) === '1';
    }
    catch {
        return memoryReloaded;
    }
}
function markReloaded(storage, key) {
    memoryReloaded = true;
    if (!storage)
        return;
    try {
        storage.setItem(key, '1');
    }
    catch {
        // A private-mode or denied storage write should not prevent last-resort recovery.
    }
}
function getDefaultTarget() {
    const candidate = globalThis;
    const target = candidate.window ?? candidate;
    if (typeof target.addEventListener !== 'function')
        return undefined;
    return target;
}
function getDefaultStorage() {
    const candidate = globalThis;
    return candidate.window?.sessionStorage ?? candidate.sessionStorage;
}
function getDefaultReload() {
    return () => {
        const candidate = globalThis;
        const reload = candidate.window?.location?.reload ?? candidate.location?.reload;
        reload?.();
    };
}
//# sourceMappingURL=chunk-load-recovery.js.map