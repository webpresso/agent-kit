export type DbBranchProviderName = 'neon' | 'xata';
export type DbBranchProviderMode = 'managed' | 'future';
export interface DbBranchCapabilityDescriptor {
    readonly provider: DbBranchProviderName;
    readonly mode: DbBranchProviderMode;
    readonly supportsClone: boolean;
    readonly supportsTtl: boolean;
    readonly supportsCleanup: boolean;
}
export interface ManagedDbBranchPlan {
    readonly kind: 'managed';
    readonly provider: DbBranchProviderName;
    readonly branchName: string;
    readonly connectionStringEnvVar: string;
    readonly connectionStringSecretRef: string;
    readonly smokeCommand: string;
    readonly ttlSeconds: number;
    readonly cleanupCommand: string;
}
export interface SkippedDbBranchPlan {
    readonly kind: 'skip';
    readonly reason: string;
    readonly evidence: string;
}
export type DbBranchPlan = ManagedDbBranchPlan | SkippedDbBranchPlan;
export interface CreateDbBranchPlanInput {
    readonly provider: DbBranchCapabilityDescriptor;
    readonly branchName: string;
    readonly connectionStringEnvVar: string;
    readonly connectionStringSecretRef: string;
    readonly smokeCommand: string;
    readonly ttlSeconds: number;
    readonly cleanupCommand: string;
}
export interface CreateDbBranchSkipPlanInput {
    readonly reason: string;
    readonly evidence: string;
}
export declare function isDbBranchProviderDescriptor(value: unknown): value is DbBranchCapabilityDescriptor;
export declare function createDbBranchPlan(input: CreateDbBranchPlanInput): ManagedDbBranchPlan;
export declare function createDbBranchSkipPlan(input: CreateDbBranchSkipPlanInput): SkippedDbBranchPlan;
//# sourceMappingURL=types.d.ts.map