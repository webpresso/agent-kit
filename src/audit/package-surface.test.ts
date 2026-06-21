import {
  chmodSync,
  existsSync,
  mkdirSync,
  mkdtempSync,
  readFileSync,
  readdirSync,
  statSync,
  writeFileSync,
} from 'node:fs'
import { tmpdir } from 'node:os'
import { join, resolve } from 'node:path'
import { describe, expect, test } from 'vitest'

import { auditPackageSurface, parseNpmPackJsonOutput, stagePublishableTarballSurface } from './package-surface.js'
import {
  AGENT_KIT_TARBALL_SIZE_BUDGET_BYTES,
  AGENT_KIT_TARBALL_UNPACKED_SIZE_BUDGET_BYTES,
  evaluateAgentKitTarballSizeBudget,
} from '#build/runtime-surface-policy.js'

const ROOT_WP_DISPATCHER =
  "#!/usr/bin/env node\n\nimport { runNamedBin } from './_run.js'\n\nrunNamedBin('wp')\n"

function tempRepo() {
  return mkdtempSync(join(tmpdir(), 'webpresso-package-surface-'))
}

function writeJson(path: string, value: unknown) {
  writeFileSync(path, `${JSON.stringify(value, null, 2)}\n`)
}

function listFixtureFiles(root: string, entry: string): string[] {
  const absolute = join(root, entry)
  if (!existsSync(absolute)) return []
  const stats = statSync(absolute)
  if (stats.isFile()) return [entry]
  if (!stats.isDirectory()) return []
  return readdirSync(absolute)
    .flatMap((name) => listFixtureFiles(root, join(entry, name)))
    .toSorted((left, right) => left.localeCompare(right))
}

function fixturePackedEntry(packageRoot: string): { files: Array<{ path: string; size: number }> } {
  const manifest = JSON.parse(readFileSync(join(packageRoot, 'package.json'), 'utf8')) as {
    bin?: string | Record<string, string>
    files?: string[]
  }
  const paths = new Set<string>(['package.json'])
  for (const entry of manifest.files ?? []) {
    for (const file of listFixtureFiles(packageRoot, entry)) paths.add(file)
  }
  const binEntries =
    typeof manifest.bin === 'string'
      ? [manifest.bin]
      : Object.values(manifest.bin ?? {}).filter(
          (value): value is string => typeof value === 'string',
        )
  for (const binEntry of binEntries) {
    const normalized = binEntry.replace(/^\.\//, '')
    if (existsSync(join(packageRoot, normalized))) paths.add(normalized)
  }
  return {
    files: [...paths]
      .toSorted((left, right) => left.localeCompare(right))
      .map((path) => ({
        path,
        size: statSync(join(packageRoot, path)).size,
      })),
  }
}

const fastFixtureAudit = {
  readPackedEntry: fixturePackedEntry,
  runSecretlint: () => [],
}

function fixtureSecretlintFinding(stageRoot: string): unknown {
  return [
    {
      filePath: join(stageRoot, 'README.md'),
      messages: [
        {
          message: 'Credential-like URL detected',
          messageId: 'BasicAuth',
          ruleId: '@secretlint/secretlint-rule-preset-recommend',
          line: 1,
          column: 1,
        },
      ],
    },
  ]
}

describe('parseNpmPackJsonOutput', () => {
  test('parses npm JSON after lifecycle stdout prelude', () => {
    const parsed = parseNpmPackJsonOutput('$ bun scripts/stage-gstack-skills.ts\nstage-gstack-skills: staged 5 skills\n[{"name":"@webpresso/agent-kit","files":[{"path":"package.json","size":42}]}]')

    expect(parsed).toEqual([
      {
        name: '@webpresso/agent-kit',
        files: [{ path: 'package.json', size: 42 }],
      },
    ])
  })
})

describe('package-surface audit', () => {
  test('current package exposes the wp-extension public subpath contract', () => {
    const root = resolve(import.meta.dirname, '..', '..')
    const pkg = JSON.parse(readFileSync(join(root, 'package.json'), 'utf8')) as {
      exports?: Record<string, { import?: { types?: string; default?: string } }>
      imports?: Record<string, string>
      tshy?: { exports?: Record<string, string> }
    }

    expect(pkg.exports?.['./wp-extension']?.import).toEqual({
      types: './dist/esm/wp-extension/index.d.ts',
      default: './dist/esm/wp-extension/index.js',
    })
    expect(pkg.imports?.['#wp-extension']).toBe('./src/wp-extension/index.ts')
    expect(pkg.tshy?.exports?.['./wp-extension']).toBe('./src/wp-extension/index.ts')
  })

  test('public gstack attribution does not point package consumers to private source paths', () => {
    const root = resolve(import.meta.dirname, '..', '..')
    const notices = readFileSync(join(root, 'THIRD-PARTY-NOTICES.md'), 'utf8')
    const manifest = readFileSync(
      join(root, 'catalog', 'agent', 'skills', 'third-party-manifest.json'),
      'utf8',
    )

    expect(notices).toContain('gstack-derived workflow skills')
    expect(`${notices}\n${manifest}`).not.toContain('packages/gstack/')
    expect(`${notices}\n${manifest}`).not.toContain('packages/gstack provenance')
  })

  test('flags publishable @webpresso packages outside the contract', () => {
    const root = tempRepo()
    mkdirSync(join(root, 'packages', 'bad'), { recursive: true })
    writeJson(join(root, 'package-surface.json'), {
      allowedPublicPackages: ['@webpresso/framework'],
      compatibilityPublicPackages: [],
    })
    writeJson(join(root, 'packages', 'bad', 'package.json'), {
      name: '@webpresso/random-helper',
      version: '0.1.0',
      private: false,
    })

    const result = auditPackageSurface(root, fastFixtureAudit)

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

  test('flags publishable unscoped webpresso packages outside the contract', () => {
    const root = tempRepo()
    mkdirSync(join(root, 'packages', 'legacy'), { recursive: true })
    writeJson(join(root, 'package-surface.json'), {
      allowedPublicPackages: ['@webpresso/agent-kit'],
      compatibilityPublicPackages: [],
    })
    writeJson(join(root, 'packages', 'legacy', 'package.json'), {
      name: 'webpresso',
      version: '0.1.0',
      private: false,
    })

    const result = auditPackageSurface(root, fastFixtureAudit)

    expect(result.ok).toBe(false)
    expect(result.violations).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          file: 'packages/legacy/package.json',
          message: expect.stringContaining('webpresso'),
        }),
      ]),
    )
  })

  test('flags forbidden vendor package names in public docs', () => {
    const root = tempRepo()
    writeJson(join(root, 'package.json'), {
      name: '@webpresso/framework',
      version: '0.1.0',
      private: false,
    })
    writeJson(join(root, 'package-surface.json'), {})
    writeFileSync(join(root, 'README.md'), 'Install @webpresso/neon for Neon branching.\n')

    const result = auditPackageSurface(root, fastFixtureAudit)

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
        '@webpresso/framework': '0.3.6',
      },
    })
    writeFileSync(
      join(root, 'pnpm-workspace.yaml'),
      ['catalog:', '  "@webpresso/framework": ^0.1.1', ''].join('\n'),
    )
    writeFileSync(join(root, 'pnpm-lock.yaml'), "'@webpresso/framework@0.1.1':\n")

    const result = auditPackageSurface(root, fastFixtureAudit)

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

  test('flags publishable workspace packages behind known published baselines', () => {
    const root = tempRepo()
    mkdirSync(join(root, 'packages', 'agent-config'), { recursive: true })
    writeJson(join(root, 'package-surface.json'), {
      allowedPublicPackages: ['@webpresso/agent-config'],
      publishedPackageBaselines: {
        '@webpresso/agent-config': '0.1.4',
      },
    })
    writeJson(join(root, 'packages', 'agent-config', 'package.json'), {
      name: '@webpresso/agent-config',
      version: '0.1.0',
      private: false,
    })

    const result = auditPackageSurface(root, fastFixtureAudit)

    expect(result.ok).toBe(false)
    expect(result.violations).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          file: 'packages/agent-config/package.json',
          message: '@webpresso/agent-config local version 0.1.0 is behind published baseline 0.1.4',
        }),
      ]),
    )
  })

  test('does not carry a default @webpresso/framework reference-consumer baseline', () => {
    const root = tempRepo()
    writeJson(join(root, 'package-surface.json'), {})
    writeFileSync(join(root, 'pnpm-lock.yaml'), "'@webpresso/framework@0.1.1':\n")

    const result = auditPackageSurface(root, fastFixtureAudit)

    expect(result.violations).not.toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          file: 'pnpm-lock.yaml',
          message: expect.stringContaining('@webpresso/framework resolves to 0.1.1'),
        }),
      ]),
    )
  })

  test('does not carry a default unscoped webpresso reference-consumer baseline', () => {
    const root = tempRepo()
    writeJson(join(root, 'package-surface.json'), {})
    writeFileSync(join(root, 'pnpm-lock.yaml'), "'webpresso@0.18.17':\n")

    const result = auditPackageSurface(root, fastFixtureAudit)

    expect(result.violations).not.toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          file: 'pnpm-lock.yaml',
          message: expect.stringContaining('webpresso resolves to 0.18.17'),
        }),
      ]),
    )
  })

  test('does not match unscoped webpresso baseline inside a scoped @webpresso/framework lock entry', () => {
    const root = tempRepo()
    writeJson(join(root, 'package-surface.json'), {
      referenceConsumerBaselines: {
        webpresso: '0.18.18',
      },
    })
    writeFileSync(join(root, 'pnpm-lock.yaml'), "'@webpresso/framework@0.3.8':\n")

    const result = auditPackageSurface(root, fastFixtureAudit)

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
    writeFileSync(join(root, 'README.md'), 'Use @webpresso/framework/runtime.\n')

    expect(auditPackageSurface(root, fastFixtureAudit).ok).toBe(true)
  })

  test('flags publishable packages that run wp setup during install lifecycle', () => {
    const root = tempRepo()
    writeJson(join(root, 'package.json'), {
      name: '@webpresso/agent-kit',
      version: '0.1.0',
      private: false,
      scripts: {
        postinstall: 'wp setup',
        prepare: 'husky',
      },
      files: ['README.md'],
    })
    writeFileSync(join(root, 'README.md'), 'hello\n')

    const result = auditPackageSurface(root, fastFixtureAudit)

    expect(result.ok).toBe(false)
    expect(result.violations).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          file: 'package.json',
          message: expect.stringContaining('must not run "wp setup" from postinstall'),
        }),
      ]),
    )
    expect(result.violations).not.toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          message: expect.stringContaining('prepare'),
        }),
      ]),
    )
  })

  test('package-surface audit asserts built migration SQL assets without mutating them', () => {
    const root = tempRepo()
    mkdirSync(join(root, 'src', 'blueprint', 'db', 'migrations'), { recursive: true })
    writeJson(join(root, 'package.json'), {
      name: '@webpresso/framework',
      version: '0.1.0',
      private: false,
      files: ['dist/esm/blueprint/db/migrations'],
    })
    writeFileSync(join(root, 'src', 'blueprint', 'db', 'migrations', '0001_seed.sql'), 'select 1;\n')

    const result = auditPackageSurface(root, { runSecretlint: () => [] })

    expect(result.ok).toBe(false)
    expect(
      result.violations.some(
        (violation) =>
          violation.file === 'package.json' &&
          violation.message.includes('Missing or stale built blueprint migration SQL assets'),
      ),
    ).toBe(true)
    expect(existsSync(join(root, 'dist', 'esm', 'blueprint', 'db', 'migrations'))).toBe(false)
  })

  test('package-surface audit does not run npm pack lifecycle scripts', () => {
    const root = tempRepo()
    writeJson(join(root, 'package.json'), {
      name: '@webpresso/framework',
      version: '0.1.0',
      private: false,
      files: ['package.json'],
      scripts: {
        prepack:
          'node -e "require(\\"node:fs\\").writeFileSync(\\"MUTATED_BY_PREPACK\\", \\"yes\\")"',
      },
    })

    const result = auditPackageSurface(root, { runSecretlint: () => [] })

    expect(result.ok).toBe(true)
    expect(existsSync(join(root, 'MUTATED_BY_PREPACK'))).toBe(false)
  })

  test('flags forbidden packed tarball paths and content', () => {
    const root = tempRepo()
    mkdirSync(join(root, 'docs', 'research'), { recursive: true })
    writeJson(join(root, 'package.json'), {
      name: '@webpresso/framework',
      version: '0.1.0',
      private: false,
      files: ['docs', 'README.md'],
    })
    writeFileSync(join(root, 'README.md'), 'hello\n')
    writeFileSync(
      join(root, 'docs', 'research', 'note.md'),
      'private path /Users/ozby/example and @repo/hidden\n',
    )

    const result = auditPackageSurface(root, fastFixtureAudit)

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

  test('regex forbidden-content patterns reject matching packed text', () => {
    const root = tempRepo()
    writeJson(join(root, 'package-surface.json'), {
      allowedPublicPackages: ['@webpresso/framework'],
      compatibilityPublicPackages: [],
      tarball: { forbiddenContentPatterns: ['/ozby\\/ingest-lens/'] },
    })
    writeJson(join(root, 'package.json'), {
      name: '@webpresso/framework',
      version: '0.1.0',
      private: false,
      files: ['README.md'],
    })
    writeFileSync(join(root, 'README.md'), 'leaked private reference ozby/ingest-lens\n')

    const result = auditPackageSurface(root, fastFixtureAudit)

    expect(result.ok).toBe(false)
    expect(
      result.violations.some(
        (violation) =>
          violation.file === 'README.md' &&
          violation.message.includes('forbidden pattern') &&
          violation.message.includes('/ozby\\/ingest-lens/'),
      ),
    ).toBe(true)
  })

  test('flags secretlint findings in packed files', () => {
    const root = tempRepo()
    writeJson(join(root, 'package.json'), {
      name: '@webpresso/framework',
      version: '0.1.0',
      private: false,
      files: ['README.md'],
    })
    writeFileSync(join(root, 'README.md'), 'https://scanner-safe:sentinel@example.com\n')

    const result = auditPackageSurface(root, {
      ...fastFixtureAudit,
      runSecretlint: fixtureSecretlintFinding,
    })

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

  test.sequential('uses the agent-kit-owned secret scanner outside the agent-kit repo', () => {
    const root = tempRepo()
    mkdirSync(join(root, 'node_modules', '.bin'), { recursive: true })
    writeJson(join(root, 'package.json'), {
      name: '@webpresso/framework',
      version: '0.1.0',
      private: false,
      files: ['README.md'],
    })
    writeFileSync(join(root, 'README.md'), 'https://scanner-safe:sentinel@example.com\n')
    const fakeConsumerSecretlint = join(root, 'node_modules', '.bin', 'secretlint')
    writeFileSync(
      fakeConsumerSecretlint,
      '#!/usr/bin/env node\nprocess.stderr.write("consumer secretlint must not run\\n"); process.exit(42)\n',
    )
    chmodSync(fakeConsumerSecretlint, 0o755)

    const originalCwd = process.cwd()
    process.chdir(root)
    try {
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
    } finally {
      process.chdir(originalCwd)
    }
  })

  test.sequential('uses WP_AGENT_KIT_ROOT to locate the owned scanner from compiled runtime lanes', () => {
    const root = tempRepo()
    mkdirSync(join(root, 'node_modules', '.bin'), { recursive: true })
    writeJson(join(root, 'package.json'), {
      name: '@webpresso/framework',
      version: '0.1.0',
      private: false,
      files: ['README.md'],
    })
    writeFileSync(join(root, 'README.md'), 'https://scanner-safe:sentinel@example.com\n')
    const fakeConsumerSecretlint = join(root, 'node_modules', '.bin', 'secretlint')
    writeFileSync(
      fakeConsumerSecretlint,
      '#!/usr/bin/env node\nprocess.stderr.write("consumer secretlint must not run\\n"); process.exit(42)\n',
    )
    chmodSync(fakeConsumerSecretlint, 0o755)

    const originalCwd = process.cwd()
    const originalAgentKitRoot = process.env.WP_AGENT_KIT_ROOT
    process.chdir(root)
    process.env.WP_AGENT_KIT_ROOT = resolve(import.meta.dirname, '..', '..')
    try {
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
    } finally {
      process.chdir(originalCwd)
      if (originalAgentKitRoot === undefined) {
        delete process.env.WP_AGENT_KIT_ROOT
      } else {
        process.env.WP_AGENT_KIT_ROOT = originalAgentKitRoot
      }
    }
  })

  test('skips deep content and secret scans for generated dist artifacts', () => {
    const root = tempRepo()
    mkdirSync(join(root, 'dist'), { recursive: true })
    writeJson(join(root, 'package.json'), {
      name: '@webpresso/framework',
      version: '0.1.0',
      private: false,
      files: ['dist'],
    })
    writeFileSync(
      join(root, 'dist', 'index.js'),
      'https://scanner-safe:sentinel@example.com and @repo/generated\n',
    )

    const result = auditPackageSurface(root, fastFixtureAudit)

    expect(result.ok).toBe(true)
    expect(result.violations).toEqual([])
  })

  test('supports contract-configured deep-scan exclusions for future generated directories', () => {
    const root = tempRepo()
    mkdirSync(join(root, 'generated-docs'), { recursive: true })
    writeJson(join(root, 'package.json'), {
      name: '@webpresso/framework',
      version: '0.1.0',
      private: false,
      files: ['generated-docs'],
    })
    writeJson(join(root, 'package-surface.json'), {
      tarball: {
        allowedPathPatterns: ['package.json'],
        deepScanExcludedPathPrefixes: ['generated-docs/'],
      },
    })
    writeFileSync(
      join(root, 'generated-docs', 'index.md'),
      'https://scanner-safe:sentinel@example.com and @repo/generated\n',
    )

    const result = auditPackageSurface(root, fastFixtureAudit)

    expect(result.ok).toBe(true)
    expect(result.violations).toEqual([])
  })

  test('stages publishable packed files for external scanners', () => {
    const root = tempRepo()
    const destination = join(root, '.packed-surface')
    mkdirSync(join(root, 'docs'), { recursive: true })
    writeJson(join(root, 'package.json'), {
      name: '@webpresso/framework',
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

    const result = stagePublishableTarballSurface(root, destination, fastFixtureAudit)

    expect(result.packageCount).toBe(1)
    expect(result.fileCount).toBeGreaterThanOrEqual(3)
    expect(readText(join(destination, 'README.md'))).toContain('hello')
    expect(readText(join(destination, 'bin', 'webpresso.js'))).toContain('console.log')
  })

  test('requires manifest + launcher on the packed @webpresso/agent-kit thin-root surface', () => {
    const root = tempRepo()
    mkdirSync(join(root, 'bin'), { recursive: true })
    writeJson(join(root, 'package.json'), {
      name: '@webpresso/agent-kit',
      version: '0.28.0',
      private: false,
      files: ['bin/runtime-manifest.json'],
      bin: { wp: 'bin/wp' },
      optionalDependencies: { '@webpresso/agent-kit-runtime-darwin-arm64': '0.28.0' },
    })
    writeFileSync(
      join(root, 'bin', 'runtime-manifest.json'),
      `${JSON.stringify({
        binaryName: 'wp',
        targets: [
          {
            id: 'darwin-arm64',
            os: 'darwin',
            packageName: '@webpresso/agent-kit-runtime-darwin-arm64',
          },
        ],
      })}\n`,
    )

    const result = auditPackageSurface(root, fastFixtureAudit)

    expect(result.ok).toBe(false)
    expect(
      result.violations.some(
        (violation) =>
          violation.file === 'bin/wp' &&
          violation.message.includes('root launcher contract failed'),
      ),
    ).toBe(true)
  })

  test('fails when packed @webpresso/agent-kit surfaces include denied runtime payload trees', () => {
    const root = tempRepo()
    mkdirSync(join(root, 'bin', 'runtime', 'darwin-arm64'), { recursive: true })
    writeJson(join(root, 'package.json'), {
      name: '@webpresso/agent-kit',
      version: '0.28.0',
      private: false,
      files: ['bin'],
      bin: { wp: 'bin/wp' },
      optionalDependencies: { '@webpresso/agent-kit-runtime-darwin-arm64': '0.28.0' },
    })
    writeFileSync(
      join(root, 'bin', 'runtime-manifest.json'),
      `${JSON.stringify({
        binaryName: 'wp',
        targets: [
          {
            id: 'darwin-arm64',
            os: 'darwin',
            packageName: '@webpresso/agent-kit-runtime-darwin-arm64',
          },
        ],
      })}\n`,
    )
    writeFileSync(join(root, 'bin', 'runtime', 'darwin-arm64', 'wp'), 'native runtime\n')
    writeFileSync(join(root, 'bin', 'wp'), ROOT_WP_DISPATCHER)
    chmodSync(join(root, 'bin', 'runtime', 'darwin-arm64', 'wp'), 0o755)
    chmodSync(join(root, 'bin', 'wp'), 0o755)

    const result = auditPackageSurface(root, fastFixtureAudit)

    expect(result.ok).toBe(false)
    expect(
      result.violations.some(
        (violation) =>
          violation.file === 'bin/runtime/darwin-arm64/wp' &&
          violation.message.includes('denied native runtime payload'),
      ),
    ).toBe(true)
  })

  test('fails when packed @webpresso/agent-kit surfaces include denied dist/runtime-packages payloads', () => {
    const root = tempRepo()
    mkdirSync(join(root, 'bin'), { recursive: true })
    mkdirSync(join(root, 'dist', 'runtime-packages', 'agent-kit-runtime-darwin-arm64', 'bin'), {
      recursive: true,
    })
    writeJson(join(root, 'package.json'), {
      name: '@webpresso/agent-kit',
      version: '0.28.0',
      private: false,
      files: ['bin/runtime-manifest.json', 'bin/wp', 'dist/runtime-packages'],
      bin: { wp: 'bin/wp' },
      optionalDependencies: { '@webpresso/agent-kit-runtime-darwin-arm64': '0.28.0' },
    })
    writeFileSync(
      join(root, 'bin', 'runtime-manifest.json'),
      `${JSON.stringify({
        binaryName: 'wp',
        targets: [
          {
            id: 'darwin-arm64',
            os: 'darwin',
            packageName: '@webpresso/agent-kit-runtime-darwin-arm64',
          },
        ],
      })}\n`,
    )
    writeFileSync(join(root, 'bin', 'wp'), ROOT_WP_DISPATCHER)
    writeFileSync(
      join(root, 'dist', 'runtime-packages', 'agent-kit-runtime-darwin-arm64', 'bin', 'wp'),
      'runtime payload\n',
    )
    chmodSync(join(root, 'bin', 'wp'), 0o755)
    chmodSync(
      join(root, 'dist', 'runtime-packages', 'agent-kit-runtime-darwin-arm64', 'bin', 'wp'),
      0o755,
    )

    const result = auditPackageSurface(root, fastFixtureAudit)

    expect(result.ok).toBe(false)
    expect(
      result.violations.some(
        (violation) =>
          violation.file === 'dist/runtime-packages/agent-kit-runtime-darwin-arm64/bin/wp' &&
          violation.message.includes('denied native runtime payload'),
      ),
    ).toBe(true)
  })

  test('accepts packed @webpresso/agent-kit thin-root surfaces with manifest + launcher only', () => {
    const root = tempRepo()
    mkdirSync(join(root, 'bin'), { recursive: true })
    writeJson(join(root, 'package.json'), {
      name: '@webpresso/agent-kit',
      version: '0.28.0',
      private: false,
      files: ['bin/runtime-manifest.json', 'bin/wp'],
      bin: { wp: 'bin/wp' },
      optionalDependencies: { '@webpresso/agent-kit-runtime-darwin-arm64': '0.28.0' },
    })
    writeFileSync(
      join(root, 'bin', 'runtime-manifest.json'),
      `${JSON.stringify({
        binaryName: 'wp',
        targets: [
          {
            id: 'darwin-arm64',
            os: 'darwin',
            packageName: '@webpresso/agent-kit-runtime-darwin-arm64',
          },
        ],
      })}\n`,
    )
    writeFileSync(join(root, 'bin', 'wp'), ROOT_WP_DISPATCHER)
    chmodSync(join(root, 'bin', 'wp'), 0o755)

    const result = auditPackageSurface(root, fastFixtureAudit)

    expect(result.ok).toBe(true)
  })

  test('wires runtime optionals in the packed surface even when the committed manifest omits them', () => {
    const root = tempRepo()
    mkdirSync(join(root, 'bin'), { recursive: true })
    writeJson(join(root, 'package.json'), {
      name: '@webpresso/agent-kit',
      version: '0.28.0',
      private: false,
      files: ['bin/runtime-manifest.json', 'bin/wp'],
      bin: { wp: 'bin/wp' },
      // The committed manifest intentionally OMITS the runtime optionals:
      // createPackedManifest adds them to the packed tarball at the package
      // version at pack time. Committing them would pin the lockfile to a
      // runtime version that is only published during the same release and
      // deadlock the publish job's frozen install.
      optionalDependencies: {},
    })
    writeFileSync(
      join(root, 'bin', 'runtime-manifest.json'),
      `${JSON.stringify({
        binaryName: 'wp',
        targets: [
          {
            id: 'linux-x64',
            os: 'linux',
            packageName: '@webpresso/agent-kit-runtime-linux-x64',
          },
        ],
      })}\n`,
    )
    writeFileSync(join(root, 'bin', 'wp'), ROOT_WP_DISPATCHER)
    chmodSync(join(root, 'bin', 'wp'), 0o755)

    const result = auditPackageSurface(root, fastFixtureAudit)

    // No runtime-optional violation: the packed manifest wires the target to the
    // package version (0.28.0) even though the committed manifest declares none.
    expect(
      result.violations.some((violation) =>
        violation.message.includes('@webpresso/agent-kit-runtime-linux-x64'),
      ),
    ).toBe(false)
    expect(result.ok).toBe(true)
  })

  test('fails when packed @webpresso/agent-kit root bin/wp is a native binary instead of the selector', () => {
    const root = tempRepo()
    mkdirSync(join(root, 'bin'), { recursive: true })
    writeJson(join(root, 'package.json'), {
      name: '@webpresso/agent-kit',
      version: '0.28.0',
      private: false,
      files: ['bin/runtime-manifest.json', 'bin/wp'],
      bin: { wp: 'bin/wp' },
      optionalDependencies: { '@webpresso/agent-kit-runtime-linux-x64': '0.28.0' },
    })
    writeFileSync(
      join(root, 'bin', 'runtime-manifest.json'),
      `${JSON.stringify({
        binaryName: 'wp',
        targets: [
          {
            id: 'linux-x64',
            os: 'linux',
            packageName: '@webpresso/agent-kit-runtime-linux-x64',
          },
        ],
      })}\n`,
    )
    writeFileSync(join(root, 'bin', 'wp'), Buffer.from([0x7f, 0x45, 0x4c, 0x46, 0]))
    chmodSync(join(root, 'bin', 'wp'), 0o755)

    const result = auditPackageSurface(root, fastFixtureAudit)

    expect(result.ok).toBe(false)
    expect(
      result.violations.some(
        (violation) =>
          violation.file === 'bin/wp' && violation.message.includes('cross-platform JS selector'),
      ),
    ).toBe(true)
  })

  test('enforces an explicit tarball size budget for thin-root native runtime surfaces', () => {
    expect(
      evaluateAgentKitTarballSizeBudget({
        size: AGENT_KIT_TARBALL_SIZE_BUDGET_BYTES,
        unpackedSize: AGENT_KIT_TARBALL_UNPACKED_SIZE_BUDGET_BYTES,
      }),
    ).toMatchObject({ sizeOk: true, unpackedOk: true })

    expect(
      evaluateAgentKitTarballSizeBudget({
        size: AGENT_KIT_TARBALL_SIZE_BUDGET_BYTES + 1,
        unpackedSize: AGENT_KIT_TARBALL_UNPACKED_SIZE_BUDGET_BYTES + 1,
      }),
    ).toMatchObject({ sizeOk: false, unpackedOk: false })
  })
})

function readText(path: string) {
  return readFileSync(path, 'utf8')
}
