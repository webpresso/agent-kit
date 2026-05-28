import { mkdtempSync, mkdirSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import path from 'node:path'

import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest'

import type { ToolHandler, ToolHandlerResult, ToolRegistrar } from './auto-discover.js'
import { _setSyncAdapterFactory, registerBlueprintTools } from './blueprint-server.js'
import type { SyncAdapter } from './blueprint-server.js'
import { FINALIZE_BLUEPRINT } from './blueprint-server.platform-first.test-harness.js'
import {
  markBlueprintValidated,
} from './blueprint-server.test-harness.js'

type RegisteredTool = { name: string; handler: ToolHandler }

function makeRegistrar(): { registrar: ToolRegistrar; tools: Map<string, RegisteredTool> } {
  const tools = new Map<string, RegisteredTool>()
  const registrar: ToolRegistrar = {
    registerTool(name, _desc, _schema, _outSchema, handler) {
      tools.set(name, { name, handler })
    },
  }
  return { registrar, tools }
}

async function callTool(
  tools: Map<string, { name: string; handler: ToolHandler }>,
  name: string,
  input: unknown,
): Promise<ToolHandlerResult> {
  const tool = tools.get(name)
  if (!tool) throw new Error(`Tool "${name}" not registered`)
  return tool.handler(input)
}

function parseResult(result: ToolHandlerResult): unknown {
  const text = result.content[0]
  if (!text || text.type !== 'text' || typeof text.text !== 'string') {
    throw new Error('Expected text content block')
  }
  return JSON.parse(text.text)
}

const PROMOTE_SLUG = 'promote-timeout-blueprint'
const PROMOTE_BLUEPRINT = `---
type: blueprint
title: Promote Timeout Blueprint
status: draft
complexity: M
owner: alice
created: '2026-01-15'
last_updated: '2026-04-01'
---

## Product wedge anchor

- **Stage outcome:** Phase 1 — promote this blueprint
- **Consuming surface:** /blueprints/promote
- **New user-visible capability:** Maintainers can promote the blueprint.

## Summary

Blueprint fixture for promote timeout coverage.

#### Task 1.1: Promote safely

**Status:** todo
**Wave:** 0

**Acceptance:**
- [ ] Promote succeeds
`

const FINALIZE_SLUG = 'finalize-timeout-blueprint'
async function makeTools(
  prefix: string,
  blueprint: { stateDir: string; slug: string; content: string } | null,
): Promise<{ tmpDir: string; tools: Map<string, RegisteredTool> }> {
  const tmpDir = mkdtempSync(path.join(tmpdir(), prefix))
  mkdirSync(path.join(tmpDir, '.agent'), { recursive: true })
  writeFileSync(path.join(tmpDir, 'package.json'), JSON.stringify({ name: 'test' }), 'utf8')
  if (blueprint) {
    const overviewPath = path.join(
      tmpDir,
      'blueprints',
      blueprint.stateDir,
      blueprint.slug,
      '_overview.md',
    )
    mkdirSync(path.dirname(overviewPath), { recursive: true })
    writeFileSync(overviewPath, blueprint.content, 'utf8')
  }
  const { registrar, tools } = makeRegistrar()
  await registerBlueprintTools(registrar, tmpDir)
  return { tmpDir, tools }
}

describe('wp_blueprint platform timeout guards', () => {
  const tmpDirs: string[] = []
  let promoteTools: Map<string, RegisteredTool>
  let newTools: Map<string, RegisteredTool>
  let finalizeTools: Map<string, RegisteredTool>

  beforeAll(async () => {
    const promoteHarness = await makeTools('wp-bs-promote-timeout-', {
      stateDir: 'draft',
      slug: PROMOTE_SLUG,
      content: PROMOTE_BLUEPRINT,
    })
    tmpDirs.push(promoteHarness.tmpDir)
    promoteTools = promoteHarness.tools
    const overviewPath = path.join(
      promoteHarness.tmpDir,
      'blueprints',
      'draft',
      PROMOTE_SLUG,
      '_overview.md',
    )
    await callTool(promoteTools, 'wp_blueprint_validate', { path: overviewPath })
    markBlueprintValidated(promoteHarness.tmpDir, PROMOTE_SLUG)

    const newHarness = await makeTools('wp-bs-new-timeout-', null)
    tmpDirs.push(newHarness.tmpDir)
    newTools = newHarness.tools

    const finalizeHarness = await makeTools('wp-bs-finalize-timeout-', {
      stateDir: 'in-progress',
      slug: FINALIZE_SLUG,
      content: FINALIZE_BLUEPRINT,
    })
    tmpDirs.push(finalizeHarness.tmpDir)
    finalizeTools = finalizeHarness.tools
  })

  beforeEach(() => {
    vi.stubEnv('WP_BLUEPRINT_PLATFORM_MUTATION_TIMEOUT_MS', '1')
  })

  afterEach(() => {
    _setSyncAdapterFactory(null)
    vi.unstubAllEnvs()
  })

  afterAll(() => {
    while (tmpDirs.length > 0) rmSync(tmpDirs.pop()!, { recursive: true, force: true })
  })

  it('fails fast when ensureFresh times out during promote', async () => {
    const pushEvent = vi.fn<SyncAdapter['pushEvent']>().mockResolvedValue(undefined)
    const ensureFresh = vi
      .fn<SyncAdapter['ensureFresh']>()
      .mockImplementation(() => new Promise<void>(() => {}))
    _setSyncAdapterFactory(() => ({ pushEvent, ensureFresh }))

    const result = await callTool(promoteTools, 'wp_blueprint_promote', {
      slug: PROMOTE_SLUG,
      to_state: 'planned',
    })
    const data = parseResult(result) as { failures: string[] }

    expect(result.isError).toStrictEqual(true)
    expect(data.failures).toEqual(
      expect.arrayContaining([
        expect.stringContaining(
          'wp_blueprint_promote platform sync failed: wp_blueprint_promote ensureFresh timed out',
        ),
      ]),
    )
    expect(pushEvent).toHaveBeenCalledOnce()
    expect(ensureFresh).toHaveBeenCalledOnce()
  })

  it('fails fast when pushEvent times out during new', async () => {
    const pushEvent = vi
      .fn<SyncAdapter['pushEvent']>()
      .mockImplementation(() => new Promise<void>(() => {}))
    const ensureFresh = vi.fn<SyncAdapter['ensureFresh']>().mockResolvedValue(undefined)
    _setSyncAdapterFactory(() => ({ pushEvent, ensureFresh }))

    const result = await callTool(newTools, 'wp_blueprint_new', {
      title: 'Timed Out New Feature',
      goal_prompt: 'Trigger a fast pushEvent timeout.',
    })
    const data = parseResult(result) as { failures: string[] }

    expect(result.isError).toStrictEqual(true)
    expect(data.failures).toEqual(
      expect.arrayContaining([
        expect.stringContaining(
          'wp_blueprint_new platform sync failed: wp_blueprint_new pushEvent timed out',
        ),
      ]),
    )
    expect(pushEvent).toHaveBeenCalledOnce()
    expect(ensureFresh).not.toHaveBeenCalled()
  })

  it('fails fast when ensureFresh times out during finalize', async () => {
    const pushEvent = vi.fn<SyncAdapter['pushEvent']>().mockResolvedValue(undefined)
    const ensureFresh = vi
      .fn<SyncAdapter['ensureFresh']>()
      .mockImplementation(() => new Promise<void>(() => {}))
    _setSyncAdapterFactory(() => ({ pushEvent, ensureFresh }))

    const result = await callTool(finalizeTools, 'wp_blueprint_finalize', { slug: FINALIZE_SLUG })
    const data = parseResult(result) as { failures: string[] }

    expect(result.isError).toStrictEqual(true)
    expect(data.failures).toEqual(
      expect.arrayContaining([
        expect.stringContaining(
          'wp_blueprint_finalize platform sync failed: wp_blueprint_finalize ensureFresh timed out',
        ),
      ]),
    )
    expect(pushEvent).toHaveBeenCalledOnce()
    expect(ensureFresh).toHaveBeenCalledOnce()
  })
})
