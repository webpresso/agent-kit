export const TEST_SUITE_VALUES = ['all', 'unit', 'integration'] as const

export type TestSuiteName = (typeof TEST_SUITE_VALUES)[number]

export interface ResolvedTestSuiteRun {
  readonly suite: Exclude<TestSuiteName, 'all'>
  readonly label: string
  readonly vitestArgs: readonly string[]
}

const UNIT_SUITE_RUN: ResolvedTestSuiteRun = {
  suite: 'unit',
  label: 'suite unit',
  vitestArgs: ['run', '--exclude', '**/*.integration.test.ts', '--maxWorkers', '1'],
}

const INTEGRATION_SUITE_RUN: ResolvedTestSuiteRun = {
  suite: 'integration',
  label: 'suite integration',
  vitestArgs: ['run', '--no-file-parallelism', '.integration.test.ts', '--testTimeout', '30000'],
}

export function normalizeTestSuiteName(suite?: TestSuiteName): TestSuiteName {
  return suite ?? 'all'
}

export function parseTestSuiteName(suite?: string): TestSuiteName | undefined {
  if (suite === undefined) return
  if ((TEST_SUITE_VALUES as readonly string[]).includes(suite)) {
    return suite as TestSuiteName
  }
  throw new Error(`Unknown test suite "${suite}". Expected one of: ${TEST_SUITE_VALUES.join(', ')}`)
}

export function resolveTestSuiteRuns(
  suite: TestSuiteName = 'all',
  passthrough: readonly string[] = [],
): ResolvedTestSuiteRun[] {
  const baseRuns =
    suite === 'all'
      ? [UNIT_SUITE_RUN, INTEGRATION_SUITE_RUN]
      : suite === 'unit'
        ? [UNIT_SUITE_RUN]
        : [INTEGRATION_SUITE_RUN]

  return baseRuns.map((run) => ({
    ...run,
    vitestArgs: [...run.vitestArgs, ...passthrough],
  }))
}
