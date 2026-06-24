export { createPlaywrightE2ePreset, type PlaywrightCompatibleConfig, type PlaywrightE2ePresetOptions, } from './playwright.js';
export type E2ePresetRunnerKind = 'playwright' | 'vitest' | 'command';
export interface E2ePresetSuite {
    id: string;
    runner: E2ePresetRunnerKind;
    configPath: string;
    fileMatchers: readonly string[];
}
export interface ResolveE2ePresetSuiteOptions<TSuite extends E2ePresetSuite = E2ePresetSuite> {
    suite?: string;
    file?: string;
    suites: readonly TSuite[];
}
export declare function defineE2ePresetSuite<TSuite extends E2ePresetSuite>(suite: TSuite): TSuite;
export declare function normalizeE2ePresetPath(filePath: string): string;
export declare function resolveE2ePresetSuite<TSuite extends E2ePresetSuite>(options: ResolveE2ePresetSuiteOptions<TSuite>): TSuite | null;
//# sourceMappingURL=index.d.ts.map