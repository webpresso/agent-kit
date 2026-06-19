import { afterEach, describe, expect, it, vi } from 'vitest'

import { callTool, parseResult } from './blueprint-server.test-harness.js'
import {
  FINALIZE_BLUEPRINT,
  FINALIZE_BLUEPRINT_UNVERIFIED,
  installMockSyncAdapter,
  makePlatformBlueprintHarness,
  resetPlatformFirstTestState,
} from './blueprint-server.platform-first.test-harness.js'

const FINALIZE_ZERO_TASK_BLUEPRINT = FINALIZE_BLUEPRINT.replace(
  /\n#### Task 1\.1:[\s\S]*$/u,
  '',
).replace(
  'Blueprint used to test finalize.',
  'Blueprint used to test zero-task finalize rejection.',
)

describe('wp_blueprint_finalize — platform-first', () => {
  const tempDirs: string[] = []
  const finalizeSlug = 'finalize-test-blueprint'

  afterEach(() => {
    resetPlatformFirstTestState(tempDirs)
    tempDirs.splice(0)
  })

  async function setupWithFinalizeBlueprint() {
    const harness = await makePlatformBlueprintHarness({
      prefix: 'wp-bs-fin-',
      stateDir: 'in-progress',
      slug: finalizeSlug,
      content: FINALIZE_BLUEPRINT,
    })
    tempDirs.push(harness.tmpDir)
    return harness
  }

  it('calls pushEvent + ensureFresh when platform adapter is available', async () => {
    const { pushEvent, ensureFresh } = installMockSyncAdapter()
    const { tools } = await setupWithFinalizeBlueprint()

    const result = await callTool(tools, 'wp_blueprint_finalize', { slug: finalizeSlug })
    const data = parseResult<{ summary: string; slug: string; failures: string[] }>(result)

    expect(result.isError).toStrictEqual(false)
    expect(data.slug).toStrictEqual(finalizeSlug)
    expect(data.summary).toMatch(/finalized/i)
    expect(data.failures).toHaveLength(0)

    expect(pushEvent).toHaveBeenCalledOnce()
    const [eventArg] = pushEvent.mock.calls[0] ?? []
    expect(eventArg?.type).toStrictEqual('blueprint.finalized')
    expect(eventArg?.payload).toMatchObject({
      type: 'blueprint.finalized',
      slug: finalizeSlug,
    })
    expect(typeof eventArg?.eventId).toStrictEqual('string')
    expect(eventArg?.eventId.length).toBeGreaterThan(0)
    expect(ensureFresh).toHaveBeenCalledOnce()
  })

  it('does NOT call pushEvent when WP_BLUEPRINT_PLATFORM_DISABLED=1', async () => {
    vi.stubEnv('WP_BLUEPRINT_PLATFORM_DISABLED', '1')
    const { pushEvent, ensureFresh } = installMockSyncAdapter()
    const { tools } = await setupWithFinalizeBlueprint()

    const result = await callTool(tools, 'wp_blueprint_finalize', { slug: finalizeSlug })
    const data = parseResult<{ slug: string; failures: string[] }>(result)

    expect(result.isError).toStrictEqual(false)
    expect(data.slug).toStrictEqual(finalizeSlug)
    expect(data.failures).toHaveLength(0)
    expect(pushEvent).not.toHaveBeenCalled()
    expect(ensureFresh).not.toHaveBeenCalled()
  })

  it('refuses finalize for a zero-task blueprint', async () => {
    const { pushEvent, ensureFresh } = installMockSyncAdapter()
    const harness = await makePlatformBlueprintHarness({
      prefix: 'wp-bs-fin-zero-task-',
      stateDir: 'in-progress',
      slug: 'finalize-zero-task-blueprint',
      content: FINALIZE_ZERO_TASK_BLUEPRINT,
    })
    tempDirs.push(harness.tmpDir)

    const result = await callTool(harness.tools, 'wp_blueprint_finalize', {
      slug: 'finalize-zero-task-blueprint',
    })

    expect(result.isError).toStrictEqual(true)
    expect(result.content[0]?.text).toMatch(/zero-task|0 tasks|no tasks/i)
    expect(pushEvent).not.toHaveBeenCalled()
    expect(ensureFresh).not.toHaveBeenCalled()
  })

  it('refuses finalize when done tasks lack task-local verification', async () => {
    const { pushEvent, ensureFresh } = installMockSyncAdapter()
    const harness = await makePlatformBlueprintHarness({
      prefix: 'wp-bs-fin-unverified-',
      stateDir: 'in-progress',
      slug: 'finalize-unverified-blueprint',
      content: FINALIZE_BLUEPRINT_UNVERIFIED,
    })
    tempDirs.push(harness.tmpDir)

    const result = await callTool(harness.tools, 'wp_blueprint_finalize', {
      slug: 'finalize-unverified-blueprint',
    })

    expect(result.isError).toStrictEqual(true)
    expect(result.content[0]?.text).toMatch(/missing task-local canonical verification evidence/i)
    expect(pushEvent).not.toHaveBeenCalled()
    expect(ensureFresh).not.toHaveBeenCalled()
  })
})
