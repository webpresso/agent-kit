import { spawnSync } from 'node:child_process'
import {
  chmodSync,
  existsSync,
  mkdirSync,
  mkdtempSync,
  readFileSync,
  rmSync,
  writeFileSync,
} from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'

import { describe, expect, it } from 'vitest'

import {
  createPackedManifest,
  preparePackedManifest,
  restorePackedManifest,
} from './package-manifest.js'

describe('createPackedManifest', () => {
  it('replaces workspace catalog specifiers across dependency sections', () => {
    const manifest = createPackedManifest(
      {
        dependencies: { vite: 'catalog:' },
        devDependencies: { vitest: 'catalog:' },
        optionalDependencies: { zod: 'catalog:' },
        peerDependencies: { react: 'catalog:react18' },
      },
      {
        catalog: {
          vite: '^8.0.11',
          vitest: '^4.1.5',
          zod: '^4.4.3',
        },
        catalogs: {
          react18: {
            react: '^18.3.1',
          },
        },
      },
    )

    expect(manifest.dependencies?.vite).toBe('^8.0.11')
    expect(manifest.devDependencies?.vitest).toBe('^4.1.5')
    expect(manifest.optionalDependencies?.zod).toBe('^4.4.3')
    expect(manifest.peerDependencies?.react).toBe('^18.3.1')
  })

  it('fails loudly when a catalog entry is missing', () => {
    expect(() =>
      createPackedManifest(
        {
          dependencies: { vite: 'catalog:' },
        },
        { catalog: {} },
      ),
    ).toThrow('Missing pnpm catalog entry for vite')
  })

  it('normalizes packed bin paths so npm publish --dry-run retains them', () => {
    const manifest = createPackedManifest(
      {
        name: 'package-manifest-bin-fixture',
        version: '1.0.0',
        license: 'MIT',
        bin: {
          wp: './bin/wp',
          'docs-lint': 'bin/docs-lint.js',
        },
      },
      { catalog: {} },
    ) as {
      bin?: Record<string, string>
    }

    expect(manifest.bin).toEqual({
      wp: 'bin/wp',
      'docs-lint': 'bin/docs-lint.js',
    })

    const fixtureDir = mkdtempSync(join(tmpdir(), 'wp-package-manifest-bin-'))

    try {
      mkdirSync(join(fixtureDir, 'bin'))
      writeFileSync(
        join(fixtureDir, 'package.json'),
        `${JSON.stringify(manifest, null, 2)}\n`,
        'utf8',
      )
      writeFileSync(
        join(fixtureDir, 'bin', 'wp'),
        '#!/usr/bin/env node\nconsole.log("wp")\n',
        'utf8',
      )
      writeFileSync(
        join(fixtureDir, 'bin', 'docs-lint.js'),
        '#!/usr/bin/env node\nconsole.log("docs-lint")\n',
        'utf8',
      )
      chmodSync(join(fixtureDir, 'bin', 'wp'), 0o755)
      chmodSync(join(fixtureDir, 'bin', 'docs-lint.js'), 0o755)

      const result = spawnSync('npm', ['publish', '--dry-run', '--access', 'public'], {
        cwd: fixtureDir,
        encoding: 'utf8',
      })

      const output = `${result.stdout}\n${result.stderr}`

      expect(result.status).toBe(0)
      expect(output).toContain('+ package-manifest-bin-fixture@1.0.0')
      expect(output).not.toContain('auto-corrected some errors')
      expect(output).not.toContain('bin[wp]')
      expect(output).not.toContain('bin[docs-lint]')
    } finally {
      rmSync(fixtureDir, { force: true, recursive: true })
    }
  })

  it('adds platform runtime packages to the packed optional dependency surface', () => {
    const manifest = createPackedManifest(
      {
        name: '@webpresso/agent-kit',
        version: '1.2.3',
        optionalDependencies: { existing: '^1.0.0' },
      },
      { catalog: {} },
    )

    expect(manifest.optionalDependencies).toMatchObject({
      existing: '^1.0.0',
      '@webpresso/agent-kit-runtime-darwin-arm64': '1.2.3',
      '@webpresso/agent-kit-runtime-darwin-x64': '1.2.3',
      '@webpresso/agent-kit-runtime-linux-x64': '1.2.3',
      '@webpresso/agent-kit-runtime-linux-arm64': '1.2.3',
      '@webpresso/agent-kit-runtime-windows-x64': '1.2.3',
    })
  })

  it('prunes orphaned dist subtrees during prepare and restores them afterwards', () => {
    const fixtureDir = mkdtempSync(join(tmpdir(), 'wp-package-manifest-prune-'))

    try {
      mkdirSync(join(fixtureDir, 'src', 'keep'), { recursive: true })
      mkdirSync(join(fixtureDir, 'dist', 'esm', 'keep'), { recursive: true })
      mkdirSync(join(fixtureDir, 'dist', 'esm', 'ai-prompts'), { recursive: true })
      writeFileSync(join(fixtureDir, 'pnpm-workspace.yaml'), 'catalog: {}\n', 'utf8')
      writeFileSync(
        join(fixtureDir, 'package.json'),
        `${JSON.stringify({ name: '@webpresso/agent-kit', version: '0.21.0' }, null, 2)}\n`,
        'utf8',
      )
      writeFileSync(join(fixtureDir, 'dist', 'esm', 'keep', 'index.js'), 'export {};\n', 'utf8')
      writeFileSync(
        join(fixtureDir, 'dist', 'esm', 'ai-prompts', 'index.js'),
        'export {};\n',
        'utf8',
      )

      preparePackedManifest(fixtureDir)
      expect(existsSync(join(fixtureDir, 'dist', 'esm', 'keep'))).toBe(true)
      expect(existsSync(join(fixtureDir, 'dist', 'esm', 'ai-prompts'))).toBe(false)

      restorePackedManifest(fixtureDir)
      expect(existsSync(join(fixtureDir, 'dist', 'esm', 'keep'))).toBe(true)
      expect(existsSync(join(fixtureDir, 'dist', 'esm', 'ai-prompts'))).toBe(true)
    } finally {
      rmSync(fixtureDir, { force: true, recursive: true })
    }
  })

  it('rewrites the real package.json optionalDependencies during prepare and restores afterwards', () => {
    const fixtureDir = mkdtempSync(join(tmpdir(), 'wp-package-manifest-runtime-'))

    try {
      writeFileSync(join(fixtureDir, 'pnpm-workspace.yaml'), 'catalog: {}\n', 'utf8')
      writeFileSync(
        join(fixtureDir, 'package.json'),
        `${JSON.stringify(
          {
            name: '@webpresso/agent-kit',
            version: '1.2.3',
            optionalDependencies: { existing: '^1.0.0' },
          },
          null,
          2,
        )}\n`,
        'utf8',
      )

      preparePackedManifest(fixtureDir)
      const prepared = JSON.parse(
        readFileSync(join(fixtureDir, 'package.json'), 'utf8'),
      ) as {
        optionalDependencies?: Record<string, string>
      }
      expect(prepared.optionalDependencies).toMatchObject({
        existing: '^1.0.0',
        '@webpresso/agent-kit-runtime-darwin-arm64': '1.2.3',
        '@webpresso/agent-kit-runtime-darwin-x64': '1.2.3',
        '@webpresso/agent-kit-runtime-linux-x64': '1.2.3',
        '@webpresso/agent-kit-runtime-linux-arm64': '1.2.3',
        '@webpresso/agent-kit-runtime-windows-x64': '1.2.3',
      })

      restorePackedManifest(fixtureDir)
      const restored = JSON.parse(
        readFileSync(join(fixtureDir, 'package.json'), 'utf8'),
      ) as {
        optionalDependencies?: Record<string, string>
      }
      expect(restored.optionalDependencies).toEqual({ existing: '^1.0.0' })
    } finally {
      rmSync(fixtureDir, { force: true, recursive: true })
    }
  })
})
