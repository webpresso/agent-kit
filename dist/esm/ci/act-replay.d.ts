import type { CiActEventName } from './act-runner.js';
export declare const GENERATED_REPLAY_WORKFLOW_PLACEHOLDER = "[GENERATED_REPLAY_WORKFLOW]";
export interface CiActReplayWorkflow {
    readonly workflowPath: string;
    cleanup(): void;
}
export declare function buildReplayWorkflowSource(sourceYaml: string, options: {
    readonly workflowPath: string;
    readonly eventName: CiActEventName;
}): string;
export declare function createReplayWorkflow(options: {
    readonly cwd: string;
    readonly workflowPath: string;
    readonly eventName: CiActEventName;
}): CiActReplayWorkflow;
//# sourceMappingURL=act-replay.d.ts.map