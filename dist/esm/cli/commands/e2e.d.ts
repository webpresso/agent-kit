import type { CommandConfig, E2eRunnerKind, PlannedE2eRunGroup } from "#e2e";
import type { CAC } from "cac";
import { plannedGroupsToCommandConfigs } from "#e2e/execution";
export declare const E2E_COMMAND_HELP: string;
export interface AkE2eCommandInput {
    suite?: string;
    runner?: E2eRunnerKind;
    config?: string;
    file?: readonly string[] | string;
    headed?: boolean;
    debug?: boolean;
    reuseReset?: boolean;
    noSupervisor?: boolean;
    workers?: number | string;
    testList?: string;
    timeoutMs?: number;
    passthrough?: readonly string[];
}
export declare function createAkE2eCommandConfig(input: AkE2eCommandInput): CommandConfig;
export declare function createAkE2eExecutionPlan(input: AkE2eCommandInput, cwd?: string): Promise<PlannedE2eRunGroup[]>;
export declare function registerE2eCommand(cli: CAC): void;
export { plannedGroupsToCommandConfigs };
//# sourceMappingURL=e2e.d.ts.map