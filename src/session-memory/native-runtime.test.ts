import { mkdirSync, mkdtempSync, readFileSync, rmSync, symlinkSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterEach, describe, expect, it } from 'vitest'

import { runNativeFileOperation } from './native-runtime.js'
import { SessionMemoryStore } from './store.js'

const dirs: string[] = []

function repo(): { root: string; store: SessionMemoryStore } {
  const root = mkdtempSync(join(tmpdir(), 'ak-native-runtime-'))
  dirs.push(root)
  writeFileSync(join(root, 'package.json'), '{"name":"fixture"}')
  mkdirSync(join(root, 'src'))
  return { root, store: new SessionMemoryStore(join(root, 'memory.sqlite')) }
}

afterEach(() => {
  while (dirs.length > 0) rmSync(dirs.pop()!, { recursive: true, force: true })
})

describe('runNativeFileOperation', () => {
  it('read_text returns a bounded preview and indexes overflow into session memory', async () => {
    const { root, store } = repo()
    const body = `${'alpha beta '.repeat(200)}needle-overflow`
    writeFileSync(join(root, 'src', 'large.txt'), body)

    const result = await runNativeFileOperation({
      repoRoot: root,
      path: 'src/large.txt',
      operation: 'read_text',
      store,
      maxPreviewBytes: 64,
    })

    expect(result.passed).toBe(true)
    expect(result.operation).toBe('read_text')
    expect(result.path).toBe('src/large.txt')
    expect(result.preview.length).toBeLessThanOrEqual(64)
    expect(result.preview).not.toContain('needle-overflow')
    expect(result.truncated).toBe(true)
    expect(result.overflowIndexed).toBe(true)
    expect(result.indexedChunkIds).toHaveLength(1)
    expect(store.search({ query: 'needle-overflow', limit: 1 })[0]?.source).toBe(
      'native-runtime:src/large.txt',
    )
    store.close()
  })

  it('metadata derives bounded file facts without returning file content', async () => {
    const { root, store } = repo()
    writeFileSync(join(root, 'src', 'meta.ts'), 'one\n\ntwo\n')

    const result = await runNativeFileOperation({
      repoRoot: root,
      path: 'src/meta.ts',
      operation: 'metadata',
      store,
    })

    expect(result.passed).toBe(true)
    expect(result.preview).toBe('')
    expect(result.metadata).toMatchObject({ sizeBytes: 9, lineCount: 3, extension: '.ts' })
    expect(store.count()).toBe(0)
    store.close()
  })

  it('blocks traversal and non-repo paths before reading', async () => {
    const { root, store } = repo()
    writeFileSync(join(root, 'src', 'ok.txt'), 'ok')

    await expect(
      runNativeFileOperation({
        repoRoot: root,
        path: '../secret.txt',
        operation: 'read_text',
        store,
      }),
    ).resolves.toMatchObject({ passed: false, code: 'denied_path' })
    await expect(
      runNativeFileOperation({
        repoRoot: root,
        path: join(root, 'src/ok.txt'),
        operation: 'read_text',
        store,
      }),
    ).resolves.toMatchObject({ passed: false, code: 'denied_path' })
    expect(store.count()).toBe(0)
    store.close()
  })

  it('blocks non-repo roots and symlink escapes', async () => {
    const { root, store } = repo()
    const outside = mkdtempSync(join(tmpdir(), 'ak-native-outside-'))
    dirs.push(outside)
    writeFileSync(join(outside, 'secret.txt'), 'outside secret')
    symlinkSync(join(outside, 'secret.txt'), join(root, 'src', 'escape.txt'))
    const bareRoot = mkdtempSync(join(tmpdir(), 'ak-native-bare-'))
    dirs.push(bareRoot)
    writeFileSync(join(bareRoot, 'file.txt'), 'bare')

    await expect(
      runNativeFileOperation({
        repoRoot: bareRoot,
        path: 'file.txt',
        operation: 'read_text',
        store,
      }),
    ).resolves.toMatchObject({ passed: false, code: 'denied_path' })
    await expect(
      runNativeFileOperation({
        repoRoot: root,
        path: 'src/escape.txt',
        operation: 'read_text',
        store,
      }),
    ).resolves.toMatchObject({ passed: false, code: 'denied_path' })
    expect(store.count()).toBe(0)
    store.close()
  })

  it('rejects binary and oversized files with bounded warnings', async () => {
    const { root, store } = repo()
    writeFileSync(join(root, 'src', 'binary.bin'), Buffer.from([0, 1, 2, 3]))
    writeFileSync(join(root, 'src', 'too-large.txt'), 'x'.repeat(32))

    await expect(
      runNativeFileOperation({
        repoRoot: root,
        path: 'src/binary.bin',
        operation: 'read_text',
        store,
      }),
    ).resolves.toMatchObject({ passed: false, code: 'binary_file' })
    await expect(
      runNativeFileOperation({
        repoRoot: root,
        path: 'src/too-large.txt',
        operation: 'read_text',
        store,
        maxFileBytes: 8,
      }),
    ).resolves.toMatchObject({ passed: false, code: 'file_too_large' })
    expect(store.count()).toBe(0)
    store.close()
  })

  it('blocks secret-bearing paths before previewing or indexing', async () => {
    const { root, store } = repo()
    writeFileSync(join(root, '.env'), 'TOKEN=secret')
    writeFileSync(join(root, 'src', 'deploy.pem'), 'private key')
    mkdirSync(join(root, '.ssh'))
    writeFileSync(join(root, '.ssh', 'config'), 'host secret')

    for (const path of ['.env', 'src/deploy.pem', '.ssh/config']) {
      await expect(
        runNativeFileOperation({ repoRoot: root, path, operation: 'read_text', store }),
      ).resolves.toMatchObject({
        passed: false,
        code: 'secret_path',
        preview: '',
        indexedChunkIds: [],
      })
    }
    expect(store.count()).toBe(0)
    store.close()
  })

  it('returns a bounded unsupported_operation result without shelling out', async () => {
    const { root, store } = repo()
    writeFileSync(join(root, 'src', 'ok.txt'), 'ok')

    await expect(
      runNativeFileOperation({ repoRoot: root, path: 'src/ok.txt', operation: 'shell', store }),
    ).resolves.toMatchObject({ passed: false, code: 'unsupported_operation', preview: '' })
    expect(store.count()).toBe(0)
    store.close()
  })

  it('keeps file-operation runtime free of shell, network, or write primitives', () => {
    const source = readFileSync(new URL('./native-runtime.ts', import.meta.url), 'utf8')
    const fileOperationSource = source.slice(
      source.indexOf('export interface NativeFileOperationOptions'),
      source.indexOf('export interface NativeSearchHit'),
    )
    expect(fileOperationSource).not.toContain('node:child_process')
    expect(fileOperationSource).not.toMatch(/spawn|exec(File|Sync)?/u)
    expect(fileOperationSource).not.toMatch(/fetch/u)
    expect(fileOperationSource).not.toMatch(/writeFile|appendFile|createWriteStream/u)
  })

  it('surfaces unsupported platforms without reading or indexing', async () => {
    const { root, store } = repo()
    writeFileSync(join(root, 'src', 'ok.txt'), 'ok')

    const result = await runNativeFileOperation({
      repoRoot: root,
      path: 'src/ok.txt',
      operation: 'read_text',
      store,
      platform: 'unsupported-os',
    })

    expect(result).toMatchObject({ passed: false, code: 'unsupported_platform' })
    expect(store.count()).toBe(0)
    store.close()
  })
})
