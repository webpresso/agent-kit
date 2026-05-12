import { describe, expect, it, vi } from 'vitest'

import type { RunnerContext, RunnerTask } from '../../types.js'
import { ClaudeSubagentRunner } from '../../claude-subagent/index.js'
import type { SubagentFn } from '../../claude-subagent/types.js'
import { assertEval4 } from './assert.js'

// ---------------------------------------------------------------------------
// Fixtures
// ---------------------------------------------------------------------------

const VERSION = '0.15.1'

const TASK: RunnerTask = {
  id: 'eval-4-dependency-bump',
  description:
    'Bump zod from ^3.22.0 to ^3.23.0 in package.json. Run pnpm install --frozen-lockfile to verify. No test failures after the bump.',
  permissions: 'workspace-write',
}

const CTX: RunnerContext = {
  cwd: '/tmp/eval-4-workspace',
}

// ---------------------------------------------------------------------------
// Mock subagent — does NOT spawn a real runner
// Returns a canned response simulating a successful dependency-bump task
// ---------------------------------------------------------------------------

const MOCK_OUTPUT =
  'Updated zod from ^3.22.0 to ^3.23.0 in package.json. pnpm install succeeded. No test failures.'

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

describe('eval-4: dependency-bump (mocked subagent)', () => {
  it('eval passes with mocked backend', async () => {
    const subagentFn: SubagentFn = vi.fn().mockResolvedValue(MOCK_OUTPUT)
    const runner = new ClaudeSubagentRunner(VERSION, subagentFn)

    const events = await collectEvents(runner)
    const result = await assertEval4(events)

    expect(result.passed).toStrictEqual(true)
  })

  it('events contain started → stdout content → completed sequence', async () => {
    const subagentFn: SubagentFn = vi.fn().mockResolvedValue(MOCK_OUTPUT)
    const runner = new ClaudeSubagentRunner(VERSION, subagentFn)

    const events = await collectEvents(runner)

    // First event is 'started'
    expect(events[0]?.type).toStrictEqual('started')

    // Middle events include stdout mentioning 'zod'
    const stdoutEvents = events.filter((e) => e.type === 'stdout')
    expect(stdoutEvents.length).toBeGreaterThanOrEqual(1)
    const hasDependencyMention = stdoutEvents.some(
      (e) =>
        e.type === 'stdout' &&
        (e.line.toLowerCase().includes('zod') ||
          e.line.toLowerCase().includes('bump') ||
          e.line.toLowerCase().includes('version')),
    )
    expect(hasDependencyMention).toStrictEqual(true)

    // Last event is 'completed' with exitCode 0
    const last = events.at(-1)
    expect(last?.type).toStrictEqual('completed')
    expect(last).toStrictEqual(
      expect.objectContaining({ type: 'completed', exitCode: 0 }),
    )
  })

  it('assertEval4 returns passed=false when no completed event', async () => {
    const result = await assertEval4([
      { type: 'started', ts: new Date().toISOString(), handle: 'h' },
      {
        type: 'stdout',
        ts: new Date().toISOString(),
        handle: 'h',
        line: 'Updated zod in package.json',
      },
    ])

    expect(result.passed).toStrictEqual(false)
    expect(result.reason).toStrictEqual("no 'completed' event found in event stream")
  })

  it('assertEval4 returns passed=false when completed exitCode is non-zero', async () => {
    const result = await assertEval4([
      { type: 'started', ts: new Date().toISOString(), handle: 'h' },
      {
        type: 'stdout',
        ts: new Date().toISOString(),
        handle: 'h',
        line: 'Updated zod in package.json',
      },
      { type: 'completed', ts: new Date().toISOString(), handle: 'h', exitCode: 1 },
    ])

    expect(result.passed).toStrictEqual(false)
    expect(result.reason).toStrictEqual("'completed' event has exitCode 1, expected 0")
  })

  it('assertEval4 returns passed=false when no stdout/progress mentions zod, bump, or version', async () => {
    const result = await assertEval4([
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
      "no stdout or progress event mentions 'zod', 'bump', or 'version'",
    )
  })
})
