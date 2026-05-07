import { describe, expect, it, vi, beforeEach } from 'vitest'

const createE2eExecutionPlan = vi.hoisted(() => vi.fn())
const plannedGroupsToCommandConfigs = vi.hoisted(() => vi.fn())
const runCommandConfigs = vi.hoisted(() => vi.fn())

vi.mock('#e2e', () => ({
  __esModule: true,
}))

vi.mock('../../e2e/execution.js', () => ({
  createE2eExecutionPlan,
  plannedGroupsToCommandConfigs,
  runCommandConfigs,
}))

import akE2eTool from './e2e.js'

function parsePayload(result: { content: ReadonlyArray<{ type: string; text?: string }> }) {
  return JSON.parse((result.content[0] as { text: string }).text) as Record<string, unknown>
}

beforeEach(() => {
  createE2eExecutionPlan.mockReset()
  plannedGroupsToCommandConfigs.mockReset()
  runCommandConfigs.mockReset()
})

describe('ak_e2e tool', () => {
  it('exposes the expected descriptor surface', () => {
    expect(akE2eTool.name).toBe('ak_e2e')
    expect(typeof akE2eTool.description).toBe('string')
    expect(akE2eTool.handler).toBeTypeOf('function')
  })

  it('returns structured execution payload for a generic planned run', async () => {
    const groups = [
      {
        batchKey: 'smoke',
        runs: [
          {
            suiteId: 'smoke',
            batchKey: 'smoke',
            runner: 'playwright',
            logName: 'smoke',
            command: 'pnpm',
            args: ['exec', 'playwright', 'test'],
          },
        ],
      },
    ]
    const commands = [
      {
        command: 'pnpm',
        args: ['exec', 'playwright', 'test'],
        env: { E2E_SUITE: 'smoke' },
      },
    ]
    createE2eExecutionPlan.mockResolvedValue(groups)
    plannedGroupsToCommandConfigs.mockReturnValue(commands)
    runCommandConfigs.mockResolvedValue({ passed: true, exitCode: 0, output: 'ok\n' })

    const result = await akE2eTool.handler({
      suite: 'smoke',
      files: ['tests/smoke.spec.ts'],
      headed: true,
    })

    expect(createE2eExecutionPlan).toHaveBeenCalledWith(
      expect.objectContaining({
        suite: 'smoke',
        files: ['tests/smoke.spec.ts'],
        headed: true,
      }),
      undefined,
    )
    expect(plannedGroupsToCommandConfigs).toHaveBeenCalledWith(groups)
    expect(runCommandConfigs).toHaveBeenCalledWith(commands, { signal: undefined })

    const payload = parsePayload(result)
    expect(result.structuredContent).toEqual(payload)
    expect(payload).toMatchObject({
      passed: true,
      summary: 'e2e passed: 1 suite, 1 command',
      exitCode: 0,
      counts: { suiteCount: 1, commandCount: 1 },
      details: {
        suiteIds: ['smoke'],
        runnerSummary: { playwright: 1 },
      },
      rawOutput: 'ok\n',
    })
    expect((payload.details as { commands: unknown[] }).commands).toEqual(commands)
  })

  it('propagates non-zero execution as passed=false with command metadata intact', async () => {
    const groups = [
      {
        batchKey: 'platform',
        runs: [
          {
            suiteId: 'platform-api',
            batchKey: 'platform',
            runner: 'command',
            logName: 'platform-api',
            command: 'pnpm',
            args: ['run', 'e2e:run'],
          },
        ],
      },
    ]
    const commands = [{ command: 'pnpm', args: ['run', 'e2e:run'] }]
    createE2eExecutionPlan.mockResolvedValue(groups)
    plannedGroupsToCommandConfigs.mockReturnValue(commands)
    runCommandConfigs.mockResolvedValue({ passed: false, exitCode: 1, output: 'boom\n' })

    const result = await akE2eTool.handler({ suite: 'platform-api' })
    const payload = parsePayload(result)
    expect(result.structuredContent).toEqual(payload)

    expect(payload).toMatchObject({
      passed: false,
      summary: 'e2e failed: 1 suite, 1 command (exit 1)',
      exitCode: 1,
      counts: { suiteCount: 1, commandCount: 1 },
      details: {
        suiteIds: ['platform-api'],
        runnerSummary: { command: 1 },
      },
      rawOutput: 'boom\n',
    })
    expect((payload.details as { commands: unknown[] }).commands).toEqual(commands)
  })

  it('clips long E2E output and marks it truncated', async () => {
    const groups = [
      {
        batchKey: 'smoke',
        runs: [
          {
            suiteId: 'smoke',
            batchKey: 'smoke',
            runner: 'playwright',
            logName: 'smoke',
            command: 'pnpm',
            args: ['exec', 'playwright', 'test'],
          },
        ],
      },
    ]
    const commands = [{ command: 'pnpm', args: ['exec', 'playwright', 'test'] }]
    createE2eExecutionPlan.mockResolvedValue(groups)
    plannedGroupsToCommandConfigs.mockReturnValue(commands)
    runCommandConfigs.mockResolvedValue({ passed: false, exitCode: 1, output: 'x'.repeat(5_000) })

    const result = await akE2eTool.handler({ suite: 'smoke' })
    const payload = parsePayload(result)
    expect(result.structuredContent).toEqual(payload)
    expect(payload.rawOutput).toHaveLength(4_000)
    expect(payload.truncated).toBe(true)
    expect(payload.logPath).toMatch(/^logs\//)
  })
})
