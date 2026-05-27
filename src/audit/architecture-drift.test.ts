import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'

import { auditArchitectureDrift } from './architecture-drift.js'

function write(root: string, rel: string, content: string): void {
  const target = join(root, rel)
  mkdirSync(join(target, '..'), { recursive: true })
  writeFileSync(target, content)
}

function contractJson(value: object): string {
  return JSON.stringify(value, null, 2)
}

describe('auditArchitectureDrift', () => {
  let dirs: string[] = []

  beforeEach(() => {
    dirs = []
  })

  afterEach(() => {
    for (const dir of dirs) rmSync(dir, { recursive: true, force: true })
  })

  function tmp(): string {
    const dir = mkdtempSync(join(tmpdir(), 'wp-architecture-drift-'))
    dirs.push(dir)
    return dir
  }

  it('passes when no architecture contract exists', () => {
    const root = tmp()

    const result = auditArchitectureDrift(root)

    expect(result.ok).toBe(true)
    expect(result.checked).toBe(0)
  })

  it('fails when a required architecture doc is missing', () => {
    const root = tmp()
    write(
      root,
      'docs/architecture.contract.json',
      contractJson({ version: 1, architectureDocs: ['docs/architecture.md'] }),
    )

    const result = auditArchitectureDrift(root)

    expect(result.ok).toBe(false)
    expect(result.violations[0]?.message).toContain('required architecture file missing')
  })

  it('enforces mustContain and mustNotContain contract rules', () => {
    const root = tmp()
    write(root, 'docs/architecture.md', '# Architecture\nCloudflare Worker\n')
    write(root, 'src/index.ts', 'export const runtime = "workers.dev"\n')
    write(
      root,
      'docs/architecture.contract.json',
      contractJson({
        version: 1,
        architectureDocs: ['docs/architecture.md'],
        rules: [
          {
            id: 'deployment-domain',
            paths: ['docs/architecture.md'],
            mustContain: ['edge-matte.ozby.dev'],
          },
          {
            id: 'no-workers-dev',
            paths: ['src/**/*.ts'],
            mustNotContain: ['workers.dev'],
          },
        ],
      }),
    )

    const result = auditArchitectureDrift(root)

    expect(result.ok).toBe(false)
    expect(result.violations.map((v) => v.message).join('\n')).toContain('deployment-domain')
    expect(result.violations.map((v) => v.message).join('\n')).toContain('no-workers-dev')
  })

  it('requires active blueprints to link architecture docs', () => {
    const root = tmp()
    write(root, 'docs/architecture.md', '# Architecture\n')
    write(
      root,
      'blueprints/planned/new-flow.md',
      '---\ntype: blueprint\nstatus: planned\n---\n# New Flow\n\nChange Worker routes.\n',
    )
    write(
      root,
      'docs/architecture.contract.json',
      contractJson({
        version: 1,
        architectureDocs: ['docs/architecture.md'],
        blueprintPolicy: { enabled: true, requireArchitectureLinks: true },
      }),
    )

    const result = auditArchitectureDrift(root)

    expect(result.ok).toBe(false)
    expect(result.violations[0]?.file).toBe('blueprints/planned/new-flow.md')
    expect(result.violations[0]?.message).toContain('docs/architecture.md')
    expect(result.violations[0]?.message).toContain('docs/architecture.contract.json')
  })

  it('requires before/after sections for architecture-changing blueprints', () => {
    const root = tmp()
    write(root, 'docs/architecture.md', '# Architecture\n')
    write(
      root,
      'blueprints/planned/architecture-change.md',
      [
        '---',
        'type: blueprint',
        'status: planned',
        '---',
        '# Architecture Change',
        '',
        'Architecture docs: [docs/architecture.md](../../docs/architecture.md)',
        'Contract: [docs/architecture.contract.json](../../docs/architecture.contract.json)',
        '',
        'This changes runtime topology and deployment.',
      ].join('\n'),
    )
    write(
      root,
      'docs/architecture.contract.json',
      contractJson({
        version: 1,
        architectureDocs: ['docs/architecture.md'],
        blueprintPolicy: {
          enabled: true,
          requireArchitectureLinks: true,
          requireBeforeAfterWhenArchitectureChanging: true,
        },
      }),
    )

    const result = auditArchitectureDrift(root)

    expect(result.ok).toBe(false)
    expect(result.violations.map((v) => v.message)).toEqual(
      expect.arrayContaining([
        'architecture-changing blueprint must include "Architecture before"',
        'architecture-changing blueprint must include "Architecture after"',
      ]),
    )
  })

  it('passes when a blueprint links docs and records before/after architecture', () => {
    const root = tmp()
    write(root, 'docs/architecture.md', '# Architecture\n')
    write(
      root,
      'blueprints/planned/architecture-change.md',
      [
        '---',
        'type: blueprint',
        'status: planned',
        '---',
        '# Architecture Change',
        '',
        'Architecture docs: [docs/architecture.md](../../docs/architecture.md)',
        'Contract: [docs/architecture.contract.json](../../docs/architecture.contract.json)',
        '',
        '## Architecture before',
        '',
        'One Worker.',
        '',
        '## Architecture after',
        '',
        'One Worker with a new adapter.',
      ].join('\n'),
    )
    write(
      root,
      'docs/architecture.contract.json',
      contractJson({
        version: 1,
        architectureDocs: ['docs/architecture.md'],
        blueprintPolicy: {
          enabled: true,
          requireArchitectureLinks: true,
          requireBeforeAfterWhenArchitectureChanging: true,
        },
      }),
    )

    const result = auditArchitectureDrift(root)

    expect(result.ok).toBe(true)
    expect(result.violations).toHaveLength(0)
  })

  it('passes when a blueprint links both architecture docs but is not architecture-changing', () => {
    const root = tmp()
    write(root, 'docs/architecture.md', '# Architecture\n')
    write(
      root,
      'blueprints/planned/docs-refresh.md',
      [
        '---',
        'type: blueprint',
        'status: planned',
        '---',
        '# Docs refresh',
        '',
        'Architecture docs: [docs/architecture.md](../../docs/architecture.md)',
        'Contract: [docs/architecture.contract.json](../../docs/architecture.contract.json)',
        '',
        'Refresh reviewer docs and tighten links.',
      ].join('\n'),
    )
    write(
      root,
      'docs/architecture.contract.json',
      contractJson({
        version: 1,
        architectureDocs: ['docs/architecture.md'],
        blueprintPolicy: {
          enabled: true,
          requireArchitectureLinks: true,
          requireBeforeAfterWhenArchitectureChanging: true,
        },
      }),
    )

    const result = auditArchitectureDrift(root)

    expect(result.ok).toBe(true)
    expect(result.violations).toHaveLength(0)
  })
})
