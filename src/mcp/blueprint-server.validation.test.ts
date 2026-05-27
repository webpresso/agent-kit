import { mkdtempSync, mkdirSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import path from 'node:path'

import { afterEach, beforeEach, describe, expect, it } from 'vitest'

import type { ToolHandler, ToolHandlerResult, ToolRegistrar } from './auto-discover.js'
import { registerBlueprintTools } from './blueprint-server.js'

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

const VALID_BLUEPRINT_WITH_LANE = `---
type: blueprint
title: Lane Feature Blueprint
status: draft
complexity: M
owner: alice
created: '2026-01-15'
last_updated: '2026-04-01'
---

## Product wedge anchor

- **Stage outcome:** Phase 1 — ship feature X
- **Consuming surface:** /dashboard route
- **New user-visible capability:** Users can see feature X on the dashboard.

## Summary

A well-formed blueprint using lane-prefixed task headers.

#### [docs] Task 1.1: Do the thing

**Status:** todo
**Wave:** 0

**Acceptance:**
- [ ] The thing is done
`

describe('wp_blueprint_validate lane headers', () => {
  let tmpDir: string
  let tools: Map<string, RegisteredTool>

  beforeEach(async () => {
    tmpDir = mkdtempSync(path.join(tmpdir(), 'ak-bs-validate-'))
    const { registrar, tools: map } = makeRegistrar()
    tools = map
    await registerBlueprintTools(registrar, tmpDir)
  })

  afterEach(() => {
    rmSync(tmpDir, { recursive: true, force: true })
  })

  it('accepts lane-prefixed task headers', async () => {
    const overviewPath = path.join(tmpDir, 'blueprints', 'draft', 'lane-feature', '_overview.md')
    mkdirSync(path.dirname(overviewPath), { recursive: true })
    writeFileSync(overviewPath, VALID_BLUEPRINT_WITH_LANE, 'utf8')

    const result = await callTool(tools, 'wp_blueprint_validate', { path: overviewPath })
    const data = parseResult(result) as { valid: boolean; gaps: string[]; summary: string }

    expect(result.isError).toStrictEqual(false)
    expect(data.valid).toBe(true)
    expect(data.gaps).toStrictEqual([])
    expect(data.summary).toContain('is valid')
  })
})
