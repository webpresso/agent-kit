import { readdirSync, statSync } from 'node:fs'
import { join, relative } from 'node:path'

import { describe, expect, it } from 'vitest'

import { resolveTestSuiteRuns } from './suite.js'

function collectFiles(dir: string): string[] {
  return readdirSync(dir).flatMap((entry) => {
    const path = join(dir, entry)
    return statSync(path).isDirectory() ? collectFiles(path) : [path]
  })
}

describe('test suite classification', () => {
  it('keeps unit tests hermetic by excluding integration and e2e specs', () => {
    expect(resolveTestSuiteRuns('unit')[0]?.vitestArgs).toEqual([
      'run',
      '--exclude',
      '**/*.integration.test.ts',
      '--exclude',
      '**/*.e2e.test.ts',
    ])
  })

  it('serializes integration and e2e specs in the integration lane', () => {
    expect(resolveTestSuiteRuns('integration')[0]?.vitestArgs).toEqual([
      'run',
      '--no-file-parallelism',
      '.integration.test.ts',
      '.e2e.test.ts',
      '--testTimeout',
      '30000',
    ])
  })

  it('runs all as unit first, then serialized integration/e2e', () => {
    expect(resolveTestSuiteRuns('all').map((run) => run.suite)).toEqual(['unit', 'integration'])
  })

  it('requires files under src/__integration__ to opt into a serialized lane by suffix', () => {
    const integrationRoot = join(process.cwd(), 'src', '__integration__')
    const plainBoundaryTests = collectFiles(integrationRoot)
      .map((file) => relative(process.cwd(), file))
      .filter(
        (file) =>
          file.endsWith('.test.ts') &&
          !file.endsWith('.integration.test.ts') &&
          !file.endsWith('.e2e.test.ts'),
      )

    expect(plainBoundaryTests).toEqual([])
  })
})
