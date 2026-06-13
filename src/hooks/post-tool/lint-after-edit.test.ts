import { describe, expect, it } from 'vitest'

import type { ToolInput } from '#hooks/shared/types'

import { SessionMemorySessionStore } from '../../session-memory/session.js'
import {
  capturePostToolUse,
  lintFile,
  processPostToolUse,
  shouldLintFile,
} from './lint-after-edit.js'

function makeWriteInput(filePath: string): ToolInput {
  return {
    session_id: 'test-session',
    transcript_path: '/tmp/transcript.jsonl',
    cwd: '/tmp',
    hook_event_name: 'PostToolUse',
    tool_name: 'Write',
    tool_input: { file_path: filePath, content: 'written content' },
  }
}

function makeEditInput(filePath: string): ToolInput {
  return {
    session_id: 'test-session',
    transcript_path: '/tmp/transcript.jsonl',
    cwd: '/tmp',
    hook_event_name: 'PostToolUse',
    tool_name: 'Edit',
    tool_input: { file_path: filePath, old_string: 'before', new_string: 'after' },
  }
}

function makeReadInput(filePath: string): ToolInput {
  return {
    session_id: 'test-session',
    cwd: '/tmp',
    hook_event_name: 'PostToolUse',
    tool_name: 'Read',
    tool_input: { file_path: filePath },
  }
}

function makeBashInput(command: string): ToolInput {
  return {
    session_id: 'test-session',
    cwd: '/tmp',
    hook_event_name: 'PostToolUse',
    tool_name: 'Bash',
    tool_input: { command },
  }
}

describe('lint-after-edit', () => {
  const noOpCaptureDeps = {
    dbPath: ':memory:',
    repoHash: () => 'repo123456789abcd',
    createStore: () => ({
      captureEvent: () => 'event',
      close: () => undefined,
    }),
  }

  it('classifies lintable files', () => {
    expect(shouldLintFile(makeWriteInput('/tmp/example.ts'))).toBe(true)
    expect(shouldLintFile(makeWriteInput('/tmp/example.md'))).toBe(false)
    expect(shouldLintFile(makeWriteInput('/tmp/node_modules/example.ts'))).toBe(false)
  })

  it('returns false when the target file does not exist', () => {
    expect(lintFile('/definitely/missing/file.ts', process.cwd())).toBe(false)
  })

  it('returns true for eligible existing files without shelling out', () => {
    expect(
      processPostToolUse(makeWriteInput(import.meta.filename), process.cwd(), {}, noOpCaptureDeps),
    ).toBe(true)
  })

  it('returns false for ineligible files', () => {
    expect(
      processPostToolUse(makeWriteInput('/tmp/example.md'), process.cwd(), {}, noOpCaptureDeps),
    ).toBe(false)
  })

  it('captures write/edit/read/bash PostToolUse events as typed bounded continuity events', () => {
    const dbPath = ':memory:'
    const store = new SessionMemorySessionStore(dbPath)
    const captured: unknown[] = []
    const deps = {
      dbPath,
      repoHash: () => 'repo123456789abcd',
      now: () => new Date('2026-06-13T00:00:00.000Z'),
      createStore: () => ({
        captureEvent: (input: unknown) => {
          captured.push(input)
          return store.captureEvent(
            input as Parameters<SessionMemorySessionStore['captureEvent']>[0],
          )
        },
        close: () => undefined,
      }),
    }

    expect(capturePostToolUse(makeWriteInput('/tmp/example.ts'), '/tmp', {}, deps)).toBe(true)
    expect(capturePostToolUse(makeEditInput('/tmp/example.ts'), '/tmp', {}, deps)).toBe(true)
    expect(capturePostToolUse(makeReadInput('/tmp/example.ts'), '/tmp', {}, deps)).toBe(true)
    expect(capturePostToolUse(makeBashInput('echo hello && echo world'), '/tmp', {}, deps)).toBe(
      true,
    )

    expect(captured).toHaveLength(4)
    expect(
      captured.map((entry) => (entry as { event: { eventType: string } }).event.eventType),
    ).toEqual(['tool_edit', 'tool_edit', 'tool_read', 'tool_command'])
    expect(JSON.stringify(captured)).not.toContain('before')
    expect(JSON.stringify(captured)).not.toContain('after')
    store.close()
  })

  it('byte-caps command capture and fails open when storage is unavailable', () => {
    const captured: unknown[] = []
    const deps = {
      dbPath: ':memory:',
      repoHash: () => 'repo123456789abcd',
      createStore: () => ({
        captureEvent: (input: unknown) => {
          captured.push(input)
          return 'event'
        },
        close: () => undefined,
      }),
    }

    expect(capturePostToolUse(makeBashInput('x'.repeat(10_000)), '/tmp', {}, deps)).toBe(true)
    const content = (
      captured[0] as { event: { content: string; metadata?: { truncated?: boolean } } }
    ).event.content
    expect(Buffer.byteLength(content, 'utf8')).toBeLessThanOrEqual(2048)

    expect(
      capturePostToolUse(
        makeBashInput('echo ok'),
        '/tmp',
        {},
        {
          createStore: () => {
            throw new Error('db down')
          },
        },
      ),
    ).toBe(false)
  })
})
