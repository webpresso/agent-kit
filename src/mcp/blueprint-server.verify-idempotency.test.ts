import { readFileSync, writeFileSync } from 'node:fs'

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { z } from 'zod'

import { applyVerification } from '#verification.js'

import { _setSyncAdapterFactory } from './blueprint-server.js'
import {
  callTool,
  cleanupTempDir,
  makeLazyBlueprintHarness,
  makeProjectionBackedBlueprintHarness,
  parseResult,
  type ToolMap,
} from './blueprint-server.test-harness.js'

const VERIFY_SLUG = 'verify-test-blueprint'
const VERIFY_BLUEPRINT = `---
type: blueprint
title: Verify Test Blueprint
status: in-progress
complexity: S
owner: tester
created: '2026-01-01'
last_updated: '2026-05-01'
---

## Product wedge anchor

- **Stage outcome:** Phase 1 — ship verify feature
- **Consuming surface:** /verify route
- **New user-visible capability:** Users can verify tasks with evidence.

## Summary

Blueprint used to test task verification.

#### Task 1.1: The verify task

**Status:** todo
**Wave:** 0
**Files:**
- src/foo.ts

**Acceptance:**
- [ ] The task is verified
`

let tmpDir: string
let tools: ToolMap
const tempDirs: string[] = []

beforeEach(async () => {
  ;({ tmpDir, tools } = await makeLazyBlueprintHarness('ak-bs-verify-empty-'))
})

afterEach(() => {
  _setSyncAdapterFactory(null)
  vi.unstubAllEnvs()
  cleanupTempDir(tmpDir)
  while (tempDirs.length > 0) cleanupTempDir(tempDirs.pop())
})

async function setupWithVerifyBlueprint(): Promise<{
  overviewPath: string
  localTmpDir: string
  localTools: ToolMap
}> {
  const harness = await makeProjectionBackedBlueprintHarness('ak-bs-ver-', [
    { stateDir: 'in-progress', slug: VERIFY_SLUG, content: VERIFY_BLUEPRINT },
  ])
  tempDirs.push(harness.tmpDir)
  return {
    overviewPath: harness.overviewPaths[0]!,
    localTmpDir: harness.tmpDir,
    localTools: harness.tools,
  }
}

describe('wp_blueprint_task_advance — refuses to:done (Task 3.2)', () => {
  it('returns error with next_action verify_task when to is done', async () => {
    _setSyncAdapterFactory(() => null)

    const result = await callTool(tools, 'wp_blueprint_task_advance', {
      project_id: tmpDir,
      task_id: '1.1',
      to: 'done',
    })

    expect(result.isError).toBe(true)
    const data = parseResult<{
      failures: string[]
      next_action: { kind: string; hint: string }
    }>(result)
    expect(data.failures.length).toBeGreaterThan(0)
    expect(data.failures[0]).toMatch(/wp_blueprint_task_verify/i)
    expect(data.next_action.kind).toBe('verify_task')
  })

  it('still allows other valid transitions like in-progress', async () => {
    _setSyncAdapterFactory(() => null)

    const result = await callTool(tools, 'wp_blueprint_task_advance', {
      project_id: tmpDir,
      task_id: 'nonexistent.99',
      to: 'in-progress',
    })

    expect(result.isError).toBe(true)
    const data = parseResult<{ failures: string[] }>(result)
    expect(data.failures[0]).toMatch(/not found/i)
  })
})

describe('wp_blueprint_task_verify — Task 3.2', () => {
  it('tool is registered', async () => {
    expect(tools.has('wp_blueprint_task_verify')).toBe(true)
  })

  it('input schema rejects inputs containing scope field at the zod level', () => {
    const VerifyInputSchema = z.object({
      project_id: z.string(),
      slug: z.string(),
      task_id: z.string(),
      evidence: z.array(z.unknown()).min(1),
    })
    const parsed = VerifyInputSchema.safeParse({
      project_id: 'test',
      slug: 'my-slug',
      task_id: '1.1',
      evidence: [
        {
          kind: 'test',
          result: 'pass',
          ts: '2026-01-01T00:00:00Z',
          command: 'vp run test',
          exit_code: 0,
        },
      ],
      scope: 'all',
    })
    expect(parsed.success).toBe(true)
    if (parsed.success) {
      expect('scope' in parsed.data).toBe(false)
    }
  })

  it('returns validation error for missing required fields', async () => {
    const result = await callTool(tools, 'wp_blueprint_task_verify', {
      project_id: tmpDir,
    })
    expect(result.isError).toBe(true)
  })

  it('fails when evidence has zero pass items (all fail items)', async () => {
    const { localTmpDir, localTools } = await setupWithVerifyBlueprint()

    const result = await callTool(localTools, 'wp_blueprint_task_verify', {
      project_id: localTmpDir,
      slug: VERIFY_SLUG,
      task_id: '1.1',
      evidence: [
        {
          kind: 'test',
          result: 'fail',
          ts: '2026-01-01T00:00:00Z',
          command: 'vp run test',
          exit_code: 1,
        },
      ],
    })

    expect(result.isError).toBe(true)
    const data = parseResult<{ failures: string[] }>(result)
    expect(data.failures.length).toBeGreaterThan(0)
  })

  it('succeeds and writes markdown + re-ingests when valid evidence provided', async () => {
    _setSyncAdapterFactory(() => null)
    const { overviewPath, localTmpDir, localTools } = await setupWithVerifyBlueprint()

    const result = await callTool(localTools, 'wp_blueprint_task_verify', {
      project_id: localTmpDir,
      slug: VERIFY_SLUG,
      task_id: '1.1',
      evidence: [
        {
          kind: 'test',
          result: 'pass',
          ts: '2026-01-01T00:00:00Z',
          command: 'vp run test',
          exit_code: 0,
        },
      ],
    })

    expect(result.isError).toStrictEqual(false)
    const data = parseResult<{
      status: string
      next_summary: string
      next_task: { task_id: string } | null
      failures: string[]
    }>(result)
    expect(data.status).toBe('done')
    expect(typeof data.next_summary).toBe('string')
    expect(data.failures).toStrictEqual([])

    const md = readFileSync(overviewPath, 'utf8')
    expect(md).toContain('**Status:** done')
    expect(md).toContain('**Verification:**')
    expect(md).toContain('webpresso-evidence-v1')
    expect(md).toContain('- [x] The task is verified')
  })

  it('is idempotent: second call with same canonical evidence returns idempotent: true', async () => {
    _setSyncAdapterFactory(() => null)
    const { overviewPath, localTmpDir, localTools } = await setupWithVerifyBlueprint()

    const evidence = [
      {
        kind: 'test',
        result: 'pass',
        ts: '2026-01-01T00:00:00Z',
        command: 'vp run test',
        exit_code: 0,
      },
    ]

    const seeded = applyVerification(readFileSync(overviewPath, 'utf8'), '1.1', evidence)
    if (!seeded.ok) {
      throw new Error(`Expected verification seeding to succeed: ${seeded.failures.join('; ')}`)
    }
    writeFileSync(overviewPath, seeded.markdown, 'utf8')

    const second = await callTool(localTools, 'wp_blueprint_task_verify', {
      project_id: localTmpDir,
      slug: VERIFY_SLUG,
      task_id: '1.1',
      evidence,
    })
    expect(second.isError).toStrictEqual(false)
    const data = parseResult<{
      status: string
      idempotent?: boolean
      next_summary: string
    }>(second)
    expect(data.status).toBe('done')
    expect(data.idempotent).toBe(true)
    expect(typeof data.next_summary).toBe('string')
  })
})
