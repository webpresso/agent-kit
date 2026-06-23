export declare const TEST_SUITE_VALUES: readonly ["all", "unit", "integration"];
export type TestSuiteName = (typeof TEST_SUITE_VALUES)[number];
export interface ResolvedTestSuiteRun {
    readonly suite: Exclude<TestSuiteName, 'all'>;
    readonly label: string;
    readonly vitestArgs: readonly string[];
}
export declare function normalizeTestSuiteName(suite?: TestSuiteName): TestSuiteName;
export declare function parseTestSuiteName(suite?: string): TestSuiteName | undefined;
export declare function resolveTestSuiteRuns(suite?: TestSuiteName, passthrough?: readonly string[]): ResolvedTestSuiteRun[];
//# sourceMappingURL=suite.d.ts.map