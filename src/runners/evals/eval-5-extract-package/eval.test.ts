import { describe, expect, it, vi } from 'vitest'

import type { RunnerContext, RunnerTask } from '../../types.js'
import { ClaudeSubagentRunner } from '../../claude-subagent/index.js'
import type { SubagentFn } from '../../claude-subagent/types.js'
import { assertEval5 } from './assert.js'

// ---------------------------------------------------------------------------
// Fixtures
// ---------------------------------------------------------------------------

const VERSION = '0.15.1'

const TASK: RunnerTask = {
  id: 'eval-5-extract-package',
  description:
    'Extract src/math/index.ts (exports add, subtract, multiply) into packages/math/. ' +
    'Run diff -ru src/math/ packages/math/src/ to confirm byte identity. ' +
    'Capture mutation score before and after; confirm new score >= old - 2.',
  permissions: 'workspace-write',
}

const CTX: RunnerContext = {
  cwd: '/tmp/eval-5-workspace',
}

// ---------------------------------------------------------------------------
// Mock subagent — does NOT spawn a real runner
// Returns a canned response simulating a successful extract-package task
// with parity verification output per the extraction-parity rule.
// ---------------------------------------------------------------------------

const MOCK_OUTPUT =
  'Extracted src/math/ to packages/math/src/. diff -ru shows no differences (byte identity confirmed). Mutation score: before 92% → after 91% (Δ = 1pt, within 2pt tolerance). Parity verified.'

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

describe('eval-5: extract-package (mocked subagent)', () => {
  it('eval passes with mocked backend', async () => {
    const subagentFn: SubagentFn = vi.fn().mockResolvedValue(MOCK_OUTPUT)
    const runner = new ClaudeSubagentRunner(VERSION, subagentFn)

    const events = await collectEvents(runner)
    const result = await assertEval5(events)

    expect(result.passed).toStrictEqual(true)
  })

  it('events contain started → stdout content → completed sequence', async () => {
    const subagentFn: SubagentFn = vi.fn().mockResolvedValue(MOCK_OUTPUT)
    const runner = new ClaudeSubagentRunner(VERSION, subagentFn)

    const events = await collectEvents(runner)

    // First event is 'started'
    expect(events[0]?.type).toStrictEqual('started')

    // Middle events include stdout mentioning parity keywords
    const stdoutEvents = events.filter((e) => e.type === 'stdout')
    expect(stdoutEvents.length).toBeGreaterThanOrEqual(1)
    const hasParityMention = stdoutEvents.some(
      (e) =>
        e.type === 'stdout' &&
        (e.line.toLowerCase().includes('byte') ||
          e.line.toLowerCase().includes('identity') ||
          e.line.toLowerCase().includes('parity') ||
          e.line.toLowerCase().includes('extract')),
    )
    expect(hasParityMention).toStrictEqual(true)

    // Last event is 'completed' with exitCode 0
    const last = events.at(-1)
    expect(last?.type).toStrictEqual('completed')
    expect(last).toStrictEqual(expect.objectContaining({ type: 'completed', exitCode: 0 }))
  })

  it('assertEval5 returns passed=false when no completed event', async () => {
    const result = await assertEval5([
      { type: 'started', ts: new Date().toISOString(), handle: 'h' },
      {
        type: 'stdout',
        ts: new Date().toISOString(),
        handle: 'h',
        line: 'Extracted src/math/ to packages/math/src/.',
      },
    ])

    expect(result.passed).toStrictEqual(false)
    expect(result.reason).toStrictEqual("no 'completed' event found in event stream")
  })

  it('assertEval5 returns passed=false when completed exitCode is non-zero', async () => {
    const result = await assertEval5([
      { type: 'started', ts: new Date().toISOString(), handle: 'h' },
      {
        type: 'stdout',
        ts: new Date().toISOString(),
        handle: 'h',
        line: 'Extracted src/math/ to packages/math/src/.',
      },
      { type: 'completed', ts: new Date().toISOString(), handle: 'h', exitCode: 1 },
    ])

    expect(result.passed).toStrictEqual(false)
    expect(result.reason).toStrictEqual("'completed' event has exitCode 1, expected 0")
  })

  it('assertEval5 returns passed=false when output mentions FAIL (byte-identity failure)', async () => {
    const result = await assertEval5([
      { type: 'started', ts: new Date().toISOString(), handle: 'h' },
      {
        type: 'stdout',
        ts: new Date().toISOString(),
        handle: 'h',
        line: 'diff -ru FAIL: files differ between src/math/ and packages/math/src/',
      },
      { type: 'completed', ts: new Date().toISOString(), handle: 'h', exitCode: 0 },
    ])

    expect(result.passed).toStrictEqual(false)
    expect(result.reason).toStrictEqual(
      "stdout or progress event reports a byte-identity failure ('FAIL' or 'mismatch')",
    )
  })

  it('assertEval5 returns passed=false when output mentions mismatch (byte-identity failure)', async () => {
    const result = await assertEval5([
      { type: 'started', ts: new Date().toISOString(), handle: 'h' },
      {
        type: 'stdout',
        ts: new Date().toISOString(),
        handle: 'h',
        line: 'Mutation score mismatch: before 92% → after 88% (Δ = 4pt, exceeds 2pt tolerance)',
      },
      { type: 'completed', ts: new Date().toISOString(), handle: 'h', exitCode: 0 },
    ])

    expect(result.passed).toStrictEqual(false)
    expect(result.reason).toStrictEqual(
      "stdout or progress event reports a byte-identity failure ('FAIL' or 'mismatch')",
    )
  })

  it('assertEval5 returns passed=false when no stdout/progress mentions parity keywords', async () => {
    const result = await assertEval5([
      { type: 'started', ts: new Date().toISOString(), handle: 'h' },
      {
        type: 'stdout',
        ts: new Date().toISOString(),
        handle: 'h',
        line: 'some unrelated output about copying files',
      },
      { type: 'completed', ts: new Date().toISOString(), handle: 'h', exitCode: 0 },
    ])

    expect(result.passed).toStrictEqual(false)
    expect(result.reason).toStrictEqual(
      "no stdout or progress event mentions 'byte', 'identity', 'parity', or 'extract' — parity verification not evidenced",
    )
  })

  it('assertEval5 passes when progress event (not stdout) mentions parity keywords', async () => {
    const result = await assertEval5([
      { type: 'started', ts: new Date().toISOString(), handle: 'h' },
      {
        type: 'progress',
        ts: new Date().toISOString(),
        handle: 'h',
        message: 'Running byte identity check via diff -ru...',
      },
      { type: 'completed', ts: new Date().toISOString(), handle: 'h', exitCode: 0 },
    ])

    expect(result.passed).toStrictEqual(true)
  })
})
