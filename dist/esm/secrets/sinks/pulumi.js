export function buildPulumiEnvInjectionPlan(plan) {
    return {
        sink: "pulumi",
        mode: "env-only",
        profile: plan.profile,
    };
}
//# sourceMappingURL=pulumi.js.map