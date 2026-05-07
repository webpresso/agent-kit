import { describe, expect, it } from 'vitest'

import {
  buildTestCommand,
  buildTypecheckCommand,
  formatStopHookOutput,
} from './qa-changed-files.js'

describe('formatStopHookOutput', () => {
  it('emits systemMessage at top level (not wrapped in hookSpecificOutput)', () => {
    const json = formatStopHookOutput({
      systemMessage: 'QA gate failed on changed files: Typecheck failed:',
    })
    const output = JSON.parse(json)
    expect(output.systemMessage).toContain('QA gate failed')
    expect(output.hookSpecificOutput).toBeUndefined()
  })
})

describe('buildTestCommand / buildTypecheckCommand', () => {
  it('returns null for empty file lists', () => {
    expect(buildTestCommand([])).toBeNull()
    expect(buildTypecheckCommand([])).toBeNull()
  })

  it('single-quotes file paths so $-prefixed segments are not shell-expanded', () => {
    const path =
      'apps/web/app/routes/_dashboard/organizations.$orgSlug.projects.$projectSlug.analytics.test.tsx'
    expect(buildTestCommand([path])).toBe(`just test --file '${path}'`)
    expect(buildTypecheckCommand([path])).toBe(`just typecheck --file '${path}'`)
  })

  it('joins multiple files', () => {
    expect(buildTestCommand(['a.test.ts', 'b.test.ts'])).toBe(
      "just test --file 'a.test.ts' --file 'b.test.ts'",
    )
  })
})
