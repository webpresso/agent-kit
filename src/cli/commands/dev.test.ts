import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterEach, describe, expect, it, vi } from 'vitest'

import { getDevHelpText, runDevCommand } from './dev'

const originalEnv = { ...process.env }

let tmpRoot: string | undefined

afterEach(() => {
  process.env = { ...originalEnv }
  vi.unstubAllEnvs()
  if (tmpRoot) {
    rmSync(tmpRoot, { recursive: true, force: true })
    tmpRoot = undefined
  }
})

function writeManifest(dir: string, name: string, body: string): string {
  mkdirSync(dir, { recursive: true })
  const file = join(dir, name)
  writeFileSync(file, body)
  return file
}

describe('wp dev command', () => {
  it('documents public flags and manifest precedence in help text', () => {
    expect(getDevHelpText()).toContain('Usage: wp dev [target] [options]')
    expect(getDevHelpText()).toContain('--manifest <path>')
    expect(getDevHelpText()).toContain('--doctor')
    expect(getDevHelpText()).toContain('--clean')
    expect(getDevHelpText()).toContain('--restart')
    expect(getDevHelpText()).toContain(
      '--manifest -> WP_APP_MANIFEST -> ./app-manifest.yaml -> error',
    )
  })

  it('resolves manifest precedence from --manifest before env and cwd defaults', async () => {
    tmpRoot = mkdtempSync(join(tmpdir(), 'dev-cmd-precedence-'))
    const root = tmpRoot
    const explicit = writeManifest(
      root,
      'explicit.yaml',
      [
        'version: 1',
        'services:',
        '  api:',
        '    command: node',
        '    args: ["api.js"]',
        'groups:',
        '  full:',
        '    services: [api]',
        'defaults:',
        '  target: full',
      ].join('\n'),
    )
    const envManifest = writeManifest(
      root,
      'env.yaml',
      ['version: 1', 'services:', '  web:', '    command: node', '    args: ["web.js"]'].join('\n'),
    )
    vi.stubEnv('WP_APP_MANIFEST', envManifest)

    const result = await runDevCommand({
      cwd: root,
      manifestPath: explicit,
      mode: 'doctor',
    })

    expect(result.manifestPath).toBe(explicit)
    expect(result.services).toEqual(['api'])
  })

  it('uses WP_APP_MANIFEST when --manifest is omitted', async () => {
    tmpRoot = mkdtempSync(join(tmpdir(), 'dev-cmd-env-'))
    const root = tmpRoot
    const envManifest = writeManifest(
      root,
      'env.yaml',
      ['version: 1', 'services:', '  web:', '    command: node', '    args: ["web.js"]'].join('\n'),
    )
    vi.stubEnv('WP_APP_MANIFEST', envManifest)

    const result = await runDevCommand({
      cwd: root,
      mode: 'doctor',
      target: 'web',
    })

    expect(result.manifestPath).toBe(envManifest)
    expect(result.services).toEqual(['web'])
  })

  it('falls back to ./app-manifest.yaml when no explicit or env manifest exists', async () => {
    tmpRoot = mkdtempSync(join(tmpdir(), 'dev-cmd-default-'))
    const root = tmpRoot
    const fallback = writeManifest(
      root,
      'app-manifest.yaml',
      ['version: 1', 'services:', '  api:', '    command: node', '    args: ["api.js"]'].join('\n'),
    )

    const result = await runDevCommand({
      cwd: root,
      mode: 'doctor',
      target: 'api',
    })

    expect(result.manifestPath).toBe(fallback)
    expect(result.services).toEqual(['api'])
  })

  it('throws on unknown targets with services and groups in the error', async () => {
    tmpRoot = mkdtempSync(join(tmpdir(), 'dev-cmd-unknown-'))
    const root = tmpRoot
    const manifestPath = writeManifest(
      root,
      'app-manifest.yaml',
      [
        'version: 1',
        'services:',
        '  api:',
        '    command: node',
        '    args: ["api.js"]',
        'groups:',
        '  full:',
        '    services: [api]',
      ].join('\n'),
    )

    await expect(
      runDevCommand({
        cwd: root,
        manifestPath,
        mode: 'doctor',
        target: 'worker',
      }),
    ).rejects.toThrow('Unknown dev target "worker". Known services: api. Known groups: full.')
  })
})
