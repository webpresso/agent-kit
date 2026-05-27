import { chmodSync, mkdirSync, mkdtempSync, readFileSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { describe, expect, test } from 'vitest'

import { auditPackageSurface, stagePublishableTarballSurface } from './package-surface.js'

function tempRepo() {
  return mkdtempSync(join(tmpdir(), 'webpresso-package-surface-'))
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

  test('does not match unscoped webpresso baseline inside a scoped @webpresso/webpresso lock entry', () => {
    const root = tempRepo()
    writeJson(join(root, 'package-surface.json'), {
      referenceConsumerBaselines: {
        webpresso: '0.18.18',
      },
    })
    writeFileSync(join(root, 'pnpm-lock.yaml'), "'@webpresso/webpresso@0.3.8':\n")

    const result = auditPackageSurface(root)

    expect(result.violations).not.toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          file: 'pnpm-lock.yaml',
          message: expect.stringContaining('webpresso resolves to 0.3.8'),
        }),
      ]),
    )
  })

  test('passes current compatibility packages without an explicit contract', () => {
    const root = tempRepo()
    mkdirSync(join(root, 'packages', 'ui'), { recursive: true })
    writeJson(join(root, 'packages', 'ui', 'package.json'), {
      name: '@webpresso/ui',
      version: '0.1.0',
      private: false,
    })
    writeFileSync(join(root, 'README.md'), 'Use @webpresso/webpresso/runtime.\n')

    expect(auditPackageSurface(root).ok).toBe(true)
  })

  test('flags forbidden packed tarball paths and content', () => {
    const root = tempRepo()
    mkdirSync(join(root, 'docs', 'research'), { recursive: true })
    writeJson(join(root, 'package.json'), {
      name: '@webpresso/webpresso',
      version: '0.1.0',
      private: false,
      files: ['docs', 'README.md'],
    })
    writeFileSync(join(root, 'README.md'), 'hello\n')
    writeFileSync(
      join(root, 'docs', 'research', 'note.md'),
      'private path /Users/ozby/example and @repo/hidden\n',
    )

    const result = auditPackageSurface(root)

    expect(result.ok).toBe(false)
    expect(
      result.violations.some(
        (violation) =>
          violation.file === 'docs/research/note.md' &&
          violation.message.includes('forbidden path policy'),
      ),
    ).toBe(true)
    expect(
      result.violations.some(
        (violation) =>
          violation.file === 'docs/research/note.md' &&
          violation.message.includes('forbidden pattern') &&
          violation.message.includes('Users'),
      ),
    ).toBe(true)
  })

  test('flags secretlint findings in packed files', () => {
    const root = tempRepo()
    writeJson(join(root, 'package.json'), {
      name: '@webpresso/webpresso',
      version: '0.1.0',
      private: false,
      files: ['README.md'],
    })
    writeFileSync(join(root, 'README.md'), 'https://scanner-safe:sentinel@example.com\n')

    const result = auditPackageSurface(root)

    expect(result.ok).toBe(false)
    expect(result.violations).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          file: 'README.md',
          message: expect.stringContaining('Secretlint flagged packed file'),
        }),
      ]),
    )
  })

  test('skips deep content and secret scans for generated dist artifacts', () => {
    const root = tempRepo()
    mkdirSync(join(root, 'dist'), { recursive: true })
    writeJson(join(root, 'package.json'), {
      name: '@webpresso/webpresso',
      version: '0.1.0',
      private: false,
      files: ['dist'],
    })
    writeFileSync(
      join(root, 'dist', 'index.js'),
      'https://scanner-safe:sentinel@example.com and @repo/generated\n',
    )

    const result = auditPackageSurface(root)

    expect(result.ok).toBe(true)
    expect(result.violations).toEqual([])
  })

  test('supports contract-configured deep-scan exclusions for future generated directories', () => {
    const root = tempRepo()
    mkdirSync(join(root, 'generated-docs'), { recursive: true })
    writeJson(join(root, 'package.json'), {
      name: '@webpresso/webpresso',
      version: '0.1.0',
      private: false,
      files: ['generated-docs'],
    })
    writeJson(join(root, 'package-surface.json'), {
      tarball: {
        deepScanExcludedPathPrefixes: ['generated-docs/'],
      },
    })
    writeFileSync(
      join(root, 'generated-docs', 'index.md'),
      'https://scanner-safe:sentinel@example.com and @repo/generated\n',
    )

    const result = auditPackageSurface(root)

    expect(result.ok).toBe(true)
    expect(result.violations).toEqual([])
  })

  test('stages publishable packed files for external scanners', () => {
    const root = tempRepo()
    const destination = join(root, '.packed-surface')
    mkdirSync(join(root, 'docs'), { recursive: true })
    writeJson(join(root, 'package.json'), {
      name: '@webpresso/webpresso',
      version: '0.1.0',
      private: false,
      files: ['README.md', 'docs'],
      bin: {
        webpresso: './bin/webpresso.js',
      },
    })
    mkdirSync(join(root, 'bin'), { recursive: true })
    writeFileSync(join(root, 'README.md'), 'hello\n')
    writeFileSync(join(root, 'docs', 'guide.md'), 'guide\n')
    writeFileSync(join(root, 'bin', 'webpresso.js'), '#!/usr/bin/env node\nconsole.log("ok")\n')
    chmodSync(join(root, 'bin', 'webpresso.js'), 0o755)

    const result = stagePublishableTarballSurface(root, destination)

    expect(result.packageCount).toBe(1)
    expect(result.fileCount).toBeGreaterThanOrEqual(3)
    expect(readText(join(destination, 'README.md'))).toContain('hello')
    expect(readText(join(destination, 'bin', 'webpresso.js'))).toContain('console.log')
  })
})

function readText(path: string) {
  return readFileSync(path, 'utf8')
}
