import { describe, expect, it, vi, beforeEach } from 'vitest'

const loadConfiguredHostAdapter = vi.hoisted(() => vi.fn())
const planGenericE2eRun = vi.hoisted(() => vi.fn())
const planE2eRun = vi.hoisted(() => vi.fn())

vi.mock('./load-host-adapter.js', () => ({
  loadConfiguredHostAdapter,
}))

vi.mock('./run-planner.js', () => ({
  planGenericE2eRun,
  planE2eRun,
}))

import { createE2eExecutionPlan, plannedGroupsToCommandConfigs } from './execution.js'

beforeEach(() => {
  loadConfiguredHostAdapter.mockReset()
  planGenericE2eRun.mockReset()
  planE2eRun.mockReset()
})

describe('e2e execution helpers', () => {
  it('uses the generic planner when no host adapter is configured', async () => {
    const groups = [{ batchKey: 'default', runs: [] }]
    loadConfiguredHostAdapter.mockResolvedValue(null)
    planGenericE2eRun.mockReturnValue(groups)

    const result = await createE2eExecutionPlan({
      suite: 'smoke',
      runner: 'playwright',
      files: ['tests/smoke.spec.ts'],
      headed: true,
    })

    expect(planGenericE2eRun).toHaveBeenCalledWith(
      expect.objectContaining({
        suite: 'smoke',
        runner: 'playwright',
        files: ['tests/smoke.spec.ts'],
        headed: true,
      }),
    )
    expect(result).toBe(groups)
  })

  it('prefers hostAdapter.buildExecutionPlan when available', async () => {
    const groups = [{ batchKey: 'host', runs: [] }]
    const buildExecutionPlan = vi.fn(() => groups)
    loadConfiguredHostAdapter.mockResolvedValue({
      adapter: {
        buildExecutionPlan,
      },
    })

    const result = await createE2eExecutionPlan({
      suite: 'api',
      files: ['apps/e2e/tests/api.spec.ts'],
      reuseReset: true,
    })

    expect(buildExecutionPlan).toHaveBeenCalledWith(
      expect.objectContaining({
        suite: 'api',
        file: ['apps/e2e/tests/api.spec.ts'],
        files: ['apps/e2e/tests/api.spec.ts'],
        reuseReset: true,
      }),
    )
    expect(planE2eRun).not.toHaveBeenCalled()
    expect(result).toBe(groups)
  })

  it('falls through to planE2eRun when host adapter has no custom builder', async () => {
    const adapter = {
      listSuites: vi.fn(),
      resolveSuiteId: vi.fn(),
      normalizeFilePath: vi.fn(),
      resolveSuiteForFile: vi.fn(),
    }
    const groups = [{ batchKey: 'planned', runs: [] }]
    loadConfiguredHostAdapter.mockResolvedValue({ adapter })
    planE2eRun.mockReturnValue(groups)

    const result = await createE2eExecutionPlan({
      suite: 'platform-api',
      files: ['apps/workers/platform-api/e2e/test.spec.ts'],
      workers: '2',
    })

    expect(planE2eRun).toHaveBeenCalledWith(
      expect.objectContaining({
        hostAdapter: adapter,
        suite: 'platform-api',
        file: ['apps/workers/platform-api/e2e/test.spec.ts'],
        workers: '2',
      }),
    )
    expect(result).toBe(groups)
  })

  it('merges group and run env when flattening planned commands', () => {
    const commands = plannedGroupsToCommandConfigs([
      {
        batchKey: 'platform',
        envProfile: 'platform',
        env: {
          DATABASE_URL: 'postgres://suite',
          SHARED: 'group',
        },
        runs: [
          {
            suiteId: 'platform-api',
            batchKey: 'platform',
            envProfile: 'platform',
            runner: 'command',
            logName: 'platform-api',
            command: 'pnpm',
            args: ['exec', 'vitest', 'run'],
            env: {
              SHARED: 'run',
              E2E_SUITE: 'platform-api',
            },
          },
        ],
      },
    ])

    expect(commands).toEqual([
      {
        command: 'pnpm',
        args: ['exec', 'vitest', 'run'],
        env: {
          DATABASE_URL: 'postgres://suite',
          SHARED: 'run',
          E2E_SUITE: 'platform-api',
        },
      },
    ])
  })
})
