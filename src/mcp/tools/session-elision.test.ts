import { mkdtempSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'

import { afterEach, describe, expect, it } from 'vitest'

import { formatMcpToolOutput } from './_shared/full-output.js'
import sessionBatchExecuteTool from './session-batch-execute.js'
import sessionRetrieveTool from './session-retrieve.js'

const roots: string[] = []

function fixture() {
  const root = mkdtempSync(join(tmpdir(), 'ak-session-elision-'))
  roots.push(root)
  writeFileSync(join(root, 'package.json'), '{"name":"fixture"}')
  return root
}

afterEach(() => {
  while (roots.length > 0) rmSync(roots.pop()!, { recursive: true, force: true })
})

describe('session elision producers', () => {
  it('shared MCP check-tool formatting emits retrievable elisions', async () => {
    const root = fixture()
    const raw = `${'x'.repeat(5_000)}check-tool-hidden-needle`
    const compact = formatMcpToolOutput(raw, {
      toolName: 'wp_test',
      cwd: root,
    })

    expect(compact.truncated).toBe(true)
    expect(compact.elisions).toHaveLength(1)

    const retrieved = await sessionRetrieveTool.handler({
      cwd: root,
      id: compact.elisions![0]!.id,
      maxBytes: 6_000,
    })

    expect(JSON.stringify(retrieved.structuredContent)).toContain('check-tool-hidden-needle')
  })

  it('batch command output can emit multiple retrievable elisions', async () => {
    const root = fixture()
    const previousProjectDir = process.env.CLAUDE_PROJECT_DIR
    process.env.CLAUDE_PROJECT_DIR = root
    let result!: Awaited<ReturnType<typeof sessionBatchExecuteTool.handler>>
    try {
      result = await sessionBatchExecuteTool.handler({
        cwd: root,
        execute: true,
        concurrency: 2,
        commands: [
          { label: 'one', command: 'printf batch-one-needle' },
          { label: 'two', command: 'printf batch-two-needle' },
        ],
      })
    } finally {
      if (previousProjectDir === undefined) delete process.env.CLAUDE_PROJECT_DIR
      else process.env.CLAUDE_PROJECT_DIR = previousProjectDir
    }
    const data = result.structuredContent as {
      passed: boolean
      elisions?: Array<{ id: string; kind: string }>
    }

    expect(data.passed).toBe(true)
    expect(data.elisions).toHaveLength(2)

    const retrieved = await Promise.all(
      data.elisions!.map((elision) => sessionRetrieveTool.handler({ cwd: root, id: elision.id })),
    )
    const joined = JSON.stringify(retrieved.map((item) => item.structuredContent))
    expect(joined).toContain('batch-one-needle')
    expect(joined).toContain('batch-two-needle')
  })
})
