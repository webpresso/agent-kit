export function buildGitHubBootstrapActionPlan(op, plan) {
    return {
        op,
        requiredSecrets: plan.requiredSecrets,
        dryRun: op === "verify",
    };
}
//# sourceMappingURL=github.js.map