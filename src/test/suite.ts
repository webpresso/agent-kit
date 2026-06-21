export const TEST_SUITE_VALUES = ['all', 'unit', 'integration', 'package-smoke'] as const

export type TestSuiteName = (typeof TEST_SUITE_VALUES)[number]

export interface ResolvedTestSuiteRun {
  readonly suite: Exclude<TestSuiteName, 'all'>
  readonly label: string
  readonly vitestArgs: readonly string[]
}

/**
 * `all` means the standard non-smoke suite: unit followed by integration/e2e.
 * Package install/setup smoke tests are intentionally explicit release-gate
 * work and run through `package-smoke`.
 */
const UNIT_SUITE_RUN: ResolvedTestSuiteRun = {
  suite: 'unit',
  label: 'suite unit',
  vitestArgs: ['run', '--exclude', '**/*.integration.test.ts', '--exclude', '**/*.e2e.test.ts'],
}

const INTEGRATION_SUITE_RUN: ResolvedTestSuiteRun = {
  suite: 'integration',
  label: 'suite integration',
  vitestArgs: [
    'run',
    '--no-file-parallelism',
    '.integration.test.ts',
    '.e2e.test.ts',
    '--testTimeout',
    '30000',
  ],
}

const PACKAGE_SMOKE_SUITE_RUN: ResolvedTestSuiteRun = {
  suite: 'package-smoke',
  label: 'suite package-smoke',
  vitestArgs: [
    'run',
    '--no-file-parallelism',
    'package-smoke.test.ts',
    '--testTimeout',
    '120000',
  ],
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
        : suite === 'integration'
          ? [INTEGRATION_SUITE_RUN]
          : [PACKAGE_SMOKE_SUITE_RUN]

  return baseRuns.map((run) => ({
    ...run,
    vitestArgs: [...run.vitestArgs, ...passthrough],
  }))
}
