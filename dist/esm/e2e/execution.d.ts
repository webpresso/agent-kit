import type { CommandConfig, PlannedE2eRunGroup } from './types.js';
import type { GenericE2ePlanInput } from './run-planner.js';
export declare function createE2eExecutionPlan(input: GenericE2ePlanInput, cwd?: string): Promise<PlannedE2eRunGroup[]>;
export declare function plannedGroupsToCommandConfigs(groups: readonly PlannedE2eRunGroup[]): CommandConfig[];
export declare function formatShellCommand(config: CommandConfig): string;
export interface CommandExecutionSummary {
    passed: boolean;
    exitCode: number;
    output: string;
}
export declare function runCommandConfigs(commands: readonly CommandConfig[], options?: {
    signal?: AbortSignal;
}): Promise<CommandExecutionSummary>;
//# sourceMappingURL=execution.d.ts.map