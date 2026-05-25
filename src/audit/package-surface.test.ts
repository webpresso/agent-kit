import { mkdirSync, mkdtempSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { describe, expect, test } from 'vitest'

import { auditPackageSurface } from './package-surface.js'

function tempRepo() {
  return mkdtempSync(join(tmpdir(), 'agent-kit-package-surface-'))
}

function writeJson(path: string, value: unknown) {
  writeFileSync(path, `${JSON.stringify(value, null, 2)}\n`)
}

describe('package-surface audit', () => {
  test('flags publishable @webpresso packages outside the contract', () => {
    const root = tempRepo()
    mkdirSync(join(root, 'packages', 'bad'), { recursive: true })
    writeJson(join(root, 'package-surface.json'), {
      allowedPublicPackages: ['@webpresso/webpresso'],
      compatibilityPublicPackages: [],
    })
    writeJson(join(root, 'packages', 'bad', 'package.json'), {
      name: '@webpresso/random-helper',
      version: '0.1.0',
      private: false,
    })

    const result = auditPackageSurface(root)

    expect(result.ok).toBe(false)
    expect(result.violations).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          file: 'packages/bad/package.json',
          message: expect.stringContaining('@webpresso/random-helper'),
        }),
      ]),
    )
  })

  test('flags forbidden vendor package names in public docs', () => {
    const root = tempRepo()
    writeJson(join(root, 'package.json'), {
      name: '@webpresso/webpresso',
      version: '0.1.0',
      private: false,
    })
    writeJson(join(root, 'package-surface.json'), {})
    writeFileSync(join(root, 'README.md'), 'Install @webpresso/neon for Neon branching.\n')

    const result = auditPackageSurface(root)

    expect(result.ok).toBe(false)
    expect(result.violations).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          file: 'README.md',
          message: expect.stringContaining('@webpresso/neon'),
        }),
      ]),
    )
  })

  test('flags stale reference-consumer lockfile versions when baselines are configured', () => {
    const root = tempRepo()
    writeJson(join(root, 'package-surface.json'), {
      referenceConsumerBaselines: {
        '@webpresso/webpresso': '0.3.6',
      },
    })
    writeFileSync(
      join(root, 'pnpm-workspace.yaml'),
      ['catalog:', '  "@webpresso/webpresso": ^0.1.1', ''].join('\n'),
    )
    writeFileSync(join(root, 'pnpm-lock.yaml'), "'@webpresso/webpresso@0.1.1':\n")

    const result = auditPackageSurface(root)

    expect(result.ok).toBe(false)
    expect(result.violations).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          file: 'pnpm-lock.yaml',
          message: expect.stringContaining('expected at least 0.3.6'),
        }),
      ]),
    )
  })

  test('passes current compatibility packages without an explicit contract', () => {
    const root = tempRepo()
    mkdirSync(join(root, 'packages', 'runtime'), { recursive: true })
    writeJson(join(root, 'packages', 'runtime', 'package.json'), {
      name: '@webpresso/runtime',
      version: '0.5.5',
      private: false,
    })
    writeFileSync(join(root, 'README.md'), 'Use @webpresso/webpresso/runtime.\n')

    expect(auditPackageSurface(root).ok).toBe(true)
  })
})
