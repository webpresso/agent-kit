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

function seedManifestRepo(root: string): void {
  mkdirSync(join(root, 'catalog', 'agent'), { recursive: true })
  mkdirSync(join(root, 'src', 'hooks'), { recursive: true })
  writeFileSync(join(root, 'src', 'hooks', 'index.ts'), 'export {}\n')
  writeFileSync(
    join(root, 'catalog', 'agent', 'harness-surfaces.yaml'),
    [
      'version: 1',
      'surfaces:',
      '  - id: codex-hooks',
      '    title: Codex hook runtime',
      '    owner: agent-kit',
      '    kind: hook',
      '    lifecycle: locked',
      '    paths:',
      '      - src/hooks',
      '    triggers:',
      '      - wp setup',
      '    evidence:',
      '      - src/hooks/index.ts',
    ].join('\n') + '\n',
  )
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
    seedManifestRepo(root)

    const manifest = readHarnessSurfacesManifest(root)

    expect(manifest.version).toBe(1)
    expect(manifest.surfaces[0]).toMatchObject({
      id: 'codex-hooks',
      kind: 'hook',
      lifecycle: 'locked',
    })
  })

  it('reports missing manifest', () => {
    const result = auditHarnessSurfaces(root)

    expect(result.ok).toBe(false)
    expect(result.violations[0]?.message).toContain('Missing canonical harness surface manifest')
  })

  it('reports schema and path violations summary-first', () => {
    mkdirSync(join(root, 'catalog', 'agent'), { recursive: true })
    writeFileSync(
      join(root, 'catalog', 'agent', 'harness-surfaces.yaml'),
      'version: 1\nsurfaces:\n  - id: Bad\n    title: Missing fields\n',
    )

    const result = auditHarnessSurfaces(root)

    expect(result.ok).toBe(false)
    expect(result.violations[0]?.file).toBe('catalog/agent/harness-surfaces.yaml')
    expect(result.violations[0]?.message).toContain('Invalid harness surface manifest')
  })

  it('requires canonical surface ids in the repo manifest', () => {
    seedManifestRepo(root)

    const result = auditHarnessSurfaces(root)

    expect(result.ok).toBe(false)
    expect(result.violations.map((v) => v.message)).toContain(
      'Missing required harness surface id: claude-hooks',
    )
  })
})
