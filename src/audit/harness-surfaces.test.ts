import { mkdirSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'

import { auditHarnessSurfaces, readHarnessSurfacesManifest } from './harness-surfaces.js'

function makeTempDir(): string {
  return join(
    tmpdir(),
    `wp-audit-harness-surfaces-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
  )
}

function write(root: string, path: string, contents = 'export {}\n'): void {
  mkdirSync(join(root, path, '..'), { recursive: true })
  writeFileSync(join(root, path), contents)
}

function mkdir(root: string, path: string): void {
  mkdirSync(join(root, path), { recursive: true })
}

function seedCompleteManifestRepo(root: string): void {
  mkdir(root, 'catalog/agent')
  for (const directory of [
    'src/hooks',
    'src/hooks/pretool-guard',
    'src/hooks/pretool-guard/validators',
    'catalog/agent/agents',
    'catalog/agent/rules',
    'catalog/agent/skills',
    'catalog/agent/harness-gate',
    'scripts/bench/harness-gate',
    '.github/workflows',
    '.omx/ultragoal',
    'src/blueprint/execution',
    'src/secret-gate',
    'src/runtime',
    'src/audit',
    'src/symlinker',
    'bin',
  ]) {
    mkdir(root, directory)
  }
  for (const path of [
    'catalog/AGENTS.md.tpl',
    'src/audit/hook-surface.ts',
    'src/hooks/pretool-guard/index.ts',
    'src/audit/hook-vendor-drift.ts',
    'src/hooks/doctor.ts',
    'src/audit/agents.ts',
    'src/symlinker/index.ts',
    'src/hooks/pretool-guard/runner.ts',
    'src/hooks/pretool-guard/dev-routing.ts',
    'src/hooks/pretool-guard/validators/dangerous-commands.ts',
    'src/hooks/pretool-guard/validators/forbidden-commands.ts',
    'src/secret-gate/runner.ts',
    'src/runtime/with-secrets-cli.ts',
    'src/audit/secrets-policy.ts',
    'src/blueprint/execution/progress-bridge.ts',
    'scripts/bench/harness-gate/index.ts',
    'bin/with-secrets',
    'AGENTS.md',
  ]) {
    write(root, path)
  }
  write(root, '.github/workflows/harness-gate.yml', completeWorkflow())
  writeHarnessManifest(root, completeManifest())
}

function writeHarnessManifest(root: string, contents: string): void {
  mkdir(root, 'catalog/agent')
  writeFileSync(join(root, 'catalog', 'agent', 'harness-surfaces.yaml'), contents)
}

function completeWorkflow(): string {
  return (
    [
      'name: Harness Selection Gate (planned-only)',
      'on:',
      '  pull_request:',
      '    paths:',
      "      - 'catalog/agent/harness-surfaces.yaml'",
      "      - 'catalog/agent/harness-gate/**'",
      "      - 'catalog/AGENTS.md.tpl'",
      "      - 'catalog/agent/agents/**'",
      "      - 'catalog/agent/rules/**'",
      "      - 'catalog/agent/skills/**'",
      "      - 'AGENTS.md'",
      "      - 'src/audit/**'",
      "      - 'src/secret-gate/**'",
      "      - 'src/runtime/with-secrets-cli.ts'",
      "      - 'bin/with-secrets'",
      "      - 'src/blueprint/execution/progress-bridge.ts'",
      "      - 'src/hooks/**'",
      "      - 'src/symlinker/**'",
      "      - 'scripts/bench/harness-gate/**'",
      "      - '.github/workflows/**'",
    ].join('\n') + '\n'
  )
}

function completeManifest(): string {
  return (
    [
      'version: 1',
      'surfaces:',
      surface(
        'codex-hooks',
        'agent-kit',
        'hook',
        'locked',
        ['src/hooks'],
        ['src/audit/hook-surface.ts'],
      ),
      surface(
        'claude-hooks',
        'agent-kit',
        'hook',
        'locked',
        ['src/hooks'],
        ['src/audit/hook-vendor-drift.ts'],
      ),
      surface(
        'generated-agent-surfaces',
        'agent-kit',
        'generated-surface',
        'locked',
        [
          'catalog/AGENTS.md.tpl',
          'catalog/agent/agents',
          'catalog/agent/rules',
          'catalog/agent/skills',
        ],
        ['src/audit/agents.ts'],
      ),
      surface(
        'permission-policy',
        'agent-kit',
        'policy',
        'locked',
        ['src/hooks/pretool-guard'],
        ['src/hooks/pretool-guard/runner.ts'],
      ),
      surface(
        'secret-gate',
        'agent-kit',
        'secret-gate',
        'locked',
        ['src/secret-gate', 'bin/with-secrets'],
        ['src/secret-gate/runner.ts'],
      ),
      surface(
        'omx-runtime-state',
        'oh-my-codex',
        'runtime-state',
        'governed',
        ['.omx/ultragoal', 'src/blueprint/execution/progress-bridge.ts'],
        ['AGENTS.md'],
      ),
      surface(
        'harness-regression-gate',
        'agent-kit',
        'regression-gate',
        'governed',
        ['catalog/agent/harness-gate', 'scripts/bench/harness-gate'],
        ['catalog/agent/harness-surfaces.yaml'],
      ),
      surface(
        'agent-overlays',
        'agent-kit',
        'overlay',
        'experimental',
        ['src/symlinker'],
        ['catalog/agent/harness-surfaces.yaml'],
      ),
    ].join('\n') + '\n'
  )
}

function surface(
  id: string,
  owner: string,
  kind: string,
  lifecycle: string,
  paths: string[],
  evidence: string[],
): string {
  return [
    `  - id: ${id}`,
    `    title: ${id}`,
    `    owner: ${owner}`,
    `    kind: ${kind}`,
    `    lifecycle: ${lifecycle}`,
    '    paths:',
    ...paths.flatMap((path) => [`      - path: ${path}`, '        status: concrete']),
    '    triggers:',
    '      - wp setup',
    '    evidence:',
    ...evidence.map((path) => `      - ${path}`),
  ].join('\n')
}

describe('harness surface manifest audit', () => {
  let root: string

  beforeEach(() => {
    root = makeTempDir()
    mkdirSync(root, { recursive: true })
  })

  afterEach(async () => {
    await import('node:fs/promises').then((fs) => fs.rm(root, { recursive: true, force: true }))
  })

  it('reads typed surfaces from yaml', () => {
    seedCompleteManifestRepo(root)

    const manifest = readHarnessSurfacesManifest(root)

    expect(manifest.version).toBe(1)
    expect(manifest.surfaces[0]).toMatchObject({
      id: 'codex-hooks',
      kind: 'hook',
      lifecycle: 'locked',
      paths: [{ path: 'src/hooks', status: 'concrete' }],
    })
  })

  it('reports missing manifest', () => {
    const result = auditHarnessSurfaces(root)

    expect(result.ok).toBe(false)
    expect(result.violations[0]).toEqual({
      file: 'catalog/agent/harness-surfaces.yaml',
      message: 'Missing canonical harness surface manifest.',
    })
  })

  it('reports invalid lifecycle, owner, and path shape rows summary-first', () => {
    writeHarnessManifest(
      root,
      [
        'version: 1',
        'surfaces:',
        '  - id: codex-hooks',
        '    title: Codex hook runtime',
        '    owner: kit',
        '    kind: hook',
        '    lifecycle: editable',
        '    paths:',
        '      - src/hooks',
        '    triggers:',
        '      - wp setup',
        '    evidence:',
        '      - src/hooks/index.ts',
      ].join('\n') + '\n',
    )

    const result = auditHarnessSurfaces(root)

    expect(result.ok).toBe(false)
    expect(result.violations[0]?.file).toBe('catalog/agent/harness-surfaces.yaml')
    expect(result.violations[0]?.message).toMatch(/^Invalid harness surface manifest: /u)
  })

  it('requires canonical surface ids in the repo manifest', () => {
    mkdir(root, 'src/hooks')
    write(root, 'src/hooks/index.ts')
    writeHarnessManifest(
      root,
      [
        'version: 1',
        'surfaces:',
        surface(
          'codex-hooks',
          'agent-kit',
          'hook',
          'locked',
          ['src/hooks'],
          ['src/hooks/index.ts'],
        ),
      ].join('\n') + '\n',
    )

    const result = auditHarnessSurfaces(root)

    expect(result.ok).toBe(false)
    expect(result.violations.map((v) => v.message)).toContain(
      'Missing required harness surface id: claude-hooks',
    )
    expect(result.violations.map((v) => v.message)).toContain(
      'Missing required harness surface id: generated-agent-surfaces',
    )
    expect(result.violations.map((v) => v.message)).toContain(
      'Missing required harness surface id: permission-policy',
    )
    expect(result.violations.map((v) => v.message)).toContain(
      'Missing required harness surface id: secret-gate',
    )
  })

  it('fails when a declared concrete path is missing', () => {
    seedCompleteManifestRepo(root)
    writeHarnessManifest(
      root,
      completeManifest().replace('      - path: src/hooks\n', '      - path: src/missing-hooks\n'),
    )

    const result = auditHarnessSurfaces(root)

    expect(result.ok).toBe(false)
    expect(result.violations.map((v) => v.message)).toContain(
      'codex-hooks references missing concrete path: src/missing-hooks',
    )
  })

  it('allows projected paths to be absent', () => {
    seedCompleteManifestRepo(root)
    writeHarnessManifest(
      root,
      completeManifest().replace(
        '      - path: src/hooks\n        status: concrete',
        '      - path: bin/wp-pretool-guard\n        status: projected',
      ),
    )

    const result = auditHarnessSurfaces(root)

    expect(result.violations.map((v) => v.message)).not.toContain(
      'codex-hooks references missing concrete path: bin/wp-pretool-guard',
    )
  })

  it('fails when a present bounded harness root is undeclared', () => {
    seedCompleteManifestRepo(root)
    writeHarnessManifest(
      root,
      completeManifest().replace(
        '      - path: catalog/agent/harness-gate\n        status: concrete\n      - path: scripts/bench/harness-gate\n        status: concrete',
        '      - path: scripts/bench/harness-gate\n        status: concrete',
      ),
    )

    const result = auditHarnessSurfaces(root)

    expect(result.ok).toBe(false)
    expect(result.violations.map((v) => v.message)).toContain(
      'Present harness root is not declared for harness-regression-gate: catalog/agent/harness-gate',
    )
  })

  it('treats the unquoted GitHub Actions on key as a workflow trigger map', () => {
    seedCompleteManifestRepo(root)

    const result = auditHarnessSurfaces(root)

    expect(result.violations.map((v) => v.message)).not.toContain(
      'Harness gate workflow pull_request.paths must be a non-empty list.',
    )
  })

  it('fails when workflow path filters do not cover concrete manifest paths', () => {
    seedCompleteManifestRepo(root)
    write(
      root,
      '.github/workflows/harness-gate.yml',
      completeWorkflow().replace("      - 'src/secret-gate/**'\n", ''),
    )

    const result = auditHarnessSurfaces(root)

    expect(result.ok).toBe(false)
    expect(result.violations.map((v) => v.message)).toContain(
      'Harness gate workflow pull_request.paths does not cover manifest path: src/secret-gate',
    )
    expect(result.violations.map((v) => v.file)).toContain('.github/workflows/harness-gate.yml')
  })

  it('fails when permanently locked ids are downgraded', () => {
    seedCompleteManifestRepo(root)
    writeHarnessManifest(
      root,
      completeManifest().replace('    lifecycle: locked', '    lifecycle: governed'),
    )

    const result = auditHarnessSurfaces(root)

    expect(result.ok).toBe(false)
    expect(result.violations.map((v) => v.message)).toContain(
      'codex-hooks is permanently locked and must use lifecycle: locked',
    )
  })
})
