import type { DeployLane, DeployPlan } from "./types.js";
export declare const DEPLOY_PLAN_SCHEMA_VERSION = 1;
export declare function isDeployLane(value: string): value is DeployLane;
export declare function parseDeployLane(value: string): DeployLane;
export declare function validateDeployPlan(plan: unknown): DeployPlan;
//# sourceMappingURL=schema.d.ts.map