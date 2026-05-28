import { readFileSync } from 'node:fs'

import { afterEach, describe, expect, it, vi } from 'vitest'

import { callTool, parseResult } from './blueprint-server.test-harness.js'
import {
  ADVANCE_BLUEPRINT,
  installMockSyncAdapter,
  installNullSyncAdapter,
  makePlatformBlueprintHarness,
  makePlatformHarness,
  resetPlatformFirstTestState,
} from './blueprint-server.platform-first.test-harness.js'

describe('wp_blueprint_task_advance — platform-first', () => {
  const tempDirs: string[] = []
  const blueprintSlug = 'advance-test-blueprint'

  afterEach(() => {
    resetPlatformFirstTestState(tempDirs)
    tempDirs.splice(0)
  })

  async function setupWithBlueprint() {
    const harness = await makePlatformBlueprintHarness({
      prefix: 'wp-bs-adv-',
      stateDir: 'in-progress',
      slug: blueprintSlug,
      content: ADVANCE_BLUEPRINT,
    })
    tempDirs.push(harness.tmpDir)
    return harness
  }

  it('calls pushEvent + ensureFresh when platform adapter is available', async () => {
    const { pushEvent, ensureFresh } = installMockSyncAdapter()
    const { overviewPath, tmpDir, tools } = await setupWithBlueprint()

    const result = await callTool(tools, 'wp_blueprint_task_advance', {
      project_id: tmpDir,
      task_id: '1.1',
      to: 'in-progress',
    })
    const data = parseResult<{
      task_id: string
      new_status: string
    }>(result)

    expect(result.isError).toStrictEqual(false)
    expect(data.task_id).toStrictEqual('1.1')
    expect(data.new_status).toStrictEqual('in-progress')

    expect(pushEvent).toHaveBeenCalledOnce()
    const [eventArg] = pushEvent.mock.calls[0] ?? []
    expect(eventArg?.type).toStrictEqual('task.status_changed')
    expect(eventArg?.payload).toMatchObject({
      type: 'task.status_changed',
      taskId: '1.1',
      toStatus: 'in-progress',
    })
    expect(typeof eventArg?.eventId).toStrictEqual('string')
    expect(eventArg?.eventId.length).toBeGreaterThan(0)
    expect(ensureFresh).toHaveBeenCalledOnce()

    expect(readFileSync(overviewPath, 'utf8')).toContain('**Status:** in-progress')
  })

  it('does NOT call pushEvent when WP_BLUEPRINT_PLATFORM_DISABLED=1', async () => {
    vi.stubEnv('WP_BLUEPRINT_PLATFORM_DISABLED', '1')
    const { pushEvent, ensureFresh } = installMockSyncAdapter()
    const { overviewPath, tmpDir, tools } = await setupWithBlueprint()

    const result = await callTool(tools, 'wp_blueprint_task_advance', {
      project_id: tmpDir,
      task_id: '1.1',
      to: 'blocked',
    })
    const data = parseResult<{ new_status: string; failures: string[] }>(result)

    expect(result.isError).toStrictEqual(false)
    expect(data.new_status).toStrictEqual('blocked')
    expect(data.failures).toHaveLength(0)
    expect(pushEvent).not.toHaveBeenCalled()
    expect(ensureFresh).not.toHaveBeenCalled()
    expect(readFileSync(overviewPath, 'utf8')).toContain('**Status:** blocked')
  })

  it('falls back to markdown-canonical path when factory returns null', async () => {
    installNullSyncAdapter()
    const { overviewPath, tmpDir, tools } = await setupWithBlueprint()

    const result = await callTool(tools, 'wp_blueprint_task_advance', {
      project_id: tmpDir,
      task_id: '1.1',
      to: 'blocked',
    })
    const data = parseResult<{ new_status: string; failures: string[] }>(result)

    expect(result.isError).toStrictEqual(false)
    expect(data.new_status).toStrictEqual('blocked')
    expect(data.failures).toHaveLength(0)
    expect(readFileSync(overviewPath, 'utf8')).toContain('**Status:** blocked')
  })

  it('returns error when task_id does not exist in DB', async () => {
    installNullSyncAdapter()
    const harness = await makePlatformHarness('wp-bs-adv-empty-')
    tempDirs.push(harness.tmpDir)

    const result = await callTool(harness.tools, 'wp_blueprint_task_advance', {
      task_id: 'nonexistent.99',
      to: 'done',
    })

    expect(result.isError).toBe(true)
    expect(parseResult<{ failures: string[] }>(result).failures.length).toBeGreaterThan(0)
  })
})
