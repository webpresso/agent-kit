import { mkdtempSync, mkdirSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { describe, expect, test } from 'vitest'

import {
  auditBlueprintLifecycle,
  auditCatalogDrift,
  auditDocsFrontmatter,
  formatRepoAuditReport,
  validateCommitMessage,
} from './repo-guardrails.js'

function tempRepo() {
  return mkdtempSync(join(tmpdir(), 'agent-kit-repo-audit-'))
}

function writeJson(path: string, value: unknown) {
  writeFileSync(path, `${JSON.stringify(value, null, 2)}\n`)
}

describe('repo guardrail audits', () => {
  test('catalog drift finds repeated explicit dependency versions across glob and exact workspaces', () => {
    const root = tempRepo()
    mkdirSync(join(root, 'packages', 'api'), { recursive: true })
    mkdirSync(join(root, 'packages', 'ui'), { recursive: true })
    mkdirSync(join(root, 'infra'), { recursive: true })
    writeFileSync(
      join(root, 'pnpm-workspace.yaml'),
      [
        'packages:',
        '  - packages/*',
        '  - infra',
        'catalog:',
        '  react: ^19.0.0',
        '  zod: ^4.0.0',
        '',
      ].join('\n'),
    )
    writeJson(join(root, 'packages', 'api', 'package.json'), {
      name: '@repo/api',
      dependencies: {
        '@webpresso/typescript-config': 'file:/Users/example/webpresso-typescript-config-0.1.0.tgz',
        react: '^19.0.0',
        zod: 'workspace:*',
      },
    })
    writeJson(join(root, 'packages', 'ui', 'package.json'), {
      name: '@repo/ui',
      dependencies: {
        '@webpresso/typescript-config': 'file:/Users/example/webpresso-typescript-config-0.1.0.tgz',
        react: 'catalog:',
        zod: 'workspace:*',
      },
      peerDependencies: { react: '>=19' },
    })
    writeJson(join(root, 'infra', 'package.json'), {
      name: '@repo/infra',
      devDependencies: { react: '^19.0.0' },
    })

    const result = auditCatalogDrift(root)

    expect(result.ok).toBe(false)
    expect(result.violations).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          file: 'packages/api/package.json',
          message: expect.stringContaining('react'),
        }),
        expect.objectContaining({
          file: 'infra/package.json',
          message: expect.stringContaining('react'),
        }),
      ]),
    )
    expect(result.violations.some((violation) => violation.message.includes('zod'))).toBe(false)
    expect(result.violations.some((violation) => violation.message.includes('file:'))).toBe(false)
    expect(result.violations.some((violation) => violation.message.includes('>=19'))).toBe(false)
  })

  test('commit message audit keeps conventional commits loose but enforces lore trailers when requested by subject', () => {
    expect(
      validateCommitMessage(
        [
          'feat(agent-kit): share repo audits [lore]',
          '',
          'Move repeated repo validation into Agent Kit.',
          '',
          'Confidence: high',
          'Directive: Keep repo-specific policy in options instead of hard-coding consumers',
          '',
        ].join('\n'),
      ).ok,
    ).toBe(true)

    const result = validateCommitMessage(
      [
        'feat(agent-kit): share repo audits [lore]',
        '',
        'Move repeated repo validation into Agent Kit.',
        '',
        'Directive: Keep repo-specific policy in options instead of hard-coding consumers',
        '',
      ].join('\n'),
    )

    expect(result.ok).toBe(false)
    expect(formatRepoAuditReport(result)).toContain('Confidence:')
  })

  test('docs frontmatter audit validates required metadata and folder type contracts', () => {
    const root = tempRepo()
    mkdirSync(join(root, 'docs', 'research'), { recursive: true })
    mkdirSync(join(root, 'docs', 'templates'), { recursive: true })
    writeFileSync(
      join(root, 'docs', 'research', 'wrong-type.md'),
      ['---', 'type: guide', 'last_updated: 2026-04-23', '---', '# Research'].join('\n'),
    )
    writeFileSync(
      join(root, 'docs', 'templates', 'missing-date.md'),
      ['---', 'type: template', '---', '# Template'].join('\n'),
    )
    writeFileSync(
      join(root, 'docs', 'templates', 'blueprint-template.md'),
      ['---', 'type: blueprint', 'last_updated: 2026-04-23', '---', '# Blueprint Template'].join(
        '\n',
      ),
    )

    const result = auditDocsFrontmatter(root)

    expect(result.ok).toBe(false)
    expect(result.violations).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          file: 'docs/research/wrong-type.md',
          message: expect.stringContaining('type'),
        }),
        expect.objectContaining({
          file: 'docs/templates/missing-date.md',
          message: expect.stringContaining('last_updated'),
        }),
      ]),
    )
    expect(
      result.violations.some(
        (violation) => violation.file === 'docs/templates/blueprint-template.md',
      ),
    ).toBe(false)
  })

  test('blueprint lifecycle audit preserves legacy .omx contract and lifecycle checks', () => {
    const root = tempRepo()
    mkdirSync(join(root, '.omx', 'plans'), { recursive: true })
    writeFileSync(join(root, '.omx', 'plans', 'prd-route-split.md'), '# PRD: Route split\n')
    writeFileSync(
      join(root, '.omx', 'plans', 'test-spec-route-split.md'),
      '# Test Spec: Route split\n',
    )

    const missingLegacy = auditBlueprintLifecycle(root, {
      includeLegacyOmx: true,
    })

    expect(missingLegacy.ok).toBe(false)
    expect(missingLegacy.violations).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          message: 'Missing .omx/contracts directory',
        }),
        expect.objectContaining({
          message: 'Missing .omx/state/lifecycle directory',
        }),
        expect.objectContaining({
          message: 'Missing workspace boundary contract',
        }),
        expect.objectContaining({
          message: 'Missing at least one lifecycle artifact under .omx/state/lifecycle',
        }),
      ]),
    )

    mkdirSync(join(root, '.omx', 'contracts'), { recursive: true })
    mkdirSync(join(root, '.omx', 'state', 'lifecycle'), { recursive: true })
    writeFileSync(
      join(root, '.omx', 'contracts', 'workspace-boundary-contract.md'),
      ['# Workspace boundary contract', '', '## Workspace classifications', ''].join('\n'),
    )
    writeFileSync(
      join(root, '.omx', 'state', 'lifecycle', 'route-split.json'),
      JSON.stringify({ slug: 'route-split', status: 'planned', artifacts: {} }),
    )

    expect(auditBlueprintLifecycle(root, { includeLegacyOmx: true }).ok).toBe(true)
  })

  test('blueprint lifecycle audit enforces folder/status agreement and required overview files', () => {
    const root = tempRepo()
    mkdirSync(join(root, 'blueprints', 'planned', 'split-routes'), {
      recursive: true,
    })
    mkdirSync(join(root, 'blueprints', 'completed', 'missing-overview'), {
      recursive: true,
    })
    writeFileSync(
      join(root, 'blueprints', 'planned', 'split-routes', '_overview.md'),
      ['---', 'type: blueprint', 'status: completed', '---', '# Split Routes'].join('\n'),
    )

    const result = auditBlueprintLifecycle(root)

    expect(result.ok).toBe(false)
    expect(result.violations).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          file: 'blueprints/planned/split-routes/_overview.md',
          message: expect.stringContaining('planned'),
        }),
        expect.objectContaining({
          file: 'blueprints/completed/missing-overview/_overview.md',
          message: expect.stringContaining('Missing'),
        }),
      ]),
    )
  })
})
