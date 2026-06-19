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
import { dirname, join } from 'node:path'

import { describe, expect, it } from 'vitest'

import {
  createPackedManifest,
  preparePackedManifest,
  restorePackedManifest,
} from './package-manifest.js'
import { WP_HOOK_BIN_NAMES } from '#cli/commands/init/scaffolders/agent-hooks/ir.js'

const repoRoot = findRepoRoot(import.meta.dirname)

function findRepoRoot(startDir: string): string {
  let current = startDir
  while (true) {
    if (existsSync(join(current, 'pnpm-workspace.yaml'))) return current
    const parent = dirname(current)
    if (parent === current) {
      throw new Error(`Could not locate pnpm-workspace.yaml from ${startDir}`)
    }
    current = parent
  }
}

type JsonObject = Record<string, unknown>

function readJsonObject(filePath: string): JsonObject {
  return JSON.parse(readFileSync(filePath, 'utf8')) as JsonObject
}

function loadDryRunPackagePaths(): string[] {
  const contract = JSON.parse(readFileSync(join(repoRoot, 'package-surface.json'), 'utf8')) as {
    cliBins?: { internalHooks?: string[] }
  }
  const expectedSessionMemoryToolDescriptors = sessionMemoryToolNames.flatMap((toolName) => {
    const fileBase = toolName.replace(/^wp_/u, '').replaceAll('_', '-')
    return [`dist/esm/mcp/tools/${fileBase}.js`, `dist/esm/mcp/tools/${fileBase}.d.ts`]
  })
  return [
    'README.md',
    'package.json',
    'LICENSE',
    'bin/_managed-hook.js',
    ...(contract.cliBins?.internalHooks ?? []).map((hookBin) => `bin/${hookBin}.js`),
    ...codexPluginArtifactPaths,
    ...sessionMemoryPublicDocPaths,
    ...expectedSessionMemoryToolDescriptors,
  ].toSorted()
}

let dryRunPackagePaths: string[] | undefined

function getDryRunPackagePaths(): string[] {
  dryRunPackagePaths ??= loadDryRunPackagePaths()
  return dryRunPackagePaths
}

const codexPluginArtifactPaths = [
  'hooks/hooks.json',
  'codex.mcp.json',
  '.codex-plugin/plugin.json',
] as const

const sessionMemoryPublicDocPaths = [
  'docs/guides/session-memory.md',
  'docs/bench/session-memory-methodology.md',
] as const

const sessionMemoryToolNames = [
  'wp_session_batch_execute',
  'wp_session_capture',
  'wp_session_doctor',
  'wp_session_execute',
  'wp_session_execute_file',
  'wp_session_fetch_and_index',
  'wp_session_index',
  'wp_session_purge',
  'wp_session_restore',
  'wp_session_search',
  'wp_session_snapshot',
  'wp_session_stats',
] as const

const forbiddenPluginArtifactText = [
  '/Users/',
  '/home/',
  '.omx/',
  '.agent/',
  '.agents/',
  '.codex/',
  '.claude/skills/',
  '.env',
  '.dev.vars',
  'NPM_TOKEN',
  'NODE_AUTH_TOKEN',
  'replacement parity proof',
  'replacement-parity',
] as const

describe('createPackedManifest', () => {
  it('keeps transient prepack backup artifacts gitignored', () => {
    const gitignore = readFileSync(join(repoRoot, '.gitignore'), 'utf8')

    expect(gitignore).toContain('.package.json.prepack.backup')
    expect(gitignore).toContain('.dist-prepack-backup/')
    expect(gitignore).toContain('.sourcemap-comments-prepack-backup/')
  })

  it('replaces workspace catalog specifiers across dependency sections', () => {
    const manifest = createPackedManifest(
      {
        dependencies: { vite: 'catalog:' },
        optionalDependencies: { zod: 'catalog:' },
        peerDependencies: { react: 'catalog:react18' },
      },
      {
        catalog: {
          vite: '^8.0.11',
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
    expect(manifest.optionalDependencies?.zod).toBe('^4.4.3')
    expect(manifest.peerDependencies?.react).toBe('^18.3.1')
    // devDependencies are stripped from the packed manifest (see dedicated test below)
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

  it('rejects non-publishable local dependency protocols before packing', () => {
    const linkUrlSpecifier = `${'link:'}//../local`

    expect(() =>
      createPackedManifest(
        {
          dependencies: { local: linkUrlSpecifier },
        },
        { catalog: {} },
      ),
    ).toThrow(
      `Cannot pack dependencies.local with non-publishable link: specifier ${JSON.stringify(linkUrlSpecifier)}`,
    )

    expect(() =>
      createPackedManifest(
        {
          optionalDependencies: { local: 'workspace:*' },
        },
        { catalog: {} },
      ),
    ).toThrow(
      'Cannot pack optionalDependencies.local with non-publishable workspace: specifier "workspace:*"',
    )

    expect(() =>
      createPackedManifest(
        {
          devDependencies: { local: 'file:../local' },
        },
        { catalog: {} },
      ),
    ).toThrow(
      'Cannot pack devDependencies.local with non-publishable file: specifier "file:../local"',
    )
  })

  it('strips devDependencies from the packed manifest so npm does not reject workspace: specifiers', () => {
    // workspace: specifiers in devDependencies are legitimate in monorepo self-hosting
    // but npm rejects them even with --omit=dev, so devDependencies are stripped entirely.
    const result = createPackedManifest(
      {
        name: 'pkg',
        dependencies: { react: '^18.0.0' },
        devDependencies: { '@webpresso/agent-config': 'workspace:*', vitest: 'catalog:' },
      },
      { catalog: { vitest: '^4.1.5' } },
    )
    expect(result).not.toHaveProperty('devDependencies')
    expect(result).toHaveProperty('dependencies', { react: '^18.0.0' })
  })

  it('rewrites publishable workspace package specifiers to local workspace versions before packing', () => {
    const manifest = createPackedManifest(
      {
        devDependencies: { '@webpresso/agent-config': 'workspace:*' },
        peerDependencies: { '@webpresso/agent-config': 'workspace:^' },
      },
      {
        catalog: {},
        workspacePackages: {
          '@webpresso/agent-config': '0.0.1',
        },
      },
    )

    expect(manifest.devDependencies?.['@webpresso/agent-config']).toBe(undefined)
    expect(manifest.peerDependencies?.['@webpresso/agent-config']).toBe('^0.0.1')
  })

  it('omits devDependencies from the packed manifest install surface', () => {
    const manifest = createPackedManifest(
      {
        devDependencies: { vitest: 'catalog:' },
      },
      {
        catalog: { vitest: '^4.1.5' },
      },
    )

    expect(manifest.devDependencies).toBe(undefined)
  })

  it('rejects non-publishable local dependency protocols resolved from catalogs', () => {
    const linkUrlSpecifier = `${'link:'}//../local`

    expect(() =>
      createPackedManifest(
        {
          dependencies: { local: 'catalog:' },
        },
        { catalog: { local: linkUrlSpecifier } },
      ),
    ).toThrow(
      `Cannot pack dependencies.local with non-publishable link: specifier ${JSON.stringify(linkUrlSpecifier)}`,
    )
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

  it('does not publish the precompact snapshot hook as a public package bin', () => {
    const manifest = createPackedManifest(
      {
        name: '@webpresso/agent-kit',
        version: '1.0.0',
        bin: {
          wp: 'bin/wp',
        },
      },
      { catalog: {} },
    ) as {
      bin?: Record<string, string>
    }

    expect(manifest.bin).toEqual({
      wp: 'bin/wp',
    })
    expect(manifest.bin?.['wp-precompact-snapshot']).toBe(undefined)
  })

  it('classifies precompact snapshot as an internal hook bin rather than a public CLI', () => {
    const packageJson = readJsonObject(join(repoRoot, 'package.json')) as {
      bin?: Record<string, string>
    }
    const contract = JSON.parse(readFileSync(join(repoRoot, 'package-surface.json'), 'utf8')) as {
      cliBins?: {
        internalHooks?: string[]
        public?: string[]
      }
    }

    expect(contract.cliBins?.internalHooks ?? []).toContain('wp-precompact-snapshot')
    expect([...(contract.cliBins?.internalHooks ?? [])].sort()).toEqual(
      [...WP_HOOK_BIN_NAMES].sort(),
    )
    expect(contract.cliBins?.public ?? []).not.toContain('wp-precompact-snapshot')
    expect(Object.keys(packageJson.bin ?? {}).sort()).toEqual(
      [...(contract.cliBins?.public ?? [])].sort(),
    )
    for (const internalHook of contract.cliBins?.internalHooks ?? []) {
      expect(packageJson.bin).not.toHaveProperty(internalHook)
    }
  })

  it('packs internal managed hook wrapper files without exposing them as public package bins', () => {
    const packedPaths = getDryRunPackagePaths()
    const packageJson = readJsonObject(join(repoRoot, 'package.json')) as {
      bin?: Record<string, string>
    }
    const contract = JSON.parse(readFileSync(join(repoRoot, 'package-surface.json'), 'utf8')) as {
      cliBins?: { internalHooks?: string[] }
    }

    expect(packedPaths).toContain('bin/_managed-hook.js')
    for (const hookBin of contract.cliBins?.internalHooks ?? []) {
      expect(packedPaths).toContain(`bin/${hookBin}.js`)
      expect(packageJson.bin).not.toHaveProperty(hookBin)
    }
  })

  it('ships first-class Codex plugin artifacts as intentional package files', () => {
    const packageJson = readJsonObject(join(repoRoot, 'package.json')) as {
      files?: unknown
      version?: unknown
    }
    expect(packageJson.files).toEqual(
      expect.arrayContaining(['.claude-plugin', '.codex-plugin', 'codex.mcp.json', 'hooks']),
    )

    for (const artifactPath of codexPluginArtifactPaths) {
      expect(existsSync(join(repoRoot, artifactPath))).toBe(true)
    }

    const manifest = readJsonObject(join(repoRoot, '.codex-plugin', 'plugin.json'))
    expect(manifest).toMatchObject({
      name: 'agent-kit',
      version: packageJson.version,
      description: 'Webpresso agent-kit: blueprints, skills, hooks, and MCP server',
      skills: './skills/',
      mcpServers: './codex.mcp.json',
      hooks: './hooks/hooks.json',
    })

    expect(readJsonObject(join(repoRoot, 'codex.mcp.json'))).toStrictEqual({
      webpresso: {
        command: '${PLUGIN_ROOT}/bin/wp',
        args: ['mcp'],
      },
    })

    expect(readJsonObject(join(repoRoot, 'hooks', 'hooks.json'))).toStrictEqual({
      hooks: {},
    })
  })

  it('pins Codex plugin artifacts in the dry-run package file list', () => {
    const packedPaths = getDryRunPackagePaths()
    expect(packedPaths).toEqual(expect.arrayContaining([...codexPluginArtifactPaths]))
  }, 30_000)

  it('keeps the package-surface denied-content policy regex-based and public-safe', () => {
    const rawContract = readFileSync(join(repoRoot, 'package-surface.json'), 'utf8')
    const contract = readJsonObject(join(repoRoot, 'package-surface.json')) as {
      staleLinks?: unknown
      tarball?: { forbiddenContentPatterns?: string[] }
    }

    expect(contract.staleLinks).toBe(undefined)
    expect(contract.tarball?.forbiddenContentPatterns).toEqual(
      expect.arrayContaining(['/ozby\\/ingest-lens/', '/webpresso\\/monorepo/']),
    )
    expect(rawContract).not.toContain('ozby/ingest-lens')
    expect(rawContract).not.toContain('webpresso/monorepo')
  })

  it('keeps Codex plugin artifacts free of denied public package content', () => {
    const contract = readJsonObject(join(repoRoot, 'package-surface.json')) as {
      tarball?: { forbiddenContentPatterns?: string[] }
    }
    const denied = [
      ...forbiddenPluginArtifactText,
      ...(contract.tarball?.forbiddenContentPatterns ?? []),
    ]
    const artifactText = codexPluginArtifactPaths
      .map((artifactPath) => readFileSync(join(repoRoot, artifactPath), 'utf8'))
      .join('\n')

    for (const value of denied) {
      expect(artifactText).not.toContain(value)
    }
  })

  it('documents session-continuity release gates for hook-bin and doc changes', () => {
    const docs = [
      'README.md',
      'docs/guides/session-memory.md',
      'docs/hook-matrix.md',
      'docs/hooks-doctor.md',
    ]
      .map((path) => readFileSync(join(repoRoot, path), 'utf8'))
      .join('\n')

    for (const command of [
      './bin/wp hooks doctor --skip-mcp',
      './bin/wp audit blueprint-lifecycle',
      './bin/wp audit reference-parity-matrix --json',
      './bin/wp audit package-surface',
      'npm pack --dry-run --json',
      'vp run lint:pkg',
      'vp run verify:secrets',
      './bin/wp audit secrets-policy',
      './bin/wp audit no-dev-vars',
      './bin/wp audit secret-provider-quarantine',
      './bin/wp audit secrets-config',
      'vp run verify:paths',
    ]) {
      expect(docs).toContain(command)
    }

    expect(docs).toContain('typed continuity events')
    expect(docs).toContain('Cursor/OpenCode degraded')
    expect(docs).not.toMatch(/drop[- ]?in replacement|100% parity|identical\s+lifecycle\s+depth/iu)
  })

  it('pins the shipped README session-memory tool contract to registered public tools', () => {
    const readme = readFileSync(join(repoRoot, 'README.md'), 'utf8')
    const documentedTools = [...new Set(readme.match(/\bwp_session_[a-z_]+\b/gu) ?? [])].sort()

    expect(documentedTools).toEqual([...sessionMemoryToolNames].sort())
    expect(readme).toContain('docs/guides/session-memory.md')
    expect(readme).toContain('local storage')
    expect(readme).toContain('bounded outputs')
    expect(readme).toContain('reset safety')
    expect(readme).toContain('non-goals')
    expect(readme).not.toMatch(/full.*replacement|drop[- ]?in.*replacement|100%.*parity/iu)
  })

  it('declares session-memory public docs as shipped package files', () => {
    const packageJson = readJsonObject(join(repoRoot, 'package.json')) as { files?: unknown }

    expect(packageJson.files).toEqual(expect.arrayContaining([...sessionMemoryPublicDocPaths]))
  })

  it('keeps the session-memory public contract intentional in the dry-run package file list', () => {
    const packedPaths = getDryRunPackagePaths()

    expect(packedPaths).toContain('README.md')
    expect(packedPaths).toEqual(expect.arrayContaining([...sessionMemoryPublicDocPaths]))
    expect(packedPaths).not.toEqual(
      expect.arrayContaining(['.env', '.dev.vars', '.agent', '.agents', '.omx', '.codex']),
    )
  })

  it('ships the registered session-memory MCP tool descriptors in the dry-run package file list', () => {
    const packedPaths = getDryRunPackagePaths()
    const expectedToolPaths = sessionMemoryToolNames.flatMap((toolName) => {
      const fileBase = toolName.replace(/^wp_/u, '').replaceAll('_', '-')
      return [`dist/esm/mcp/tools/${fileBase}.js`, `dist/esm/mcp/tools/${fileBase}.d.ts`]
    })

    expect(packedPaths).toEqual(expect.arrayContaining(expectedToolPaths))
  })

  it('preserves the existing reference plugin package surface', () => {
    const packageJson = readJsonObject(join(repoRoot, 'package.json')) as { files?: unknown }
    expect(packageJson.files).toEqual(expect.arrayContaining(['.claude-plugin']))

    const manifest = readJsonObject(join(repoRoot, '.claude-plugin', 'plugin.json'))
    expect(manifest).toMatchObject({
      name: 'agent-kit',
      skills: './skills',
      commands: './commands',
      mcpServers: {
        webpresso: {
          command: '${CLAUDE_PLUGIN_ROOT}/bin/wp',
          args: ['mcp'],
        },
      },
    })
    expect(Object.hasOwn(manifest, 'hooks')).toBe(false)
  })

  it('preserves an Elastic-2.0 license in the packed manifest', () => {
    const manifest = createPackedManifest(
      {
        name: '@webpresso/agent-kit',
        version: '1.0.0',
        license: 'Elastic-2.0',
      },
      { catalog: {} },
    ) as {
      license?: string
    }

    expect(manifest.license).toBe('Elastic-2.0')
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
      '@webpresso/agent-kit-session-memory-darwin-x64': '1.2.3',
      '@webpresso/agent-kit-session-memory-darwin-arm64': '1.2.3',
      '@webpresso/agent-kit-session-memory-linux-x64': '1.2.3',
      '@webpresso/agent-kit-session-memory-linux-arm64': '1.2.3',
      '@webpresso/agent-kit-session-memory-win32-x64': '1.2.3',
      '@webpresso/agent-kit-session-memory-win32-arm64': '1.2.3',
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

  it('fails prepack loudly when built blueprint migration SQL assets are missing from dist', () => {
    const fixtureDir = mkdtempSync(join(tmpdir(), 'wp-package-manifest-migration-assets-missing-'))
    const migrationSourceDir = join(fixtureDir, 'src', 'blueprint', 'db', 'migrations')
    const migrationDistDir = join(fixtureDir, 'dist', 'esm', 'blueprint', 'db', 'migrations')

    try {
      mkdirSync(migrationSourceDir, { recursive: true })
      writeFileSync(join(fixtureDir, 'pnpm-workspace.yaml'), 'catalog: {}\n', 'utf8')
      writeFileSync(
        join(fixtureDir, 'package.json'),
        `${JSON.stringify({ name: '@webpresso/agent-kit', version: '0.29.1' }, null, 2)}\n`,
        'utf8',
      )
      writeFileSync(join(migrationSourceDir, '0001_seed.sql'), 'CREATE TABLE blueprints();\n')
      writeFileSync(join(migrationSourceDir, '0002_request_id_ledger.sql'), 'CREATE TABLE x();\n')

      expect(() => preparePackedManifest(fixtureDir)).toThrow(
        /Missing or stale built blueprint migration SQL assets/u,
      )
      expect(readFileSync(join(fixtureDir, 'package.json'), 'utf8')).toBe(
        `${JSON.stringify({ name: '@webpresso/agent-kit', version: '0.29.1' }, null, 2)}\n`,
      )
      expect(existsSync(join(fixtureDir, '.package.json.prepack.backup'))).toBe(false)
      expect(existsSync(migrationDistDir)).toBe(false)
    } finally {
      rmSync(fixtureDir, { force: true, recursive: true })
    }
  })

  it('accepts prebuilt blueprint migration SQL assets without mutating them during packing', () => {
    const fixtureDir = mkdtempSync(join(tmpdir(), 'wp-package-manifest-migration-assets-ready-'))
    const migrationSourceDir = join(fixtureDir, 'src', 'blueprint', 'db', 'migrations')
    const migrationDistDir = join(fixtureDir, 'dist', 'esm', 'blueprint', 'db', 'migrations')

    try {
      mkdirSync(migrationSourceDir, { recursive: true })
      mkdirSync(migrationDistDir, { recursive: true })
      writeFileSync(join(fixtureDir, 'pnpm-workspace.yaml'), 'catalog: {}\n', 'utf8')
      writeFileSync(
        join(fixtureDir, 'package.json'),
        `${JSON.stringify({ name: '@webpresso/agent-kit', version: '0.29.1' }, null, 2)}\n`,
        'utf8',
      )
      writeFileSync(join(migrationSourceDir, '0001_seed.sql'), 'CREATE TABLE blueprints();\n')
      writeFileSync(join(migrationSourceDir, '0002_request_id_ledger.sql'), 'CREATE TABLE x();\n')
      writeFileSync(join(migrationDistDir, '0001_seed.sql'), 'CREATE TABLE blueprints();\n')
      writeFileSync(join(migrationDistDir, '0002_request_id_ledger.sql'), 'CREATE TABLE x();\n')
      writeFileSync(join(migrationDistDir, 'run.js'), 'export {};\n')

      preparePackedManifest(fixtureDir)
      expect(readFileSync(join(migrationDistDir, '0001_seed.sql'), 'utf8')).toContain(
        'CREATE TABLE blueprints',
      )
      expect(existsSync(join(migrationDistDir, '0002_request_id_ledger.sql'))).toBe(true)
      expect(existsSync(join(migrationDistDir, 'run.js'))).toBe(true)

      restorePackedManifest(fixtureDir)
      expect(existsSync(join(migrationDistDir, '0001_seed.sql'))).toBe(true)
      expect(existsSync(join(migrationDistDir, '0002_request_id_ledger.sql'))).toBe(true)
      expect(existsSync(join(migrationDistDir, 'run.js'))).toBe(true)
    } finally {
      rmSync(fixtureDir, { force: true, recursive: true })
    }
  })

  it('strips built sourceMappingURL comments for packing and restores them afterwards', () => {
    const fixtureDir = mkdtempSync(join(tmpdir(), 'wp-package-manifest-sourcemap-comments-'))
    const setupFilePath = join(fixtureDir, 'dist', 'esm', 'config', 'vitest', 'node-setup.js')
    const declarationFilePath = join(
      fixtureDir,
      'dist',
      'esm',
      'config',
      'vitest',
      'node-setup.d.ts',
    )
    const setupWithMap =
      'export const __nodeSetupModule = true;\n//# sourceMappingURL=node-setup.js.map\n'
    const declarationWithMap =
      'export declare const __nodeSetupModule = true;\n//# sourceMappingURL=node-setup.d.ts.map\n'

    try {
      mkdirSync(join(fixtureDir, 'dist', 'esm', 'config', 'vitest'), { recursive: true })
      writeFileSync(join(fixtureDir, 'pnpm-workspace.yaml'), 'catalog: {}\n', 'utf8')
      writeFileSync(
        join(fixtureDir, 'package.json'),
        `${JSON.stringify({ name: '@webpresso/agent-kit', version: '0.29.2' }, null, 2)}\n`,
        'utf8',
      )
      writeFileSync(setupFilePath, setupWithMap, 'utf8')
      writeFileSync(declarationFilePath, declarationWithMap, 'utf8')

      preparePackedManifest(fixtureDir)
      expect(readFileSync(setupFilePath, 'utf8')).toBe('export const __nodeSetupModule = true;\n')
      expect(readFileSync(declarationFilePath, 'utf8')).toBe(
        'export declare const __nodeSetupModule = true;\n',
      )

      restorePackedManifest(fixtureDir)
      expect(readFileSync(setupFilePath, 'utf8')).toBe(setupWithMap)
      expect(readFileSync(declarationFilePath, 'utf8')).toBe(declarationWithMap)
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
      const prepared = JSON.parse(readFileSync(join(fixtureDir, 'package.json'), 'utf8')) as {
        optionalDependencies?: Record<string, string>
      }
      expect(prepared.optionalDependencies).toMatchObject({
        existing: '^1.0.0',
        '@webpresso/agent-kit-runtime-darwin-arm64': '1.2.3',
        '@webpresso/agent-kit-runtime-darwin-x64': '1.2.3',
        '@webpresso/agent-kit-runtime-linux-x64': '1.2.3',
        '@webpresso/agent-kit-runtime-linux-arm64': '1.2.3',
        '@webpresso/agent-kit-runtime-windows-x64': '1.2.3',
        '@webpresso/agent-kit-session-memory-darwin-x64': '1.2.3',
        '@webpresso/agent-kit-session-memory-darwin-arm64': '1.2.3',
        '@webpresso/agent-kit-session-memory-linux-x64': '1.2.3',
        '@webpresso/agent-kit-session-memory-linux-arm64': '1.2.3',
        '@webpresso/agent-kit-session-memory-win32-x64': '1.2.3',
        '@webpresso/agent-kit-session-memory-win32-arm64': '1.2.3',
      })

      restorePackedManifest(fixtureDir)
      const restored = JSON.parse(readFileSync(join(fixtureDir, 'package.json'), 'utf8')) as {
        optionalDependencies?: Record<string, string>
      }
      expect(restored.optionalDependencies).toEqual({ existing: '^1.0.0' })
    } finally {
      rmSync(fixtureDir, { force: true, recursive: true })
    }
  })

  it('fails prepack before rewriting package.json when catalog resolution produces a local protocol', () => {
    const fixtureDir = mkdtempSync(join(tmpdir(), 'wp-package-manifest-local-protocol-'))
    const linkUrlSpecifier = `${'link:'}//../local`
    const originalPackageJson = `${JSON.stringify(
      {
        name: '@webpresso/agent-kit',
        version: '1.2.3',
        dependencies: { local: 'catalog:' },
      },
      null,
      2,
    )}\n`

    try {
      writeFileSync(
        join(fixtureDir, 'pnpm-workspace.yaml'),
        `catalog:\n  local: ${linkUrlSpecifier}\n`,
        'utf8',
      )
      writeFileSync(join(fixtureDir, 'package.json'), originalPackageJson, 'utf8')

      expect(() => preparePackedManifest(fixtureDir)).toThrow(
        `Cannot pack dependencies.local with non-publishable link: specifier ${JSON.stringify(linkUrlSpecifier)}`,
      )
      expect(readFileSync(join(fixtureDir, 'package.json'), 'utf8')).toBe(originalPackageJson)
      expect(existsSync(join(fixtureDir, '.package.json.prepack.backup'))).toBe(false)
    } finally {
      rmSync(fixtureDir, { force: true, recursive: true })
    }
  })
})
