import { createHash } from 'node:crypto'
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { dirname, join } from 'node:path'

import { afterEach, describe, expect, it } from 'vitest'

import { SessionMemoryStore } from '#session-memory/store.js'
import sessionRetrieveTool from './session-retrieve.js'
import { defaultIndexDbPath } from './session-restore.js'

const roots: string[] = []
const MISSING_ELISION_ID = 'elision:00000000000000000000000000000000'

function fixture() {
  const root = mkdtempSync(join(tmpdir(), 'ak-session-retrieve-'))
  roots.push(root)
  writeFileSync(join(root, 'package.json'), '{"name":"fixture"}')
  mkdirSync(join(root, 'src'))
  const dbPath = defaultIndexDbPath(root)
  mkdirSync(dirname(dbPath), { recursive: true })
  return { root, dbPath }
}

function idFor(text: string): string {
  return `elision:${createHash('sha256').update(text).digest('hex').slice(0, 32)}`
}

function payload(result: Awaited<ReturnType<typeof sessionRetrieveTool.handler>>) {
  return result.structuredContent as {
    passed: boolean
    id: string
    source?: string
    text: string
    bytes: number
    truncated: boolean
    metadata: Record<string, unknown>
    warnings: string[]
  }
}

afterEach(() => {
  while (roots.length > 0) rmSync(roots.pop()!, { recursive: true, force: true })
})

describe('wp_session_retrieve tool', () => {
  it('retrieves exact chunks by id', async () => {
    const { root, dbPath } = fixture()
    const text = 'retrieve exact needle'
    const store = new SessionMemoryStore(dbPath)
    store.indexChunk({
      id: idFor(text),
      source: 'unit',
      text,
      metadata: { kind: 'truncated_output' },
    })
    store.close()

    const result = await sessionRetrieveTool.handler({ cwd: root, id: idFor(text) })

    expect(payload(result)).toMatchObject({
      passed: true,
      id: idFor(text),
      source: 'unit',
      text,
      bytes: Buffer.byteLength(text),
      truncated: false,
      metadata: { kind: 'truncated_output' },
    })
  })

  it('respects maxBytes with UTF-8 safe truncation', async () => {
    const { root, dbPath } = fixture()
    const text = `😀${'x'.repeat(20)}`
    const store = new SessionMemoryStore(dbPath)
    store.indexChunk({ id: idFor(text), source: 'unit', text })
    store.close()

    const result = await sessionRetrieveTool.handler({ cwd: root, id: idFor(text), maxBytes: 5 })

    expect(payload(result)).toMatchObject({
      passed: true,
      text: '😀x',
      bytes: 5,
      truncated: true,
    })
  })

  it('returns passed=false for missing ids', async () => {
    const { root } = fixture()
    const result = await sessionRetrieveTool.handler({ cwd: root, id: MISSING_ELISION_ID })

    expect(result.isError).toBe(true)
    expect(payload(result)).toMatchObject({
      passed: false,
      text: '',
      warnings: [],
    })
  })

  it('rejects malformed ids without leaking storage details', async () => {
    const { root } = fixture()
    const result = await sessionRetrieveTool.handler({ cwd: root, id: '../index.sqlite' })
    const data = payload(result)

    expect(result.isError).toBe(true)
    expect(data.passed).toBe(false)
    expect(data.warnings).toEqual(['malformed elision retrieval id'])
    expect(JSON.stringify(result)).not.toMatch(/SELECT|\/tmp|\/Users/u)
  })

  it('rejects non-elision chunk ids', async () => {
    const { root, dbPath } = fixture()
    const store = new SessionMemoryStore(dbPath)
    store.indexChunk({ id: 'command:abc123', source: 'unit', text: 'command content' })
    store.close()

    const result = await sessionRetrieveTool.handler({ cwd: root, id: 'command:abc123' })

    expect(result.isError).toBe(true)
    expect(payload(result)).toMatchObject({
      passed: false,
      text: '',
      warnings: ['malformed elision retrieval id'],
    })
  })

  it('does not expose a public database path override', () => {
    expect(sessionRetrieveTool.inputSchema.safeParse({ id: MISSING_ELISION_ID, dbPath: 'x' }).success)
      .toBe(false)
    expect(
      sessionRetrieveTool.inputSchema.safeParse({ id: MISSING_ELISION_ID, indexDbPath: 'x' })
        .success,
    ).toBe(false)
  })
})
