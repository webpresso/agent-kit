import { mkdirSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'

import { auditWeaknessMining, mineWeaknesses } from './index.js'

describe('weakness mining audit', () => {
  let root: string

  beforeEach(() => {
    root = join(tmpdir(), `wp-weakness-mining-${Date.now()}-${Math.random().toString(36).slice(2)}`)
    mkdirSync(root, { recursive: true })
  })

  afterEach(async () => {
    await import('node:fs/promises').then((fs) => fs.rm(root, { recursive: true, force: true }))
  })

  it('mines repeated blocked hook records', () => {
    mkdirSync(join(root, '.agent', 'logs'), { recursive: true })
    writeFileSync(
      join(root, '.agent', 'logs', 'pretool-guard.log'),
      [
        '2026-06-13T10:00:00.000Z BLOCK Bash target="rm -rf /" failures=[dangerous-command]',
        '2026-06-13T10:00:01.000Z BLOCK Bash target="rm -rf /" failures=[dangerous-command]',
      ].join('\n') + '\n',
    )

    const report = mineWeaknesses(root)

    expect(report.findings).toHaveLength(1)
    expect(report.findings[0]).toMatchObject({
      kind: 'repeated-block',
      surfaceId: 'codex-hooks',
      occurrences: 2,
    })
  })

  it('returns a RepoAuditResult violation for repeated weaknesses', async () => {
    mkdirSync(join(root, '.agent', 'logs'), { recursive: true })
    writeFileSync(
      join(root, '.agent', 'logs', 'pretool-guard.log'),
      [
        '2026-06-13T10:00:00.000Z ERROR Edit target="src/a.ts" error="validator crashed"',
        '2026-06-13T10:00:01.000Z ERROR Edit target="src/a.ts" error="validator crashed"',
      ].join('\n') + '\n',
    )

    const result = await auditWeaknessMining(root)

    expect(result.ok).toBe(false)
    expect(result.violations[0]?.message).toContain('repeated ERROR Edit')
  })

  it('passes with a checked=0 evidence gap when no logs exist', async () => {
    const result = await auditWeaknessMining(root)

    expect(result.ok).toBe(true)
    expect(result.checked).toBe(0)
    expect(result.violations).toEqual([])
  })
})
