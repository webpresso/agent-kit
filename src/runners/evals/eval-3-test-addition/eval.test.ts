import { describe, expect, it, vi } from 'vitest'

import type { RunnerContext, RunnerTask } from '../../types.js'
import { ClaudeSubagentRunner } from '../../claude-subagent/index.js'
import type { SubagentFn } from '../../claude-subagent/types.js'
import { assertEval3 } from './assert.js'

// ---------------------------------------------------------------------------
// Fixtures
// ---------------------------------------------------------------------------

const VERSION = '0.15.1'

const TASK: RunnerTask = {
  id: 'eval-3-test-addition',
  description:
    'Add a missing test for src/multiply.ts which exports multiply(a, b). The test file src/multiply.test.ts must assert multiply(3, 4) === 12 via toStrictEqual. pnpm test src/multiply.test.ts exits 0.',
  permissions: 'workspace-write',
}

const CTX: RunnerContext = {
  cwd: '/tmp/eval-3-workspace',
}

// ---------------------------------------------------------------------------
// Mock subagent — does NOT spawn a real runner
// Returns a canned response simulating a successful test-addition task
// ---------------------------------------------------------------------------

const MOCK_OUTPUT =
  'Created src/multiply.test.ts with toStrictEqual assertion. expect(multiply(3,4)).toStrictEqual(12). Tests pass.'

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

describe('eval-3: test-addition (mocked subagent)', () => {
  it('eval passes with mocked backend', async () => {
    const subagentFn: SubagentFn = vi.fn().mockResolvedValue(MOCK_OUTPUT)
    const runner = new ClaudeSubagentRunner(VERSION, subagentFn)

    const events = await collectEvents(runner)
    const result = await assertEval3(events)

    expect(result.passed).toStrictEqual(true)
  })

  it('events contain started → stdout content → completed sequence', async () => {
    const subagentFn: SubagentFn = vi.fn().mockResolvedValue(MOCK_OUTPUT)
    const runner = new ClaudeSubagentRunner(VERSION, subagentFn)

    const events = await collectEvents(runner)

    // First event is 'started'
    expect(events[0]?.type).toStrictEqual('started')

    // Middle events include stdout mentioning 'multiply'
    const stdoutEvents = events.filter((e) => e.type === 'stdout')
    expect(stdoutEvents.length).toBeGreaterThanOrEqual(1)
    const hasMultiplyMention = stdoutEvents.some(
      (e) => e.type === 'stdout' && e.line.toLowerCase().includes('multiply'),
    )
    expect(hasMultiplyMention).toStrictEqual(true)

    // Last event is 'completed' with exitCode 0
    const last = events.at(-1)
    expect(last?.type).toStrictEqual('completed')
    expect(last).toStrictEqual(
      expect.objectContaining({ type: 'completed', exitCode: 0 }),
    )
  })

  it('assertEval3 returns passed=false when no completed event', async () => {
    const result = await assertEval3([
      { type: 'started', ts: new Date().toISOString(), handle: 'h' },
      {
        type: 'stdout',
        ts: new Date().toISOString(),
        handle: 'h',
        line: 'Created src/multiply.test.ts',
      },
    ])

    expect(result.passed).toStrictEqual(false)
    expect(result.reason).toStrictEqual("no 'completed' event found in event stream")
  })

  it('assertEval3 returns passed=false when completed exitCode is non-zero', async () => {
    const result = await assertEval3([
      { type: 'started', ts: new Date().toISOString(), handle: 'h' },
      {
        type: 'stdout',
        ts: new Date().toISOString(),
        handle: 'h',
        line: 'Created src/multiply.test.ts',
      },
      { type: 'completed', ts: new Date().toISOString(), handle: 'h', exitCode: 1 },
    ])

    expect(result.passed).toStrictEqual(false)
    expect(result.reason).toStrictEqual("'completed' event has exitCode 1, expected 0")
  })

  it('assertEval3 returns passed=false when no stdout/progress mentions test or multiply', async () => {
    const result = await assertEval3([
      { type: 'started', ts: new Date().toISOString(), handle: 'h' },
      {
        type: 'stdout',
        ts: new Date().toISOString(),
        handle: 'h',
        line: 'some unrelated output',
      },
      { type: 'completed', ts: new Date().toISOString(), handle: 'h', exitCode: 0 },
    ])

    expect(result.passed).toStrictEqual(false)
    expect(result.reason).toStrictEqual(
      "no stdout or progress event mentions 'test' or 'multiply'",
    )
  })
})
