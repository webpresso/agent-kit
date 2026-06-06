import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { pathToFileURL } from 'node:url'

import { afterEach, describe, expect, it } from 'vitest'

import { resolveCatalogDir } from './index.js'

function makePackageRoot(): string {
  const root = mkdtempSync(join(tmpdir(), 'wp-resolve-catalog-'))
  mkdirSync(join(root, 'catalog'), { recursive: true })
  mkdirSync(join(root, 'bin'), { recursive: true })
  mkdirSync(join(root, 'src', 'cli', 'commands', 'init'), { recursive: true })
  writeFileSync(join(root, 'package.json'), JSON.stringify({ name: '@webpresso/agent-kit' }))
  writeFileSync(join(root, 'bin', 'wp'), '')
  writeFileSync(join(root, 'src', 'cli', 'commands', 'init', 'index.ts'), '')
  return root
}

describe('resolveCatalogDir', () => {
  const cleanup = new Set<string>()

  afterEach(() => {
    for (const root of cleanup) rmSync(root, { recursive: true, force: true })
    cleanup.clear()
  })

  it('resolves the bundled catalog from the PATH launcher when moduleUrl is virtual', () => {
    const root = makePackageRoot()
    cleanup.add(root)

    const resolved = resolveCatalogDir({
      moduleUrl: 'file:///__bunfs__/root/wp',
      execPath: '/usr/bin/node',
      argv0: 'wp',
      argv1: 'setup',
      pathEnv: join(root, 'bin'),
    })

    expect(resolved).toBe(join(root, 'catalog'))
  })

  it('resolves the bundled catalog from a Windows PATH shim when moduleUrl is virtual', () => {
    const root = makePackageRoot()
    cleanup.add(root)
    writeFileSync(join(root, 'bin', 'wp.cmd'), '@echo off\n')

    const resolved = resolveCatalogDir({
      moduleUrl: 'file:///__bunfs__/root/wp',
      execPath: 'C:\\Program Files\\nodejs\\node.exe',
      argv0: 'wp',
      argv1: 'setup',
      pathEnv: join(root, 'bin'),
      pathExtEnv: '.COM;.EXE;.BAT;.CMD',
      platform: 'win32',
    })

    expect(resolved).toBe(join(root, 'catalog'))
  })

  it('resolves the bundled catalog from a source module path in a checkout', () => {
    const root = makePackageRoot()
    cleanup.add(root)

    const resolved = resolveCatalogDir({
      moduleUrl: pathToFileURL(join(root, 'src', 'cli', 'commands', 'init', 'index.ts')).href,
      execPath: '/usr/bin/node',
      argv1: '/usr/bin/node',
    })

    expect(resolved).toBe(join(root, 'catalog'))
  })
})
