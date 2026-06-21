export function isDbBranchProviderDescriptor(value) {
    if (!value || typeof value !== 'object' || Array.isArray(value))
        return false;
    const candidate = value;
    return ((candidate.provider === 'neon' || candidate.provider === 'xata') &&
        (candidate.mode === 'managed' || candidate.mode === 'future') &&
        typeof candidate.supportsClone === 'boolean' &&
        typeof candidate.supportsTtl === 'boolean' &&
        typeof candidate.supportsCleanup === 'boolean');
}
function requireNonEmptyString(value, field) {
    if (value.trim().length === 0) {
        throw new Error(`${field} must be a non-empty string`);
    }
    return value;
}
export function createDbBranchPlan(input) {
    return {
        kind: 'managed',
        provider: input.provider.provider,
        branchName: requireNonEmptyString(input.branchName, 'branchName'),
        connectionStringEnvVar: requireNonEmptyString(input.connectionStringEnvVar, 'connectionStringEnvVar'),
        connectionStringSecretRef: requireNonEmptyString(input.connectionStringSecretRef, 'connectionStringSecretRef'),
        smokeCommand: requireNonEmptyString(input.smokeCommand, 'smokeCommand'),
        ttlSeconds: input.ttlSeconds > 0
            ? input.ttlSeconds
            : (() => {
                throw new Error('ttlSeconds must be > 0');
            })(),
        cleanupCommand: requireNonEmptyString(input.cleanupCommand, 'cleanupCommand'),
    };
}
export function createDbBranchSkipPlan(input) {
    return {
        kind: 'skip',
        reason: requireNonEmptyString(input.reason, 'reason'),
        evidence: requireNonEmptyString(input.evidence, 'evidence'),
    };
}
//# sourceMappingURL=types.js.map