import type { E2eExecutionRequest, E2eHostAdapter, E2eStepDefinition, E2eSuiteDefinition, ResolvedE2eFile } from './types.js';
export interface CommandHostAdapterRunDefinition {
    batchKey: string;
    logName: string;
    command: string;
    args: string[];
    suiteId?: string;
    envProfile?: string;
    env?: Record<string, string>;
    reportDir?: string;
}
export interface CommandHostAdapterGroupDefinition {
    batchKey: string;
    envProfile?: string;
    env?: Record<string, string>;
    run: CommandHostAdapterRunDefinition;
}
export interface CreateCommandE2eHostAdapterOptions {
    listSuites: () => readonly E2eSuiteDefinition[];
    resolveSuiteId: (name: string) => string | null;
    resolveSuiteGroup?: (name: string) => readonly string[] | null;
    normalizeFilePath: (filePath: string) => string;
    resolveSuiteForFile: (filePath: string) => ResolvedE2eFile | null;
    defaultSuiteId: string;
    buildCommandGroup: (request: E2eExecutionRequest) => CommandHostAdapterGroupDefinition;
}
export declare function createCommandE2eHostAdapter(options: CreateCommandE2eHostAdapterOptions): E2eHostAdapter;
export declare function cloneE2eStepDefinition(step: E2eStepDefinition): E2eStepDefinition;
export declare function cloneE2eSuiteDefinition(suite: E2eSuiteDefinition): E2eSuiteDefinition;
//# sourceMappingURL=command-host-adapter.d.ts.map