import { afterEach, describe, expect, it, vi } from 'vitest'

import { callTool, parseResult } from './blueprint-server.test-harness.js'
import {
  FINALIZE_BLUEPRINT,
  FINALIZE_BLUEPRINT_UNVERIFIED,
  PROMOTE_BLUEPRINT,
  PROMOTE_TO_COMPLETED_BLUEPRINT,
  PROMOTE_TO_COMPLETED_BLUEPRINT_UNVERIFIED,
  installMockSyncAdapter,
  makePlatformBlueprintHarness,
  resetPlatformFirstTestState,
} from './blueprint-server.platform-first.test-harness.js'

describe('wp_blueprint_promote — platform-first', () => {
  const tempDirs: string[] = []
  const promoteSlug = 'promote-test-blueprint'

  afterEach(() => {
    resetPlatformFirstTestState(tempDirs)
    tempDirs.splice(0)
  })

  async function setupWithPromoteBlueprint() {
    const harness = await makePlatformBlueprintHarness({
      prefix: 'wp-bs-prm-',
      stateDir: 'draft',
      slug: promoteSlug,
      content: PROMOTE_BLUEPRINT,
      validate: true,
    })
    tempDirs.push(harness.tmpDir)
    return harness
  }

  it('calls pushEvent + ensureFresh when platform adapter is available', async () => {
    const { pushEvent, ensureFresh } = installMockSyncAdapter()
    const { tools } = await setupWithPromoteBlueprint()

    const result = await callTool(tools, 'wp_blueprint_promote', {
      slug: promoteSlug,
      to_state: 'planned',
    })
    const data = parseResult<{
      slug: string
      from_state: string
      to_state: string
    }>(result)

    expect(result.isError).toStrictEqual(false)
    expect(data.slug).toStrictEqual(promoteSlug)
    expect(data.from_state).toStrictEqual('draft')
    expect(data.to_state).toStrictEqual('planned')

    expect(pushEvent).toHaveBeenCalledOnce()
    const [eventArg] = pushEvent.mock.calls[0] ?? []
    expect(eventArg?.type).toStrictEqual('blueprint.status_changed')
    expect(eventArg?.payload).toMatchObject({
      type: 'blueprint.status_changed',
      slug: promoteSlug,
      fromStatus: 'draft',
      toStatus: 'planned',
    })
    expect(typeof eventArg?.eventId).toStrictEqual('string')
    expect(eventArg?.eventId.length).toBeGreaterThan(0)
    expect(ensureFresh).toHaveBeenCalledOnce()
  })

  it('does NOT call pushEvent when WP_BLUEPRINT_PLATFORM_DISABLED=1', async () => {
    vi.stubEnv('WP_BLUEPRINT_PLATFORM_DISABLED', '1')
    const { pushEvent, ensureFresh } = installMockSyncAdapter()
    const { tools } = await setupWithPromoteBlueprint()

    const result = await callTool(tools, 'wp_blueprint_promote', {
      slug: promoteSlug,
      to_state: 'planned',
    })
    const data = parseResult<{ to_state: string; failures: string[] }>(result)

    expect(result.isError).toStrictEqual(false)
    expect(data.to_state).toStrictEqual('planned')
    expect(data.failures).toHaveLength(0)
    expect(pushEvent).not.toHaveBeenCalled()
    expect(ensureFresh).not.toHaveBeenCalled()
  })

  it('refuses to promote to completed when done tasks lack task-local verification', async () => {
    const { pushEvent, ensureFresh } = installMockSyncAdapter()
    const harness = await makePlatformBlueprintHarness({
      prefix: 'wp-bs-prm-comp-unverified-',
      stateDir: 'in-progress',
      slug: 'promote-completed-unverified-blueprint',
      content: PROMOTE_TO_COMPLETED_BLUEPRINT_UNVERIFIED,
      validate: true,
    })
    tempDirs.push(harness.tmpDir)

    const result = await callTool(harness.tools, 'wp_blueprint_promote', {
      slug: 'promote-completed-unverified-blueprint',
      to_state: 'completed',
    })

    expect(result.isError).toStrictEqual(true)
    expect(result.content[0]?.text).toMatch(/missing task-local canonical verification evidence/i)
    expect(pushEvent).not.toHaveBeenCalled()
    expect(ensureFresh).not.toHaveBeenCalled()
  })

  it('allows promote to completed when all tasks are done and verified', async () => {
    const { pushEvent, ensureFresh } = installMockSyncAdapter()
    const harness = await makePlatformBlueprintHarness({
      prefix: 'wp-bs-prm-comp-verified-',
      stateDir: 'in-progress',
      slug: 'promote-completed-verified-blueprint',
      content: PROMOTE_TO_COMPLETED_BLUEPRINT,
      validate: true,
    })
    tempDirs.push(harness.tmpDir)

    const result = await callTool(harness.tools, 'wp_blueprint_promote', {
      slug: 'promote-completed-verified-blueprint',
      to_state: 'completed',
    })
    const data = parseResult<{ slug: string; to_state: string; failures: string[] }>(result)

    expect(result.isError).toStrictEqual(false)
    expect(data.slug).toStrictEqual('promote-completed-verified-blueprint')
    expect(data.to_state).toStrictEqual('completed')
    expect(data.failures).toHaveLength(0)
    expect(pushEvent).toHaveBeenCalledOnce()
    expect(ensureFresh).toHaveBeenCalledOnce()
  })
})

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
    const data = parseResult<{
      summary: string
      slug: string
      failures: string[]
    }>(result)

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
