import { mkdtempSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { describe, expect, test } from 'vitest'
import type { RepoAuditViolation } from './repo-guardrails.js'

import {
  auditBlueprintLifecycle,
  auditCatalogDrift,
  auditDocsFrontmatter,
  auditNoRelativeParentImports,
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
    expect(
      result.violations.some((violation: RepoAuditViolation) => violation.message.includes('zod')),
    ).toBe(false)
    expect(
      result.violations.some((violation: RepoAuditViolation) =>
        violation.message.includes('file:'),
      ),
    ).toBe(false)
    expect(
      result.violations.some((violation: RepoAuditViolation) => violation.message.includes('>=19')),
    ).toBe(false)
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

  test('validateCommitMessage rejects empty subject', () => {
    const result = validateCommitMessage('\n\nbody\n')
    expect(result.ok).toBe(false)
    expect(result.violations[0].message).toContain('required')
  })

  test('validateCommitMessage accepts merge and revert commits', () => {
    expect(validateCommitMessage('Merge branch main').ok).toBe(true)
    expect(validateCommitMessage('Revert "old commit"').ok).toBe(true)
    expect(validateCommitMessage('fixup! WIP commit').ok).toBe(true)
    expect(validateCommitMessage('squash! old commit').ok).toBe(true)
  })

  test('validateCommitMessage rejects subject too long', () => {
    const longSubject = 'feat(agent-kit): ' + 'a'.repeat(120)
    const result = validateCommitMessage(longSubject, { subjectMaxLength: 100 })
    expect(result.ok).toBe(false)
    expect(result.violations[0].message).toContain('100')
  })

  test('validateCommitMessage warns on missing blank second line', () => {
    const result = validateCommitMessage(['feat: do something', 'body content'].join('\n'))
    expect(result.ok).toBe(false)
    expect(result.violations.some((v) => v.message.includes('blank'))).toBe(true)
  })

  test('validateCommitMessage enforces lore trailers when subject includes [lore]', () => {
    const result = validateCommitMessage(
      ['feat(agent-kit): share repo audits [lore]', '', 'Move repeated repo validation.'].join(
        '\n',
      ),
    )
    expect(result.ok).toBe(false)
  })

  test('validateCommitMessage enforces lore trailers when requireLore is true', () => {
    const result = validateCommitMessage(
      ['feat(agent-kit): something', '', 'Regular commit without lore.'].join('\n'),
      { requireLore: true },
    )
    expect(result.ok).toBe(false)
  })

  test('auditCatalogDrift returns ok when no workspace file exists', () => {
    const root = tempRepo()
    const result = auditCatalogDrift(root)
    expect(result.ok).toBe(true)
    expect(result.title).toContain('single package')
  })

  test('auditDocsFrontmatter --fix prepends missing frontmatter for bare docs', () => {
    const root = tempRepo()
    mkdirSync(join(root, 'docs'), { recursive: true })
    const file = join(root, 'docs', 'guide.md')
    writeFileSync(file, '# Hello\n')

    const result = auditDocsFrontmatter(root, { fix: true, today: '2026-05-06' })

    expect(result.ok).toBe(true)
    expect(readFileSync(file, 'utf8')).toContain(
      "# TODO: classify type — auto-set by ak\ntype: guide\nlast_updated: '2026-05-06'",
    )
  })

  test('auditDocsFrontmatter --fix adds only missing fields inside existing frontmatter', () => {
    const root = tempRepo()
    mkdirSync(join(root, 'docs', 'research'), { recursive: true })
    const file = join(root, 'docs', 'research', 'note.md')
    writeFileSync(file, '---\ntype: research\n---\n\nBody\n')

    const result = auditDocsFrontmatter(root, { fix: true, today: '2026-05-06' })

    expect(result.ok).toBe(true)
    expect(readFileSync(file, 'utf8')).toContain("type: research\nlast_updated: '2026-05-06'")
    expect(readFileSync(file, 'utf8')).not.toContain('type: guide')
  })

  test('auditDocsFrontmatter --fix is idempotent', () => {
    const root = tempRepo()
    mkdirSync(join(root, 'docs'), { recursive: true })
    const file = join(root, 'docs', 'guide.md')
    writeFileSync(file, '# Hello\n')

    auditDocsFrontmatter(root, { fix: true, today: '2026-05-06' })
    const once = readFileSync(file, 'utf8')
    auditDocsFrontmatter(root, { fix: true, today: '2026-05-06' })
    const twice = readFileSync(file, 'utf8')

    expect(twice).toBe(once)
  })

  test('auditCatalogDrift returns ok for empty workspace', () => {
    const root = tempRepo()
    writeFileSync(join(root, 'pnpm-workspace.yaml'), 'packages:\n  - packages/*\n')
    const result = auditCatalogDrift(root)
    expect(result.ok).toBe(true)
  })

  test('auditDocsFrontmatter returns ok when docs dir does not exist', () => {
    const root = tempRepo()
    const result = auditDocsFrontmatter(root)
    expect(result.ok).toBe(true)
  })

  test('auditBlueprintLifecycle without legacy omx skips legacy checks', () => {
    const root = tempRepo()
    mkdirSync(join(root, 'blueprints', 'draft', 'test'), { recursive: true })
    writeFileSync(
      join(root, 'blueprints', 'draft', 'test', '_overview.md'),
      ['---', 'type: blueprint', 'status: draft', '---', '# Test'].join('\n'),
    )
    const result = auditBlueprintLifecycle(root)
    expect(result.ok).toBe(true)
  })

  test('formatRepoAuditReport includes ok status', () => {
    const result = { ok: true, title: 'Test', checked: 1, violations: [] }
    expect(formatRepoAuditReport(result)).toContain('OK')
  })

  test('auditNoRelativeParentImports finds relative parent import violations', () => {
    const root = tempRepo()
    mkdirSync(join(root, 'src'))
    writeFileSync(join(root, 'src', 'foo.ts'), "import something from '../../secret/data'\n")
    const result = auditNoRelativeParentImports(root)
    expect(result.ok).toBe(false)
    expect(result.violations).toHaveLength(1)
    expect(result.violations[0]?.message).toContain('relative parent import')
  })

  test('auditNoRelativeParentImports finds deep string traversal (new URL, path.resolve with ../../..)', () => {
    const root = tempRepo()
    mkdirSync(join(root, 'src'))
    writeFileSync(
      join(root, 'src', 'service.ts'),
      `const t = new URL('../../../../catalog/docs/templates/blueprint.md', import.meta.url)\n`,
    )
    const result = auditNoRelativeParentImports(root)
    expect(result.ok).toBe(false)
    expect(result.violations[0]?.message).toContain('fixed-depth path traversal')
  })

  test('auditNoRelativeParentImports finds deep argument traversal (join/resolve with 3+ ".." args)', () => {
    const root = tempRepo()
    mkdirSync(join(root, 'src'))
    writeFileSync(
      join(root, 'src', 'service.ts'),
      `const p = path.resolve(bundleDir, '..', '..', '..')\n`,
    )
    const result = auditNoRelativeParentImports(root)
    expect(result.ok).toBe(false)
    expect(result.violations[0]?.message).toContain('fixed-depth path traversal')
  })

  test('auditNoRelativeParentImports does not flag shallow traversal or legitimate uses', () => {
    const root = tempRepo()
    mkdirSync(join(root, 'src'))
    writeFileSync(
      join(root, 'src', 'service.ts'),
      [
        `const parentDir = join(fullPath, '..')`,
        `const fromSource = new URL('../../audit/name', import.meta.url)`,
        `const p = path.resolve(bundleDir, '..')`,
      ].join('\n') + '\n',
    )
    const result = auditNoRelativeParentImports(root)
    expect(result.ok).toBe(true)
    expect(result.violations).toHaveLength(0)
  })
})

describe('validateCommitMessage — branch coverage', () => {
  // ConditionalExpression: subject.length === 0 boundary
  test('empty string subject triggers required violation and early return', () => {
    const result = validateCommitMessage('')
    expect(result.ok).toBe(false)
    expect(result.violations).toHaveLength(1)
    expect(result.violations[0]?.message).toBe('Commit subject is required')
    expect(result.checked).toBe(1)
  })

  test('single-char subject does not trigger empty-subject violation', () => {
    const result = validateCommitMessage('x')
    expect(
      result.violations.every((v: RepoAuditViolation) => !v.message.includes('required')),
    ).toBe(true)
  })

  // ConditionalExpression: /^(Merge|Revert|fixup!|squash!)/ — each keyword
  test.each([['Merge branch main'], ['Revert "old"'], ['fixup! something'], ['squash! something']])(
    'exempt prefix "%s" returns ok with zero violations',
    (subject) => {
      const result = validateCommitMessage(subject)
      expect(result.ok).toBe(true)
      expect(result.violations).toHaveLength(0)
      expect(result.checked).toBe(1)
    },
  )

  // Regex: /^(?<type>[a-z]+)(?:\([^)]+\))?!?: .+/ — near-misses that must fail
  test.each([
    ['FEAT: something', 'uppercase type should fail'],
    ['feat something', 'missing colon+space should fail'],
    ['feat:', 'no summary after colon should fail'],
    [': no type', 'empty type prefix should fail'],
    ['123feat: stuff', 'type must start with lowercase letter'],
  ])('conventional format near-miss: %s', (subject, _desc) => {
    const result = validateCommitMessage(subject)
    expect(
      result.violations.some((v: RepoAuditViolation) => v.message.includes('conventional')),
    ).toBe(true)
  })

  test('conventional match with scope passes', () => {
    const result = validateCommitMessage('feat(scope): do something')
    expect(
      result.violations.every((v: RepoAuditViolation) => !v.message.includes('conventional')),
    ).toBe(true)
  })

  test('conventional match with breaking marker passes', () => {
    const result = validateCommitMessage('feat!: breaking change')
    expect(
      result.violations.every((v: RepoAuditViolation) => !v.message.includes('conventional')),
    ).toBe(true)
  })

  test('conventional match with scope and breaking marker passes', () => {
    const result = validateCommitMessage('feat(scope)!: breaking')
    expect(
      result.violations.every((v: RepoAuditViolation) => !v.message.includes('conventional')),
    ).toBe(true)
  })

  // EqualityOperator: subject.length > subjectMaxLength boundary
  test('subject at exactly subjectMaxLength does not violate', () => {
    const subject = 'feat: ' + 'a'.repeat(94) // total 100 chars
    const result = validateCommitMessage(subject, { subjectMaxLength: 100 })
    expect(result.violations.every((v: RepoAuditViolation) => !v.message.includes('100'))).toBe(
      true,
    )
  })

  test('subject at subjectMaxLength + 1 violates', () => {
    const subject = 'feat: ' + 'a'.repeat(95) // total 101 chars
    const result = validateCommitMessage(subject, { subjectMaxLength: 100 })
    expect(result.violations.some((v: RepoAuditViolation) => v.message.includes('100'))).toBe(true)
  })

  test('custom subjectMaxLength is used instead of default', () => {
    const subject = 'feat: ' + 'a'.repeat(45) // total 51 chars — over 50, under 100
    expect(validateCommitMessage(subject, { subjectMaxLength: 50 }).ok).toBe(false)
    expect(validateCommitMessage(subject, { subjectMaxLength: 100 }).ok).toBe(true)
  })

  // ConditionalExpression: lines.length > 1 && lines[1] !== ''
  test('single-line commit does not trigger blank-second-line violation', () => {
    const result = validateCommitMessage('feat: single line')
    expect(result.violations.every((v: RepoAuditViolation) => !v.message.includes('blank'))).toBe(
      true,
    )
  })

  test('two lines where second is blank is valid', () => {
    const result = validateCommitMessage('feat: subject\n\nbody')
    expect(result.violations.every((v: RepoAuditViolation) => !v.message.includes('blank'))).toBe(
      true,
    )
  })

  // LogicalOperator: shouldEnforceLore branches
  // loreWarn=true activates the lore validation path; bad Confidence enum value → violation even in warn mode
  test('loreWarn with invalid Confidence value produces violation (enum error propagates in warn mode)', () => {
    const result = validateCommitMessage(
      [
        'feat: something',
        '',
        'body',
        '',
        'Confidence: extremely-high',
        'Directive: do the thing',
      ].join('\n'),
      { loreWarn: true },
    )
    // Invalid Confidence enum → violation even with loreWarn (not requireLore)
    expect(result.ok).toBe(false)
    expect(
      result.violations.some((v: RepoAuditViolation) =>
        v.message.toLowerCase().includes('confidence'),
      ),
    ).toBe(true)
  })

  test('neither requireLore nor loreWarn nor [lore] — lore not enforced', () => {
    const result = validateCommitMessage(
      ['feat: something', '', 'body without trailers'].join('\n'),
    )
    expect(
      result.violations.every((v: RepoAuditViolation) => !v.message.includes('Confidence')),
    ).toBe(true)
  })

  // ConditionalExpression: options.requireLore === true || subject.includes('[lore]') in loreResult call
  test('[lore] in subject requires Confidence trailer even without requireLore option', () => {
    const result = validateCommitMessage(
      ['feat: something [lore]', '', 'body without trailers'].join('\n'),
    )
    expect(result.ok).toBe(false)
    expect(
      result.violations.some((v: RepoAuditViolation) => v.message.includes('Confidence')),
    ).toBe(true)
  })

  // allowedTypes — custom list
  test('custom allowedTypes accepts only listed types', () => {
    const result = validateCommitMessage('chore: some task', { allowedTypes: ['feat', 'fix'] })
    expect(
      result.violations.some((v: RepoAuditViolation) => v.message.includes('conventional')),
    ).toBe(true)
  })

  test('custom allowedTypes permits type in list', () => {
    const result = validateCommitMessage('feat: something', { allowedTypes: ['feat', 'fix'] })
    expect(
      result.violations.every((v: RepoAuditViolation) => !v.message.includes('conventional')),
    ).toBe(true)
  })

  // CRLF normalization
  test('CRLF line endings are normalised correctly', () => {
    const result = validateCommitMessage('feat: something\r\n\r\nbody')
    expect(result.violations.every((v: RepoAuditViolation) => !v.message.includes('blank'))).toBe(
      true,
    )
  })
})

describe('formatRepoAuditReport — branch coverage', () => {
  test('formats FAILED status correctly', () => {
    const result = {
      ok: false,
      title: 'Catalog drift',
      checked: 3,
      violations: [{ file: 'pkg/a.json', message: 'foo is wrong' }],
    }
    const report = formatRepoAuditReport(result)
    expect(report).toBe('Catalog drift: FAILED (3 checked)\n- pkg/a.json: foo is wrong')
  })

  test('formats OK status with zero violations correctly', () => {
    const result = { ok: true, title: 'Blueprint lifecycle', checked: 5, violations: [] }
    const report = formatRepoAuditReport(result)
    expect(report).toBe('Blueprint lifecycle: OK (5 checked)')
  })

  test('violation without file omits file prefix', () => {
    const result = {
      ok: false,
      title: 'Commit message',
      checked: 1,
      violations: [{ message: 'subject required' }],
    }
    const report = formatRepoAuditReport(result)
    expect(report).toBe('Commit message: FAILED (1 checked)\n- subject required')
  })

  test('multiple violations are each on their own line', () => {
    const result = {
      ok: false,
      title: 'T',
      checked: 2,
      violations: [
        { file: 'a.ts', message: 'err1' },
        { file: 'b.ts', message: 'err2' },
      ],
    }
    const lines = formatRepoAuditReport(result).split('\n')
    expect(lines).toHaveLength(3)
    expect(lines[1]).toBe('- a.ts: err1')
    expect(lines[2]).toBe('- b.ts: err2')
  })
})

describe('auditCatalogDrift — branch coverage', () => {
  test('custom workspaceFile option is respected', () => {
    const root = tempRepo()
    writeFileSync(join(root, 'my-workspace.yaml'), 'packages:\n  - packages/*\n')
    // No packages dir, so no package files → ok
    const result = auditCatalogDrift(root, { workspaceFile: 'my-workspace.yaml' })
    expect(result.ok).toBe(true)
    expect(result.checked).toBe(0)
  })

  test('returns ok with checked count when packages have no drift', () => {
    const root = tempRepo()
    mkdirSync(join(root, 'packages', 'a'), { recursive: true })
    mkdirSync(join(root, 'packages', 'b'), { recursive: true })
    writeFileSync(join(root, 'pnpm-workspace.yaml'), 'packages:\n  - packages/*\n')
    writeJson(join(root, 'packages', 'a', 'package.json'), {
      name: '@repo/a',
      dependencies: { react: 'catalog:' },
    })
    writeJson(join(root, 'packages', 'b', 'package.json'), {
      name: '@repo/b',
      dependencies: { react: 'catalog:' },
    })
    const result = auditCatalogDrift(root)
    expect(result.ok).toBe(true)
    expect(result.checked).toBe(2)
  })

  test('catalogNames.has branch: uses "use catalog:" hint when dep already in catalog', () => {
    const root = tempRepo()
    mkdirSync(join(root, 'packages', 'a'), { recursive: true })
    mkdirSync(join(root, 'packages', 'b'), { recursive: true })
    writeFileSync(
      join(root, 'pnpm-workspace.yaml'),
      ['packages:', '  - packages/*', 'catalog:', '  react: ^19.0.0', ''].join('\n'),
    )
    writeJson(join(root, 'packages', 'a', 'package.json'), {
      name: '@repo/a',
      dependencies: { react: '^19.0.0' },
    })
    writeJson(join(root, 'packages', 'b', 'package.json'), {
      name: '@repo/b',
      dependencies: { react: '^19.0.0' },
    })
    const result = auditCatalogDrift(root)
    expect(result.ok).toBe(false)
    expect(result.violations[0]?.message).toContain('use catalog:')
    expect(result.violations[0]?.message).not.toContain('promote it')
  })

  test('dep NOT in catalog uses "promote it" hint', () => {
    const root = tempRepo()
    mkdirSync(join(root, 'packages', 'a'), { recursive: true })
    mkdirSync(join(root, 'packages', 'b'), { recursive: true })
    writeFileSync(join(root, 'pnpm-workspace.yaml'), 'packages:\n  - packages/*\n')
    writeJson(join(root, 'packages', 'a', 'package.json'), {
      name: '@repo/a',
      dependencies: { lodash: '^4.17.0' },
    })
    writeJson(join(root, 'packages', 'b', 'package.json'), {
      name: '@repo/b',
      dependencies: { lodash: '^4.17.0' },
    })
    const result = auditCatalogDrift(root)
    expect(result.ok).toBe(false)
    expect(result.violations[0]?.message).toContain('promote it to the pnpm catalog')
  })

  // EqualityOperator: uses.length < 2 — exactly 1 usage must NOT produce violation
  test('dep used in only one workspace does not produce drift violation', () => {
    const root = tempRepo()
    mkdirSync(join(root, 'packages', 'a'), { recursive: true })
    writeFileSync(join(root, 'pnpm-workspace.yaml'), 'packages:\n  - packages/*\n')
    writeJson(join(root, 'packages', 'a', 'package.json'), {
      name: '@repo/a',
      dependencies: { lodash: '^4.17.0' },
    })
    const result = auditCatalogDrift(root)
    expect(result.ok).toBe(true)
    expect(result.violations).toHaveLength(0)
  })

  // isSharedDependencyReference: each prefix variant
  test.each([['catalog:react'], ['workspace:*'], ['file:../local'], ['link:../linked']])(
    'shared reference "%s" is not flagged',
    (version) => {
      const root = tempRepo()
      mkdirSync(join(root, 'packages', 'a'), { recursive: true })
      mkdirSync(join(root, 'packages', 'b'), { recursive: true })
      writeFileSync(join(root, 'pnpm-workspace.yaml'), 'packages:\n  - packages/*\n')
      writeJson(join(root, 'packages', 'a', 'package.json'), {
        name: '@repo/a',
        dependencies: { react: version },
      })
      writeJson(join(root, 'packages', 'b', 'package.json'), {
        name: '@repo/b',
        dependencies: { react: version },
      })
      const result = auditCatalogDrift(root)
      expect(result.ok).toBe(true)
    },
  )

  test('peerDependencies are not checked for drift', () => {
    const root = tempRepo()
    mkdirSync(join(root, 'packages', 'a'), { recursive: true })
    mkdirSync(join(root, 'packages', 'b'), { recursive: true })
    writeFileSync(join(root, 'pnpm-workspace.yaml'), 'packages:\n  - packages/*\n')
    writeJson(join(root, 'packages', 'a', 'package.json'), {
      name: '@repo/a',
      peerDependencies: { react: '>=18' },
    })
    writeJson(join(root, 'packages', 'b', 'package.json'), {
      name: '@repo/b',
      peerDependencies: { react: '>=18' },
    })
    const result = auditCatalogDrift(root)
    expect(result.ok).toBe(true)
  })

  test('exact workspace path (non-glob) is resolved correctly', () => {
    const root = tempRepo()
    mkdirSync(join(root, 'infra'), { recursive: true })
    writeFileSync(join(root, 'pnpm-workspace.yaml'), 'packages:\n  - infra\n')
    writeJson(join(root, 'infra', 'package.json'), { name: '@repo/infra', dependencies: {} })
    const result = auditCatalogDrift(root)
    expect(result.ok).toBe(true)
    expect(result.checked).toBe(1)
  })
})

describe('auditDocsFrontmatter — branch coverage', () => {
  test('file without type field produces missing-type violation', () => {
    const root = tempRepo()
    mkdirSync(join(root, 'docs'), { recursive: true })
    writeFileSync(
      join(root, 'docs', 'noType.md'),
      ['---', 'last_updated: 2026-01-01', '---', '# doc'].join('\n'),
    )
    const result = auditDocsFrontmatter(root)
    expect(result.ok).toBe(false)
    expect(result.violations.some((v: RepoAuditViolation) => v.message.includes('type'))).toBe(true)
  })

  test('file with invalid type (not in allowedTypes) produces invalid-type violation', () => {
    const root = tempRepo()
    mkdirSync(join(root, 'docs'), { recursive: true })
    writeFileSync(
      join(root, 'docs', 'bad.md'),
      ['---', 'type: unknown-type', 'last_updated: 2026-01-01', '---', '# doc'].join('\n'),
    )
    const result = auditDocsFrontmatter(root)
    expect(result.ok).toBe(false)
    expect(
      result.violations.some((v: RepoAuditViolation) => v.message.includes('Invalid type')),
    ).toBe(true)
  })

  test('file without last_updated produces missing-last_updated violation', () => {
    const root = tempRepo()
    mkdirSync(join(root, 'docs'), { recursive: true })
    writeFileSync(
      join(root, 'docs', 'noDate.md'),
      ['---', 'type: guide', '---', '# doc'].join('\n'),
    )
    const result = auditDocsFrontmatter(root)
    expect(result.ok).toBe(false)
    expect(
      result.violations.some((v: RepoAuditViolation) => v.message.includes('last_updated')),
    ).toBe(true)
  })

  // ConditionalExpression: folder === 'templates' skips type validation
  test('templates/ folder skips invalid-type and folder-type-contract checks', () => {
    const root = tempRepo()
    mkdirSync(join(root, 'docs', 'templates'), { recursive: true })
    writeFileSync(
      join(root, 'docs', 'templates', 'custom.md'),
      ['---', 'type: anything-goes', 'last_updated: 2026-01-01', '---', '# T'].join('\n'),
    )
    const result = auditDocsFrontmatter(root)
    expect(result.ok).toBe(true)
    expect(result.violations).toHaveLength(0)
  })

  // ConditionalExpression: folder !== 'templates' && expectedType && type && type !== expectedType
  test('correct folder type contract passes', () => {
    const root = tempRepo()
    mkdirSync(join(root, 'docs', 'adrs'), { recursive: true })
    writeFileSync(
      join(root, 'docs', 'adrs', 'correct.md'),
      ['---', 'type: adr', 'last_updated: 2026-01-01', '---', '# ADR'].join('\n'),
    )
    const result = auditDocsFrontmatter(root)
    expect(result.ok).toBe(true)
  })

  test('wrong type in adrs/ folder produces folder-type-contract violation', () => {
    const root = tempRepo()
    mkdirSync(join(root, 'docs', 'adrs'), { recursive: true })
    writeFileSync(
      join(root, 'docs', 'adrs', 'wrong.md'),
      ['---', 'type: guide', 'last_updated: 2026-01-01', '---', '# ADR'].join('\n'),
    )
    const result = auditDocsFrontmatter(root)
    expect(result.ok).toBe(false)
    expect(result.violations.some((v: RepoAuditViolation) => v.message.includes('adrs/'))).toBe(
      true,
    )
    expect(result.violations.some((v: RepoAuditViolation) => v.message.includes('adr'))).toBe(true)
  })

  test('custom docsRoot option is respected', () => {
    const root = tempRepo()
    mkdirSync(join(root, 'documentation'), { recursive: true })
    writeFileSync(
      join(root, 'documentation', 'item.md'),
      ['---', 'type: guide', 'last_updated: 2026-01-01', '---', '# G'].join('\n'),
    )
    const result = auditDocsFrontmatter(root, { docsRoot: 'documentation' })
    expect(result.ok).toBe(true)
    expect(result.checked).toBe(1)
  })

  test('custom allowedTypes restricts valid type set', () => {
    const root = tempRepo()
    mkdirSync(join(root, 'docs'), { recursive: true })
    writeFileSync(
      join(root, 'docs', 'item.md'),
      ['---', 'type: guide', 'last_updated: 2026-01-01', '---', '# G'].join('\n'),
    )
    // guide is a default type but not in our custom list
    const result = auditDocsFrontmatter(root, { allowedTypes: ['adr', 'research'] })
    expect(result.ok).toBe(false)
    expect(
      result.violations.some((v: RepoAuditViolation) => v.message.includes('Invalid type')),
    ).toBe(true)
  })

  test('returns correct checked count', () => {
    const root = tempRepo()
    mkdirSync(join(root, 'docs'), { recursive: true })
    writeFileSync(
      join(root, 'docs', 'a.md'),
      ['---', 'type: guide', 'last_updated: 2026-01-01', '---', '# A'].join('\n'),
    )
    writeFileSync(
      join(root, 'docs', 'b.md'),
      ['---', 'type: guide', 'last_updated: 2026-01-01', '---', '# B'].join('\n'),
    )
    const result = auditDocsFrontmatter(root)
    expect(result.checked).toBe(2)
  })
})

describe('auditBlueprintLifecycle — branch coverage', () => {
  test('blueprint with correct type and status passes', () => {
    const root = tempRepo()
    mkdirSync(join(root, 'blueprints', 'in-progress', 'my-feature'), { recursive: true })
    writeFileSync(
      join(root, 'blueprints', 'in-progress', 'my-feature', '_overview.md'),
      ['---', 'type: blueprint', 'status: in-progress', '---', '# My Feature'].join('\n'),
    )
    const result = auditBlueprintLifecycle(root)
    expect(result.ok).toBe(true)
    expect(result.checked).toBe(1)
  })

  test('blueprint with wrong type produces type violation', () => {
    const root = tempRepo()
    mkdirSync(join(root, 'blueprints', 'draft', 'bp'), { recursive: true })
    writeFileSync(
      join(root, 'blueprints', 'draft', 'bp', '_overview.md'),
      ['---', 'type: guide', 'status: draft', '---', '# BP'].join('\n'),
    )
    const result = auditBlueprintLifecycle(root)
    expect(result.ok).toBe(false)
    expect(
      result.violations.some((v: RepoAuditViolation) => v.message.includes('type: blueprint')),
    ).toBe(true)
  })

  test('custom statuses option filters which folders are checked', () => {
    const root = tempRepo()
    mkdirSync(join(root, 'blueprints', 'draft', 'bp'), { recursive: true })
    writeFileSync(
      join(root, 'blueprints', 'draft', 'bp', '_overview.md'),
      // wrong type — but we only check 'completed', so this folder is skipped
      ['---', 'type: guide', 'status: draft', '---', '# BP'].join('\n'),
    )
    const result = auditBlueprintLifecycle(root, { statuses: ['completed'] })
    expect(result.ok).toBe(true)
    expect(result.checked).toBe(0)
  })

  test('custom blueprintsRoot option is respected', () => {
    const root = tempRepo()
    mkdirSync(join(root, 'plans', 'draft', 'bp'), { recursive: true })
    writeFileSync(
      join(root, 'plans', 'draft', 'bp', '_overview.md'),
      ['---', 'type: blueprint', 'status: draft', '---', '# BP'].join('\n'),
    )
    const result = auditBlueprintLifecycle(root, { blueprintsRoot: 'plans' })
    expect(result.ok).toBe(true)
    expect(result.checked).toBe(1)
  })

  test('non-directory entries in status folder are skipped', () => {
    const root = tempRepo()
    mkdirSync(join(root, 'blueprints', 'draft'), { recursive: true })
    // write a file (not a directory) inside the status folder
    writeFileSync(join(root, 'blueprints', 'draft', 'stray-file.md'), '# stray')
    const result = auditBlueprintLifecycle(root)
    expect(result.ok).toBe(true)
    expect(result.checked).toBe(0)
  })

  test('includeLegacyOmx false does not add legacy checked count', () => {
    const root = tempRepo()
    const result = auditBlueprintLifecycle(root, { includeLegacyOmx: false })
    expect(result.checked).toBe(0)
  })

  test('legacy omx: no legacy surface → no violations and checked stays 0', () => {
    const root = tempRepo()
    const result = auditBlueprintLifecycle(root, { includeLegacyOmx: true })
    expect(result.ok).toBe(true)
    expect(result.checked).toBe(0)
  })
})

describe('auditLegacyOmxPlans — branch coverage via auditBlueprintLifecycle', () => {
  function buildLegacyBase(root: string) {
    mkdirSync(join(root, '.omx', 'plans'), { recursive: true })
    mkdirSync(join(root, '.omx', 'contracts'), { recursive: true })
    mkdirSync(join(root, '.omx', 'state', 'lifecycle'), { recursive: true })
    writeFileSync(
      join(root, '.omx', 'contracts', 'workspace-boundary-contract.md'),
      ['# Workspace boundary contract', '', '## Workspace classifications', ''].join('\n'),
    )
    writeFileSync(join(root, '.omx', 'plans', 'prd-feature.md'), '# PRD: Feature\n')
    writeFileSync(join(root, '.omx', 'plans', 'test-spec-feature.md'), '# Test Spec: Feature\n')
    writeFileSync(
      join(root, '.omx', 'state', 'lifecycle', 'feature.json'),
      JSON.stringify({ slug: 'feature', status: 'planned', artifacts: {} }),
    )
  }

  test('valid full legacy structure passes all checks', () => {
    const root = tempRepo()
    buildLegacyBase(root)
    const result = auditBlueprintLifecycle(root, { includeLegacyOmx: true })
    expect(result.ok).toBe(true)
  })

  test('contract missing required marker "# Workspace boundary contract" produces violation', () => {
    const root = tempRepo()
    buildLegacyBase(root)
    writeFileSync(
      join(root, '.omx', 'contracts', 'workspace-boundary-contract.md'),
      ['## Workspace classifications', ''].join('\n'),
    )
    const result = auditBlueprintLifecycle(root, { includeLegacyOmx: true })
    expect(result.ok).toBe(false)
    expect(
      result.violations.some((v: RepoAuditViolation) =>
        v.message.includes('# Workspace boundary contract'),
      ),
    ).toBe(true)
  })

  test('contract missing required marker "## Workspace classifications" produces violation', () => {
    const root = tempRepo()
    buildLegacyBase(root)
    writeFileSync(
      join(root, '.omx', 'contracts', 'workspace-boundary-contract.md'),
      ['# Workspace boundary contract', ''].join('\n'),
    )
    const result = auditBlueprintLifecycle(root, { includeLegacyOmx: true })
    expect(result.ok).toBe(false)
    expect(
      result.violations.some((v: RepoAuditViolation) =>
        v.message.includes('## Workspace classifications'),
      ),
    ).toBe(true)
  })

  test('prd file missing "# PRD:" heading produces violation', () => {
    const root = tempRepo()
    buildLegacyBase(root)
    writeFileSync(join(root, '.omx', 'plans', 'prd-feature.md'), '# Not a PRD heading\n')
    const result = auditBlueprintLifecycle(root, { includeLegacyOmx: true })
    expect(result.ok).toBe(false)
    expect(
      result.violations.some((v: RepoAuditViolation) =>
        v.message.includes('missing a PRD heading'),
      ),
    ).toBe(true)
  })

  test('test-spec file missing "# Test Spec:" heading produces violation', () => {
    const root = tempRepo()
    buildLegacyBase(root)
    writeFileSync(join(root, '.omx', 'plans', 'test-spec-feature.md'), '# Not a test spec\n')
    const result = auditBlueprintLifecycle(root, { includeLegacyOmx: true })
    expect(result.ok).toBe(false)
    expect(
      result.violations.some((v: RepoAuditViolation) =>
        v.message.includes('missing a test spec heading'),
      ),
    ).toBe(true)
  })

  test('lifecycle JSON with no slug produces slug violation', () => {
    const root = tempRepo()
    buildLegacyBase(root)
    writeFileSync(
      join(root, '.omx', 'state', 'lifecycle', 'feature.json'),
      JSON.stringify({ status: 'planned', artifacts: {} }),
    )
    const result = auditBlueprintLifecycle(root, { includeLegacyOmx: true })
    expect(result.ok).toBe(false)
    expect(
      result.violations.some((v: RepoAuditViolation) => v.message.includes('requires a slug')),
    ).toBe(true)
  })

  test('lifecycle JSON with empty slug produces slug violation', () => {
    const root = tempRepo()
    buildLegacyBase(root)
    writeFileSync(
      join(root, '.omx', 'state', 'lifecycle', 'feature.json'),
      JSON.stringify({ slug: '', status: 'planned', artifacts: {} }),
    )
    const result = auditBlueprintLifecycle(root, { includeLegacyOmx: true })
    expect(result.ok).toBe(false)
    expect(
      result.violations.some((v: RepoAuditViolation) => v.message.includes('requires a slug')),
    ).toBe(true)
  })

  test('lifecycle JSON with no status produces status violation', () => {
    const root = tempRepo()
    buildLegacyBase(root)
    writeFileSync(
      join(root, '.omx', 'state', 'lifecycle', 'feature.json'),
      JSON.stringify({ slug: 'feature', artifacts: {} }),
    )
    const result = auditBlueprintLifecycle(root, { includeLegacyOmx: true })
    expect(result.ok).toBe(false)
    expect(
      result.violations.some((v: RepoAuditViolation) => v.message.includes('requires a status')),
    ).toBe(true)
  })

  test('lifecycle JSON with no artifacts object produces artifacts violation', () => {
    const root = tempRepo()
    buildLegacyBase(root)
    writeFileSync(
      join(root, '.omx', 'state', 'lifecycle', 'feature.json'),
      JSON.stringify({ slug: 'feature', status: 'planned' }),
    )
    const result = auditBlueprintLifecycle(root, { includeLegacyOmx: true })
    expect(result.ok).toBe(false)
    expect(
      result.violations.some((v: RepoAuditViolation) =>
        v.message.includes('requires an artifacts object'),
      ),
    ).toBe(true)
  })

  test('lifecycle JSON with artifacts as array produces artifacts violation', () => {
    const root = tempRepo()
    buildLegacyBase(root)
    writeFileSync(
      join(root, '.omx', 'state', 'lifecycle', 'feature.json'),
      JSON.stringify({ slug: 'feature', status: 'planned', artifacts: [] }),
    )
    const result = auditBlueprintLifecycle(root, { includeLegacyOmx: true })
    expect(result.ok).toBe(false)
    expect(
      result.violations.some((v: RepoAuditViolation) =>
        v.message.includes('requires an artifacts object'),
      ),
    ).toBe(true)
  })

  test('invalid JSON in lifecycle file produces JSON-parse violation', () => {
    const root = tempRepo()
    buildLegacyBase(root)
    writeFileSync(join(root, '.omx', 'state', 'lifecycle', 'feature.json'), 'not valid json')
    const result = auditBlueprintLifecycle(root, { includeLegacyOmx: true })
    expect(result.ok).toBe(false)
    expect(
      result.violations.some((v: RepoAuditViolation) => v.message.includes('JSON is invalid')),
    ).toBe(true)
  })

  // Slug cross-reference: prd exists but test-spec is missing → "Missing legacy test spec plan"
  test('prd without matching test-spec produces missing-test-spec violation', () => {
    const root = tempRepo()
    buildLegacyBase(root)
    // Remove test-spec-feature.md but keep prd-feature.md
    writeFileSync(join(root, '.omx', 'plans', 'prd-orphan.md'), '# PRD: Orphan\n')
    const result = auditBlueprintLifecycle(root, { includeLegacyOmx: true })
    expect(result.ok).toBe(false)
    expect(
      result.violations.some((v: RepoAuditViolation) =>
        v.message.includes('Missing legacy test spec plan'),
      ),
    ).toBe(true)
  })

  // test-spec exists but prd is missing → "Missing legacy PRD plan"
  test('test-spec without matching prd produces missing-prd violation', () => {
    const root = tempRepo()
    buildLegacyBase(root)
    writeFileSync(join(root, '.omx', 'plans', 'test-spec-orphan.md'), '# Test Spec: Orphan\n')
    const result = auditBlueprintLifecycle(root, { includeLegacyOmx: true })
    expect(result.ok).toBe(false)
    expect(
      result.violations.some((v: RepoAuditViolation) =>
        v.message.includes('Missing legacy PRD plan'),
      ),
    ).toBe(true)
  })
})

describe('auditNoRelativeParentImports — branch coverage', () => {
  test('test files are skipped (.test.ts)', () => {
    const root = tempRepo()
    mkdirSync(join(root, 'src'))
    writeFileSync(join(root, 'src', 'foo.test.ts'), "import something from '../../secret/data'\n")
    const result = auditNoRelativeParentImports(root)
    expect(result.ok).toBe(true)
    expect(result.checked).toBe(0)
  })

  test('test files are skipped (.test.tsx)', () => {
    const root = tempRepo()
    mkdirSync(join(root, 'src'))
    writeFileSync(join(root, 'src', 'foo.test.tsx'), "import something from '../../secret/data'\n")
    const result = auditNoRelativeParentImports(root)
    expect(result.ok).toBe(true)
    expect(result.checked).toBe(0)
  })

  test('integration test files are skipped (.integration.test.ts)', () => {
    const root = tempRepo()
    mkdirSync(join(root, 'src'))
    writeFileSync(
      join(root, 'src', 'foo.integration.test.ts'),
      "import something from '../../secret/data'\n",
    )
    const result = auditNoRelativeParentImports(root)
    expect(result.ok).toBe(true)
    expect(result.checked).toBe(0)
  })

  test('node_modules directory is skipped', () => {
    const root = tempRepo()
    mkdirSync(join(root, 'src', 'node_modules', 'pkg'), { recursive: true })
    writeFileSync(
      join(root, 'src', 'node_modules', 'pkg', 'index.ts'),
      "import something from '../../secret/data'\n",
    )
    const result = auditNoRelativeParentImports(root)
    expect(result.ok).toBe(true)
  })

  test('dist directory is skipped', () => {
    const root = tempRepo()
    mkdirSync(join(root, 'src', 'dist'), { recursive: true })
    writeFileSync(
      join(root, 'src', 'dist', 'index.ts'),
      "import something from '../../secret/data'\n",
    )
    const result = auditNoRelativeParentImports(root)
    expect(result.ok).toBe(true)
  })

  test('comment lines are not flagged', () => {
    const root = tempRepo()
    mkdirSync(join(root, 'src'))
    writeFileSync(
      join(root, 'src', 'foo.ts'),
      [
        `// import something from '../../secret/data'`,
        `/* import something from '../../secret/data' */`,
      ].join('\n') + '\n',
    )
    const result = auditNoRelativeParentImports(root)
    expect(result.ok).toBe(true)
  })

  test('export * from parent also flagged', () => {
    const root = tempRepo()
    mkdirSync(join(root, 'src'))
    writeFileSync(join(root, 'src', 'index.ts'), "export * from '../other'\n")
    const result = auditNoRelativeParentImports(root)
    expect(result.ok).toBe(false)
    expect(result.violations[0]?.message).toContain('relative parent import')
  })

  test('custom srcDir option is respected', () => {
    const root = tempRepo()
    mkdirSync(join(root, 'lib'))
    writeFileSync(join(root, 'lib', 'foo.ts'), "import x from '../../up'\n")
    const result = auditNoRelativeParentImports(root, { srcDir: 'lib' })
    expect(result.ok).toBe(false)
    expect(result.checked).toBe(1)
  })

  test('custom extensions option limits which files are checked', () => {
    const root = tempRepo()
    mkdirSync(join(root, 'src'))
    writeFileSync(join(root, 'src', 'foo.ts'), "import x from '../../up'\n")
    // Only check .js, so .ts is skipped
    const result = auditNoRelativeParentImports(root, { extensions: ['.js'] })
    expect(result.ok).toBe(true)
    expect(result.checked).toBe(0)
  })

  test('non-existent srcDir returns ok with 0 checked', () => {
    const root = tempRepo()
    const result = auditNoRelativeParentImports(root)
    expect(result.ok).toBe(true)
    expect(result.checked).toBe(0)
  })

  test('violation message includes line number', () => {
    const root = tempRepo()
    mkdirSync(join(root, 'src'))
    writeFileSync(
      join(root, 'src', 'bar.ts'),
      ['const x = 1', "import foo from '../../outside'", 'const y = 2'].join('\n') + '\n',
    )
    const result = auditNoRelativeParentImports(root)
    expect(result.ok).toBe(false)
    expect(result.violations[0]?.message).toContain('Line 2:')
  })

  test('deep arg traversal exactly at 2 ".." args is NOT flagged', () => {
    const root = tempRepo()
    mkdirSync(join(root, 'src'))
    writeFileSync(
      join(root, 'src', 'service.ts'),
      `const p = path.resolve(bundleDir, '..', '..')\n`,
    )
    const result = auditNoRelativeParentImports(root)
    expect(result.ok).toBe(true)
  })

  test('deep arg traversal at exactly 3 ".." args IS flagged', () => {
    const root = tempRepo()
    mkdirSync(join(root, 'src'))
    writeFileSync(
      join(root, 'src', 'service.ts'),
      `const p = path.resolve(bundleDir, '..', '..', '..')\n`,
    )
    const result = auditNoRelativeParentImports(root)
    expect(result.ok).toBe(false)
    expect(result.violations[0]?.message).toContain('fixed-depth path traversal')
  })
})

describe('parseFrontmatter — branch coverage', () => {
  // We test indirectly through auditDocsFrontmatter/auditBlueprintLifecycle
  test('markdown without --- front matter returns empty record (no type violation logic skipped)', () => {
    const root = tempRepo()
    mkdirSync(join(root, 'docs'), { recursive: true })
    writeFileSync(join(root, 'docs', 'raw.md'), '# Just a title\n\nNo frontmatter.')
    const result = auditDocsFrontmatter(root)
    // Without frontmatter, type and last_updated are both missing
    expect(result.ok).toBe(false)
    expect(result.violations.some((v: RepoAuditViolation) => v.message.includes('type'))).toBe(true)
    expect(
      result.violations.some((v: RepoAuditViolation) => v.message.includes('last_updated')),
    ).toBe(true)
  })

  test('frontmatter block not closed (no closing ---) returns empty record', () => {
    const root = tempRepo()
    mkdirSync(join(root, 'docs'), { recursive: true })
    writeFileSync(
      join(root, 'docs', 'unclosed.md'),
      ['---', 'type: guide', '# missing closing fence'].join('\n'),
    )
    const result = auditDocsFrontmatter(root)
    expect(result.ok).toBe(false)
    expect(result.violations.some((v: RepoAuditViolation) => v.message.includes('type'))).toBe(true)
  })
})
