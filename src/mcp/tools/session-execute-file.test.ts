import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterEach, describe, expect, it } from 'vitest'

import sessionExecuteFileTool from './session-execute-file.js'
import { SessionMemoryStore } from '../../session-memory/store.js'

const dirs: string[] = []

function fixture() {
  const root = mkdtempSync(join(tmpdir(), 'ak-session-execute-file-'))
  dirs.push(root)
  writeFileSync(join(root, 'package.json'), '{"name":"fixture"}')
  mkdirSync(join(root, 'src'))
  return { root, dbPath: join(root, 'memory.sqlite') }
}

function payload(result: Awaited<ReturnType<typeof sessionExecuteFileTool.handler>>) {
  return result.structuredContent as {
    passed: boolean
    summary: string
    operation: string
    path: string
    preview: string
    counts: { previewBytes: number; warningCount: number; indexedChunkCount: number }
    indexedChunkIds: string[]
    warnings: string[]
    code?: string
  }
}

afterEach(() => {
  while (dirs.length > 0) rmSync(dirs.pop()!, { recursive: true, force: true })
})

describe('wp_session_execute_file tool', () => {
  it('exposes a strict bounded descriptor', () => {
    expect(sessionExecuteFileTool.name).toBe('wp_session_execute_file')
    expect(sessionExecuteFileTool.annotations?.destructiveHint).toBe(false)
    expect(sessionExecuteFileTool.annotations?.openWorldHint).toBe(false)
  })

  it('returns bounded previews and indexes overflow without raw large content in the MCP response', async () => {
    const { root, dbPath } = fixture()
    const body = `${'visible prefix '.repeat(20)}needle-file-overflow`
    writeFileSync(join(root, 'src', 'large.txt'), body)

    const result = await sessionExecuteFileTool.handler({
      repoRoot: root,
      dbPath,
      path: 'src/large.txt',
      operation: 'read_text',
      maxPreviewBytes: 80,
    })
    const data = payload(result)

    expect(data.passed).toBe(true)
    expect(data.preview.length).toBeLessThanOrEqual(80)
    expect(data.preview).not.toContain('needle-file-overflow')
    expect(data.indexedChunkIds).toHaveLength(1)
    expect(data.counts.indexedChunkCount).toBe(1)
    expect(JSON.stringify(result)).not.toContain('needle-file-overflow')

    const store = new SessionMemoryStore(dbPath)
    expect(store.search({ query: 'needle-file-overflow', limit: 1 })[0]?.source).toBe(
      'native-runtime:src/large.txt',
    )
    store.close()
  })

  it('supports metadata analysis without shell/network/write capability', async () => {
    const { root, dbPath } = fixture()
    writeFileSync(join(root, 'src', 'file.ts'), 'one\ntwo\n')

    const result = await sessionExecuteFileTool.handler({
      repoRoot: root,
      dbPath,
      path: 'src/file.ts',
      operation: 'metadata',
    })
    const data = payload(result)

    expect(data.passed).toBe(true)
    expect(data.preview).toBe('')
    expect(JSON.stringify(result)).not.toContain('one')
    expect(JSON.stringify(result)).not.toContain('two')
  })

  it('denies secret-bearing paths without preview or indexing', async () => {
    const { root, dbPath } = fixture()
    writeFileSync(join(root, '.env'), 'TOKEN=secret-sentinel')

    const result = await sessionExecuteFileTool.handler({
      repoRoot: root,
      dbPath,
      path: '.env',
      operation: 'read_text',
    })
    const data = payload(result)

    expect(result.isError).toBe(true)
    expect(data).toMatchObject({ passed: false, code: 'secret_path', preview: '' })
    expect(JSON.stringify(result)).not.toContain('secret-sentinel')
    const store = new SessionMemoryStore(dbPath)
    expect(store.count()).toBe(0)
    store.close()
  })

  it('returns structured bounded errors for denied paths and unsupported operations', async () => {
    const { root, dbPath } = fixture()
    const denied = await sessionExecuteFileTool.handler({
      repoRoot: root,
      dbPath,
      path: '../outside.txt',
      operation: 'read_text',
    })
    expect(denied.isError).toBe(true)
    expect(payload(denied)).toMatchObject({ passed: false, code: 'denied_path' })

    const unsupported = await sessionExecuteFileTool.handler({
      repoRoot: root,
      dbPath,
      path: 'src/file.ts',
      operation: 'shell',
    })
    expect(unsupported.isError).toBe(true)
    expect(payload(unsupported)).toMatchObject({
      passed: false,
      code: 'unsupported_operation',
      preview: '',
    })
  })
})
