import type { DeployPlan } from './types.js';
export interface CreateDeployPlanOptions {
    readonly cwd?: string;
    readonly lane: string;
    readonly dryRun?: boolean;
}
export interface RunDeployPlanOptions extends CreateDeployPlanOptions {
    readonly planJson?: boolean;
}
export declare function createDeployPlan(options: CreateDeployPlanOptions): Promise<DeployPlan>;
export declare function runDeployPlan(options: RunDeployPlanOptions): Promise<number>;
//# sourceMappingURL=run.d.ts.map