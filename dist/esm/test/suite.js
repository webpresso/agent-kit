export const TEST_SUITE_VALUES = ['all', 'unit', 'integration'];
const UNIT_SUITE_RUN = {
    suite: 'unit',
    label: 'suite unit',
    vitestArgs: ['run', '--exclude', '**/*.integration.test.ts'],
};
const INTEGRATION_SUITE_RUN = {
    suite: 'integration',
    label: 'suite integration',
    vitestArgs: ['run', '--no-file-parallelism', '.integration.test.ts', '--testTimeout', '30000'],
};
export function normalizeTestSuiteName(suite) {
    return suite ?? 'all';
}
export function parseTestSuiteName(suite) {
    if (suite === undefined)
        return;
    if (TEST_SUITE_VALUES.includes(suite)) {
        return suite;
    }
    throw new Error(`Unknown test suite "${suite}". Expected one of: ${TEST_SUITE_VALUES.join(', ')}`);
}
export function resolveTestSuiteRuns(suite = 'all', passthrough = []) {
    const baseRuns = suite === 'all'
        ? [UNIT_SUITE_RUN, INTEGRATION_SUITE_RUN]
        : suite === 'unit'
            ? [UNIT_SUITE_RUN]
            : [INTEGRATION_SUITE_RUN];
    return baseRuns.map((run) => ({
        ...run,
        vitestArgs: [...run.vitestArgs, ...passthrough],
    }));
}
//# sourceMappingURL=suite.js.map