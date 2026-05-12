import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { describe, expect, it, vi } from 'vitest'

import type { RunnerContext, RunnerEvent, RunnerTask } from '../types.js'
import { ClaudeSubagentRunner } from './index.js'
import type { SubagentFn } from './types.js'

// ---------------------------------------------------------------------------
// Fixture types
// ---------------------------------------------------------------------------

interface ExpectedEvent {
  readonly type: string
  readonly line?: string
  readonly exitCode?: number
  readonly error?: string
}

interface GoldenTranscriptFixture {
  readonly meta: {
    readonly blueprintFixture: string
    readonly capturedAt: string
    readonly note: string
  }
  readonly subagentOutput: string
  readonly expectedEvents: readonly ExpectedEvent[]
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function loadFixture(): GoldenTranscriptFixture {
  const fixturePath = join(import.meta.dirname, '__fixtures__/golden-transcript-hello.json')
  const raw = readFileSync(fixturePath, 'utf-8')
  return JSON.parse(raw) as GoldenTranscriptFixture
}

type NormalizedEvent = Omit<RunnerEvent, 'ts' | 'handle'>

function normalize(events: readonly RunnerEvent[]): NormalizedEvent[] {
  return events.map(({ ts: _ts, handle: _handle, ...rest }) => rest)
}

async function collectEvents(execution: ReturnType<ClaudeSubagentRunner['prepare']>): Promise<RunnerEvent[]> {
  const events: RunnerEvent[] = []
  for await (const event of execution.run()) {
    events.push(event)
  }
  return events
}

// ---------------------------------------------------------------------------
// Golden transcript iron-rule regression test
// ---------------------------------------------------------------------------

describe('ClaudeSubagentRunner — golden transcript regression', () => {
  const fixture = loadFixture()

  const TASK: RunnerTask = {
    id: 'golden-hello',
    description: readFileSync(
      join(import.meta.dirname, '__fixtures__/golden-transcript-hello-blueprint.md'),
      'utf-8',
    ),
    permissions: 'workspace-write',
  }

  const CTX: RunnerContext = {
    cwd: '/tmp/golden-test-workspace',
  }

  it('mocked subagentFn is called — never hits real claude invocation', async () => {
    const mockSubagentFn: SubagentFn = vi.fn().mockResolvedValue(fixture.subagentOutput)
    const runner = new ClaudeSubagentRunner('test', mockSubagentFn)
    const execution = runner.prepare(TASK, CTX)
    await collectEvents(execution)

    expect(mockSubagentFn).toHaveBeenCalledOnce()
  })

  it('mocked subagentFn receives task description and context options', async () => {
    const mockSubagentFn: SubagentFn = vi.fn().mockResolvedValue(fixture.subagentOutput)
    const runner = new ClaudeSubagentRunner('test', mockSubagentFn)
    const execution = runner.prepare(TASK, CTX)
    await collectEvents(execution)

    expect(mockSubagentFn).toHaveBeenCalledWith(TASK.description, {
      cwd: CTX.cwd,
      env: CTX.env,
      signal: undefined,
    })
  })

  it('event stream order: started → at least one content event → completed', async () => {
    const mockSubagentFn: SubagentFn = vi.fn().mockResolvedValue(fixture.subagentOutput)
    const runner = new ClaudeSubagentRunner('test', mockSubagentFn)
    const execution = runner.prepare(TASK, CTX)
    const events = await collectEvents(execution)

    expect(events.length).toBeGreaterThanOrEqual(3)
    expect(events[0]?.type).toStrictEqual('started')
    expect(events.at(-1)?.type).toStrictEqual('completed')

    const middleEvents = events.slice(1, -1)
    expect(middleEvents.length).toBeGreaterThanOrEqual(1)
    const contentTypes = new Set(['stdout', 'stderr', 'progress', 'artifact'])
    for (const event of middleEvents) {
      expect(contentTypes.has(event.type)).toBe(true)
    }
  })

  it('event count matches expected fixture event count', async () => {
    const mockSubagentFn: SubagentFn = vi.fn().mockResolvedValue(fixture.subagentOutput)
    const runner = new ClaudeSubagentRunner('test', mockSubagentFn)
    const execution = runner.prepare(TASK, CTX)
    const events = await collectEvents(execution)

    expect(events.length).toStrictEqual(fixture.expectedEvents.length)
  })

  it('each event matches its expected fixture counterpart (ignoring ts and handle)', async () => {
    const mockSubagentFn: SubagentFn = vi.fn().mockResolvedValue(fixture.subagentOutput)
    const runner = new ClaudeSubagentRunner('test', mockSubagentFn)
    const execution = runner.prepare(TASK, CTX)
    const events = await collectEvents(execution)
    const normalized = normalize(events)

    for (let i = 0; i < fixture.expectedEvents.length; i++) {
      expect(normalized[i]).toStrictEqual(fixture.expectedEvents[i])
    }
  })

  it('handle is consistent across all events in a single run', async () => {
    const mockSubagentFn: SubagentFn = vi.fn().mockResolvedValue(fixture.subagentOutput)
    const runner = new ClaudeSubagentRunner('test', mockSubagentFn)
    const execution = runner.prepare(TASK, CTX)
    const events = await collectEvents(execution)

    const { handle } = execution
    for (const event of events) {
      expect(event.handle).toStrictEqual(handle)
    }
  })

  it('timestamps are ISO strings and are stripped by normalize()', async () => {
    const mockSubagentFn: SubagentFn = vi.fn().mockResolvedValue(fixture.subagentOutput)
    const runner = new ClaudeSubagentRunner('test', mockSubagentFn)
    const execution = runner.prepare(TASK, CTX)
    const events = await collectEvents(execution)

    for (const event of events) {
      expect(event.ts).toMatch(/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}/)
    }

    const normalized = normalize(events)
    for (const event of normalized) {
      expect(Object.prototype.hasOwnProperty.call(event, 'ts')).toBe(false)
      expect(Object.prototype.hasOwnProperty.call(event, 'handle')).toBe(false)
    }
  })

  it('snapshot reflects the same events as the iterated stream', async () => {
    const mockSubagentFn: SubagentFn = vi.fn().mockResolvedValue(fixture.subagentOutput)
    const runner = new ClaudeSubagentRunner('test', mockSubagentFn)
    const execution = runner.prepare(TASK, CTX)
    const events = await collectEvents(execution)

    const snap = execution.snapshot()
    expect(snap.events).toStrictEqual(events)
    expect(snap.status).toStrictEqual('completed')
    expect(snap.handle).toStrictEqual(execution.handle)
  })
})
