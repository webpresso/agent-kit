import { mkdirSync, writeFileSync } from 'node:fs'
import { mkdtemp, rm } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import path from 'node:path'
import { pathToFileURL } from 'node:url'
import { afterEach, describe, expect, it } from 'vitest'

import { readOwnedPackageVersion } from './package-version.js'

describe('readOwnedPackageVersion', () => {
  const tempDirs: string[] = []

  afterEach(async () => {
    for (const dir of tempDirs.splice(0)) {
      await rm(dir, { recursive: true, force: true })
    }
  })

  async function tempRoot(): Promise<string> {
    const root = await mkdtemp(path.join(tmpdir(), 'wp-runtime-version-'))
    tempDirs.push(root)
    return root
  }

  it('walks upward to the nearest owned package version', async () => {
    const root = await tempRoot()
    writeFileSync(
      path.join(root, 'package.json'),
      JSON.stringify({ name: '@webpresso/agent-kit', version: '1.2.3' }),
    )
    const nested = path.join(root, 'dist', 'esm', 'cli')
    mkdirSync(nested, { recursive: true })

    expect(readOwnedPackageVersion(pathToFileURL(path.join(nested, 'cli.js')).href)).toBe('1.2.3')
  })

  it('ignores unrelated package.json files while walking upward', async () => {
    const root = await tempRoot()
    writeFileSync(
      path.join(root, 'package.json'),
      JSON.stringify({ name: 'webpresso-runtime', version: '2.3.4' }),
    )
    const nested = path.join(root, 'dist', 'esm', 'mcp')
    mkdirSync(nested, { recursive: true })
    writeFileSync(path.join(nested, 'package.json'), JSON.stringify({ name: 'other', version: '9.9.9' }))

    expect(readOwnedPackageVersion(pathToFileURL(path.join(nested, 'server.js')).href)).toBe('2.3.4')
  })

  it('returns a stable placeholder when no owned package is found', async () => {
    const root = await tempRoot()
    const nested = path.join(root, 'dist', 'esm')
    mkdirSync(nested, { recursive: true })

    expect(readOwnedPackageVersion(pathToFileURL(path.join(nested, 'index.js')).href)).toBe('0.0.0')
  })
})
