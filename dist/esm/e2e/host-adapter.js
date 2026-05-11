export const DEFAULT_HOST_ADAPTER_EXPORT_NAME = 'agentKitE2eHostAdapter';
export const LEGACY_HOST_ADAPTER_EXPORT_NAME = 'webpressoE2eHostAdapter';
export const FALLBACK_HOST_ADAPTER_EXPORT_NAMES = [
    DEFAULT_HOST_ADAPTER_EXPORT_NAME,
    LEGACY_HOST_ADAPTER_EXPORT_NAME,
    'default',
];
export function isE2eHostAdapter(value) {
    if (typeof value !== 'object' || value === null) {
        return false;
    }
    const candidate = value;
    return (typeof candidate.listSuites === 'function' &&
        typeof candidate.resolveSuiteId === 'function' &&
        (candidate.resolveSuiteGroup === undefined ||
            typeof candidate.resolveSuiteGroup === 'function') &&
        typeof candidate.normalizeFilePath === 'function' &&
        typeof candidate.resolveSuiteForFile === 'function' &&
        (candidate.buildExecutionPlan === undefined ||
            typeof candidate.buildExecutionPlan === 'function'));
}
//# sourceMappingURL=host-adapter.js.map