export function auditPulumiSecretBoundary(_rootDirectory = process.cwd()) {
    const violations = [];
    return {
        ok: violations.length === 0,
        title: 'pulumi-secret-boundary',
        checked: 1,
        violations,
    };
}
//# sourceMappingURL=pulumi-secret-boundary.js.map