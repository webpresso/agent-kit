import type { ProviderBootstrapPlan } from '#secrets/providers/types.js';
export interface GitHubBootstrapActionPlan {
    readonly op: 'verify' | 'apply' | 'rotate' | 'revoke';
    readonly requiredSecrets: readonly string[];
    readonly dryRun: boolean;
}
export declare function buildGitHubBootstrapActionPlan(op: GitHubBootstrapActionPlan['op'], plan: ProviderBootstrapPlan): GitHubBootstrapActionPlan;
//# sourceMappingURL=github.d.ts.map