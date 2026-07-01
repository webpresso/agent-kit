import type { E2eCommandRequest, E2eHostAdapter, E2eRunPlannerOptions, E2eStepDefinition, PlannedE2eRunGroup, PlannedE2eRunStep } from "./types.js";
export interface GenericE2ePlanInput extends E2eCommandRequest {
    suite?: string;
    runner?: E2eStepDefinition["runner"];
    config?: string;
}
export declare function planGenericE2eRun(input: GenericE2ePlanInput): PlannedE2eRunGroup[];
export declare function planE2eRun(options: E2eRunPlannerOptions): PlannedE2eRunGroup[];
export declare function groupPlannedE2eRuns(runs: readonly PlannedE2eRunStep[]): PlannedE2eRunGroup[];
export declare function normalizeRequestedFiles(files: readonly string[], hostAdapter?: E2eHostAdapter): string[];
//# sourceMappingURL=run-planner.d.ts.map