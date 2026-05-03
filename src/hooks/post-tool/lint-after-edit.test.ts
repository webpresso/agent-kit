import { describe, expect, it } from 'vitest'

import type { ToolInput } from '#hooks/shared/types'

import { lintFile, processPostToolUse, shouldLintFile } from './lint-after-edit.js'

function makeWriteInput(filePath: string): ToolInput {
  return {
    session_id: 'test-session',
    transcript_path: '/tmp/transcript.jsonl',
    cwd: '/tmp',
    hook_event_name: 'PostToolUse',
    tool_name: 'Write',
    tool_input: { file_path: filePath },
  }
}

describe('lint-after-edit', () => {
  it('classifies lintable files', () => {
    expect(shouldLintFile(makeWriteInput('/tmp/example.ts'))).toBe(true)
    expect(shouldLintFile(makeWriteInput('/tmp/example.md'))).toBe(false)
    expect(shouldLintFile(makeWriteInput('/tmp/node_modules/example.ts'))).toBe(false)
  })

  it('returns false when the target file does not exist', () => {
    expect(lintFile('/definitely/missing/file.ts', process.cwd())).toBe(false)
  })

  it('returns true for eligible existing files without shelling out', () => {
    expect(processPostToolUse(makeWriteInput(import.meta.filename), process.cwd())).toBe(true)
  })

  it('returns false for ineligible files', () => {
    expect(processPostToolUse(makeWriteInput('/tmp/example.md'), process.cwd())).toBe(false)
  })
})
