import { mkdirSync, mkdtempSync, readFileSync, rmSync, symlinkSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterEach, describe, expect, it } from 'vitest'

import sessionExecuteFileTool from './session-execute-file.js'
import sessionSearchTool from './session-search.js'
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
    gain?: { rawBasisBytes: number; rawBytesBasis: string; gainBytes: number }
    operation: string
    path: string
    preview: string
    counts: { previewBytes: number; warningCount: number; indexedChunkCount: number }
    truncated: boolean
    overflowIndexed: boolean
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
      'file:src/large.txt',
    )
    store.close()
  })

  it('uses actual read Buffer bytes, not full stat size, as file read gain basis', async () => {
    const { root, dbPath } = fixture()
    writeFileSync(join(root, 'src', 'basis.txt'), '1234567890')

    const result = await sessionExecuteFileTool.handler({
      repoRoot: root,
      dbPath,
      path: 'src/basis.txt',
      operation: 'read_text',
      maxFileBytes: 4,
      maxPreviewBytes: 2,
    })
    const data = payload(result)

    expect(data.gain).toMatchObject({ rawBasisBytes: 5, rawBytesBasis: 'file_read_buffer' })
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
    expect(data.gain).toMatchObject({
      rawBasisBytes: Buffer.byteLength('one\ntwo\n', 'utf8'),
      rawBytesBasis: 'file_metadata_buffer',
    })
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

  it('blocks symlink escapes, binary files, missing paths, and directories without indexing', async () => {
    const { root, dbPath } = fixture()
    const outside = mkdtempSync(join(tmpdir(), 'ak-session-execute-file-outside-'))
    dirs.push(outside)
    writeFileSync(join(outside, 'secret.txt'), 'outside secret')
    symlinkSync(join(outside, 'secret.txt'), join(root, 'src', 'escape.txt'))
    writeFileSync(join(root, 'src', 'binary.bin'), Buffer.from([0, 1, 2, 3]))

    const escape = await sessionExecuteFileTool.handler({
      repoRoot: root,
      dbPath,
      path: 'src/escape.txt',
      operation: 'read_text',
    })
    expect(escape.isError).toBe(true)
    expect(payload(escape)).toMatchObject({ passed: false, code: 'denied_path', preview: '' })

    const binary = await sessionExecuteFileTool.handler({
      repoRoot: root,
      dbPath,
      path: 'src/binary.bin',
      operation: 'read_text',
    })
    expect(binary.isError).toBe(true)
    expect(payload(binary)).toMatchObject({ passed: false, code: 'binary_file', preview: '' })

    const missing = await sessionExecuteFileTool.handler({
      repoRoot: root,
      dbPath,
      path: 'src/missing.txt',
      operation: 'read_text',
    })
    expect(missing.isError).toBe(true)
    expect(payload(missing)).toMatchObject({ passed: false, code: 'not_found', preview: '' })

    const directory = await sessionExecuteFileTool.handler({
      repoRoot: root,
      dbPath,
      path: 'src',
      operation: 'read_text',
    })
    expect(directory.isError).toBe(true)
    expect(payload(directory)).toMatchObject({ passed: false, code: 'not_file', preview: '' })

    const store = new SessionMemoryStore(dbPath)
    expect(store.count()).toBe(0)
    store.close()
  })

  it('locks oversized-file preview-only behavior with a warning and overflow indexing', async () => {
    const { root, dbPath } = fixture()
    writeFileSync(join(root, 'src', 'oversized.txt'), `${'prefix '.repeat(20)}oversized-needle`)

    const result = await sessionExecuteFileTool.handler({
      repoRoot: root,
      dbPath,
      path: 'src/oversized.txt',
      operation: 'read_text',
      maxPreviewBytes: 16,
      maxFileBytes: 32,
    })
    const data = payload(result)

    expect(data).toMatchObject({
      passed: true,
      truncated: true,
      overflowIndexed: true,
      warnings: [expect.stringContaining('file exceeds maxFileBytes=32')],
    })
    expect(data.preview.length).toBeLessThanOrEqual(16)
    expect(JSON.stringify(result)).not.toContain('oversized-needle')

    const store = new SessionMemoryStore(dbPath)
    expect(store.search({ query: 'oversized-needle', limit: 1 })[0]?.source).toBe(
      'file:src/oversized.txt',
    )
    store.close()
  })

  it('shares default overflow indexing with wp_session_search without env overrides', async () => {
    const { root } = fixture()
    const previousIndexDb = process.env.WP_SESSION_MEMORY_INDEX_DB
    delete process.env.WP_SESSION_MEMORY_INDEX_DB
    writeFileSync(
      join(root, 'src', 'default-store.txt'),
      `${'default store '.repeat(30)}default-store-needle`,
    )
    try {
      const result = await sessionExecuteFileTool.handler({
        repoRoot: root,
        path: 'src/default-store.txt',
        operation: 'read_text',
        maxPreviewBytes: 32,
      })
      expect(payload(result)).toMatchObject({ passed: true, overflowIndexed: true })

      const search = await sessionSearchTool.handler?.({
        cwd: root,
        query: 'default store',
        source: 'file:src/default-store.txt',
        sourceTypes: ['indexed_chunk'],
        limit: 1,
      })
      expect(JSON.stringify(search.structuredContent)).toContain('file:src/default-store.txt')
    } finally {
      if (previousIndexDb === undefined) delete process.env.WP_SESSION_MEMORY_INDEX_DB
      else process.env.WP_SESSION_MEMORY_INDEX_DB = previousIndexDb
    }
  })

  it('keeps file operation code free of shell, network, and write primitives', () => {
    const source = readFileSync(new URL('./session-execute-file.ts', import.meta.url), 'utf8')
    expect(source).not.toContain('node:child_process')
    expect(source).not.toMatch(/\bspawn\b|\bexec(File|Sync)?\b/u)
    expect(source).not.toMatch(/\bfetch\b/u)
    expect(source).not.toMatch(/writeFile|appendFile|createWriteStream/u)
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
