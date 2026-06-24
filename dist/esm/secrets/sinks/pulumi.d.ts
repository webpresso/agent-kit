import type { ResolvedSecretSinkPlan } from './types.js';
export declare function buildPulumiEnvInjectionPlan(plan: ResolvedSecretSinkPlan): {
    readonly sink: 'pulumi';
    readonly mode: 'env-only';
    readonly profile: string;
};
//# sourceMappingURL=pulumi.d.ts.map