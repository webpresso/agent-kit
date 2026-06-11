/**
 * Export-isolation guard for `@webpresso/agent-kit/lint`.
 *
 * Ensures the public surface of the `./lint` subpath stays:
 *   1. resolvable from the package's own source-relative module ID
 *   2. shaped as the contract framework consumers (Wave 2 scaffolders)
 *      depend on: `runLint(options): Promise<LintResult>` plus the
 *      `parseOxlintIssues` helper.
 *
 * If anyone breaks the export shape (rename, remove, change to default
 * export, etc.) this test fails — preventing silent consumer breakage.
 */

import { describe, expect, it } from 'vitest'

import * as lintModule from './index.js'
import { parseOxlintIssues, runLint } from './index.js'

describe('@webpresso/agent-kit/lint export surface', () => {
  it('exports runLint as a function', () => {
    expect(typeof runLint).toBe('function')
    expect(runLint.length).toBeLessThanOrEqual(1)
  })

  it('exports parseOxlintIssues as a function', () => {
    expect(typeof parseOxlintIssues).toBe('function')
  })

  it('exposes exactly the documented named exports', () => {
    const exported = Object.keys(lintModule).sort()
    expect(exported).toEqual(['parseOxlintIssues', 'runLint'].sort())
  })

  it('parseOxlintIssues returns an empty issues array on empty input', () => {
    const result = parseOxlintIssues('')
    expect(result.issues).toEqual([])
    expect(result.parseError).toBe(undefined)
  })

  it('parseOxlintIssues flattens an oxlint JSON array into structured issues', () => {
    const raw = JSON.stringify([
      {
        filePath: '/abs/src/foo.ts',
        messages: [
          { line: 12, ruleId: 'no-debugger', message: 'Unexpected debugger' },
          { line: 13, ruleId: null, message: 'Missing rule id' },
        ],
      },
      { filePath: '/abs/src/bar.ts', messages: [] },
    ])
    const { issues, parseError } = parseOxlintIssues(raw)
    expect(parseError).toBe(undefined)
    expect(issues).toEqual([
      { file: '/abs/src/foo.ts', line: 12, rule: 'no-debugger', message: 'Unexpected debugger' },
      { file: '/abs/src/foo.ts', line: 13, rule: '', message: 'Missing rule id' },
    ])
  })

  it('parseOxlintIssues sets parseError on malformed JSON', () => {
    const result = parseOxlintIssues('{not json')
    expect(result.issues).toEqual([])
    expect(result.parseError).toMatch(/oxlint JSON\.parse failed/)
  })

  it('parseOxlintIssues sets parseError when JSON is not an array', () => {
    const result = parseOxlintIssues(JSON.stringify({ foo: 'bar' }))
    expect(result.issues).toEqual([])
    expect(result.parseError).toBe('oxlint output was not a JSON array')
  })
})
