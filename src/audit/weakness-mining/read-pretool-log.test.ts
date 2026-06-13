import { mkdirSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'

import { readPretoolEvidence } from './read-pretool-log.js'

describe('readPretoolEvidence', () => {
  let root: string

  beforeEach(() => {
    root = join(tmpdir(), `wp-weakness-log-${Date.now()}-${Math.random().toString(36).slice(2)}`)
    mkdirSync(root, { recursive: true })
  })

  afterEach(async () => {
    await import('node:fs/promises').then((fs) => fs.rm(root, { recursive: true, force: true }))
  })

  it('parses pretool log records with source line evidence', () => {
    mkdirSync(join(root, '.agent', 'logs'), { recursive: true })
    writeFileSync(
      join(root, '.agent', 'logs', 'pretool-guard.log'),
      [
        '2026-06-13T10:00:00.000Z PASS Bash target="git status"',
        '2026-06-13T10:00:01.000Z BLOCK Bash target="rm -rf /" failures=[dangerous-command]',
      ].join('\n') + '\n',
    )

    const result = readPretoolEvidence(root)

    expect(result.records).toHaveLength(2)
    expect(result.records[1]).toMatchObject({
      status: 'BLOCK',
      sourceFile: '.agent/logs/pretool-guard.log',
      lineNumber: 2,
    })
  })

  it('stops log discovery at explicit traversal bounds with warnings', () => {
    mkdirSync(join(root, '.omx', 'state', 'a', 'b', 'c'), { recursive: true })
    mkdirSync(join(root, '.omx', 'runtime', 'one', 'two', 'three'), { recursive: true })
    mkdirSync(join(root, 'logs', 'x', 'y', 'z'), { recursive: true })

    const result = readPretoolEvidence(root, { maxDirectories: 1, maxDepth: 1 })

    expect(result.records).toEqual([])
    expect(
      result.warnings.some((warning) => warning.includes('search stopped after 1 directories')),
    ).toBe(true)
  })
})
