import { describe, expect, it, vi } from 'vitest'

import type { RunnerContext, RunnerTask } from '#runners/types.js'
import { ClaudeSubagentRunner } from '#runners/claude-subagent/index.js'
import type { SubagentFn } from '#runners/claude-subagent/types.js'
import { assertEval2 } from './assert.js'

// ---------------------------------------------------------------------------
// Fixtures
// ---------------------------------------------------------------------------

const VERSION = '0.15.1'

const TASK: RunnerTask = {
  id: 'eval-2-multi-file-refactor',
  description:
    'Extract the duplicated clamp(n, min, max) function from src/a.ts and src/b.ts into src/utils/clamp.ts. Both files import from the new location. pnpm test exits 0 after the refactor.',
  permissions: 'workspace-write',
}

const CTX: RunnerContext = {
  cwd: '/tmp/eval-2-workspace',
}

// ---------------------------------------------------------------------------
// Mock subagent — does NOT spawn a real runner
// Returns a canned response simulating a successful multi-file-refactor task
// ---------------------------------------------------------------------------

const MOCK_OUTPUT =
  'Extracted clamp() from src/a.ts and src/b.ts into src/utils/clamp.ts. Updated imports in both files. Tests pass.'

async function collectEvents(runner: ClaudeSubagentRunner) {
  const exec = runner.prepare(TASK, CTX)
  const events = []
  for await (const event of exec.run()) {
    events.push(event)
  }
  return events
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe('eval-2: multi-file-refactor (mocked subagent)', () => {
  it('eval passes with mocked backend', async () => {
    const subagentFn: SubagentFn = vi.fn().mockResolvedValue(MOCK_OUTPUT)
    const runner = new ClaudeSubagentRunner(VERSION, subagentFn)

    const events = await collectEvents(runner)
    const result = await assertEval2(events)

    expect(result.passed).toStrictEqual(true)
  })

  it('events contain started → stdout content → completed sequence', async () => {
    const subagentFn: SubagentFn = vi.fn().mockResolvedValue(MOCK_OUTPUT)
    const runner = new ClaudeSubagentRunner(VERSION, subagentFn)

    const events = await collectEvents(runner)

    // First event is 'started'
    expect(events[0]?.type).toStrictEqual('started')

    // Middle events include stdout mentioning 'clamp' or 'extract'
    const stdoutEvents = events.filter((e) => e.type === 'stdout')
    expect(stdoutEvents.length).toBeGreaterThanOrEqual(1)
    const hasClampOrExtractMention = stdoutEvents.some(
      (e) =>
        e.type === 'stdout' &&
        (e.line.toLowerCase().includes('clamp') || e.line.toLowerCase().includes('extract')),
    )
    expect(hasClampOrExtractMention).toStrictEqual(true)

    // Last event is 'completed' with exitCode 0
    const last = events.at(-1)
    expect(last?.type).toStrictEqual('completed')
    expect(last).toStrictEqual(expect.objectContaining({ type: 'completed', exitCode: 0 }))
  })

  it('assertEval2 returns passed=false when no completed event', async () => {
    const result = await assertEval2([
      { type: 'started', ts: new Date().toISOString(), handle: 'h' },
      { type: 'stdout', ts: new Date().toISOString(), handle: 'h', line: 'Extracted clamp()' },
    ])

    expect(result.passed).toStrictEqual(false)
    expect(result.reason).toStrictEqual("no 'completed' event found in event stream")
  })

  it('assertEval2 returns passed=false when completed exitCode is non-zero', async () => {
    const result = await assertEval2([
      { type: 'started', ts: new Date().toISOString(), handle: 'h' },
      { type: 'stdout', ts: new Date().toISOString(), handle: 'h', line: 'Extracted clamp()' },
      { type: 'completed', ts: new Date().toISOString(), handle: 'h', exitCode: 1 },
    ])

    expect(result.passed).toStrictEqual(false)
    expect(result.reason).toStrictEqual("'completed' event has exitCode 1, expected 0")
  })

  it('assertEval2 returns passed=false when no stdout/progress mentions clamp or extract', async () => {
    const result = await assertEval2([
      { type: 'started', ts: new Date().toISOString(), handle: 'h' },
      { type: 'stdout', ts: new Date().toISOString(), handle: 'h', line: 'some unrelated output' },
      { type: 'completed', ts: new Date().toISOString(), handle: 'h', exitCode: 0 },
    ])

    expect(result.passed).toStrictEqual(false)
    expect(result.reason).toStrictEqual("no stdout or progress event mentions 'clamp' or 'extract'")
  })
})
