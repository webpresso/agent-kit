/**
 * Tests for shared content dispatch covering rule + skill kinds across
 * `new | list | show | deprecate` subcommands.
 */
import { existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'

import matter from 'gray-matter'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'

import { dispatchContent } from './dispatch.js'

const TODAY = new Date().toISOString().slice(0, 10)

interface Workspace {
  root: string
  catalogDir: string
}

function makeWorkspace(): Workspace {
  const root = mkdtempSync(join(tmpdir(), 'wp-content-dispatch-'))
  const catalogDir = join(root, 'catalog')
  mkdirSync(join(catalogDir, 'rules'), { recursive: true })
  mkdirSync(join(catalogDir, 'skills'), { recursive: true })
  return { root, catalogDir }
}

function writeCanonicalRule(catalogDir: string, slug: string, title: string): string {
  const file = join(catalogDir, 'rules', `${slug}.md`)
  const fm = [
    '---',
    'type: rule',
    `slug: ${slug}`,
    `title: ${title}`,
    'status: active',
    'scope: repo',
    'applies_to:',
    '  - agents',
    `created: '${TODAY}'`,
    `last_reviewed: '${TODAY}'`,
    '---',
    '',
    `Body for ${slug}.`,
    '',
  ].join('\n')
  writeFileSync(file, fm)
  return file
}

function writeCanonicalSkill(catalogDir: string, slug: string, title: string): string {
  const skillDir = join(catalogDir, 'skills', slug)
  mkdirSync(skillDir, { recursive: true })
  const file = join(skillDir, 'SKILL.md')
  const fm = [
    '---',
    'type: skill',
    `slug: ${slug}`,
    `title: ${title}`,
    'status: active',
    'scope: repo',
    'applies_to:',
    '  - agents',
    `created: '${TODAY}'`,
    `last_reviewed: '${TODAY}'`,
    '---',
    '',
    `Body for ${slug}.`,
    '',
  ].join('\n')
  writeFileSync(file, fm)
  return file
}

describe('dispatchContent', () => {
  let ws: Workspace

  beforeEach(() => {
    ws = makeWorkspace()
  })

  afterEach(() => {
    rmSync(ws.root, { recursive: true, force: true })
  })

  describe('new', () => {
    it('creates a rule file under agent-rules/', async () => {
      const result = await dispatchContent({
        kind: 'rule',
        sub: 'new',
        args: ['my-rule'],
        options: { cwd: ws.root, catalogDir: ws.catalogDir, title: 'My Rule' },
      })
      expect(result.exitCode).toBe(0)
      const filePath = join(ws.root, 'agent-rules', 'my-rule.md')
      expect(existsSync(filePath)).toBe(true)
      const parsed = matter(readFileSync(filePath, 'utf8'))
      expect(parsed.data).toMatchObject({
        type: 'rule',
        slug: 'my-rule',
        title: 'My Rule',
        status: 'active',
        scope: 'repo',
        applies_to: ['agents'],
        created: TODAY,
        last_reviewed: TODAY,
        related: [],
      })
      expect(result.stdout).toContain(filePath)
    })

    it('creates a skill dir + SKILL.md under agent-skills/', async () => {
      const result = await dispatchContent({
        kind: 'skill',
        sub: 'new',
        args: ['my-skill'],
        options: { cwd: ws.root, catalogDir: ws.catalogDir },
      })
      expect(result.exitCode).toBe(0)
      const filePath = join(ws.root, 'agent-skills', 'my-skill', 'SKILL.md')
      expect(existsSync(filePath)).toBe(true)
      const parsed = matter(readFileSync(filePath, 'utf8'))
      expect(parsed.data).toMatchObject({
        type: 'skill',
        slug: 'my-skill',
        title: 'My Skill',
      })
    })

    it('honors --scope', async () => {
      await dispatchContent({
        kind: 'rule',
        sub: 'new',
        args: ['scoped'],
        options: { cwd: ws.root, catalogDir: ws.catalogDir, scope: 'package:foo' },
      })
      const parsed = matter(readFileSync(join(ws.root, 'agent-rules', 'scoped.md'), 'utf8'))
      expect(parsed.data['scope']).toBe('package:foo')
    })

    it('errors when slug missing', async () => {
      const result = await dispatchContent({
        kind: 'rule',
        sub: 'new',
        args: [],
        options: { cwd: ws.root, catalogDir: ws.catalogDir },
      })
      expect(result.exitCode).toBe(1)
      expect(result.stderr).toMatch(/Usage/i)
    })

    it('fails O_EXCL when file already exists', async () => {
      await dispatchContent({
        kind: 'rule',
        sub: 'new',
        args: ['dup'],
        options: { cwd: ws.root, catalogDir: ws.catalogDir },
      })
      const second = await dispatchContent({
        kind: 'rule',
        sub: 'new',
        args: ['dup'],
        options: { cwd: ws.root, catalogDir: ws.catalogDir },
      })
      expect(second.exitCode).toBe(1)
      expect(second.stderr).toMatch(/exists|EEXIST/i)
    })

    it('dry-run does not write', async () => {
      const result = await dispatchContent({
        kind: 'rule',
        sub: 'new',
        args: ['dry'],
        options: { cwd: ws.root, catalogDir: ws.catalogDir, dryRun: true },
      })
      expect(result.exitCode).toBe(0)
      expect(existsSync(join(ws.root, 'agent-rules', 'dry.md'))).toBe(false)
      expect(result.stdout).toMatch(/Would create/i)
    })
  })

  describe('list', () => {
    it('lists records from catalog and consumer', async () => {
      writeCanonicalRule(ws.catalogDir, 'alpha', 'Alpha')
      await dispatchContent({
        kind: 'rule',
        sub: 'new',
        args: ['beta'],
        options: { cwd: ws.root, catalogDir: ws.catalogDir, title: 'Beta' },
      })
      const result = await dispatchContent({
        kind: 'rule',
        sub: 'list',
        args: [],
        options: { cwd: ws.root, catalogDir: ws.catalogDir },
      })
      expect(result.exitCode).toBe(0)
      expect(result.stdout).toContain('alpha')
      expect(result.stdout).toContain('beta')
      expect(result.stdout).toContain('canonical')
      expect(result.stdout).toContain('consumer')
    })

    it('filters by source', async () => {
      writeCanonicalRule(ws.catalogDir, 'alpha', 'Alpha')
      await dispatchContent({
        kind: 'rule',
        sub: 'new',
        args: ['beta'],
        options: { cwd: ws.root, catalogDir: ws.catalogDir, title: 'Beta' },
      })
      const result = await dispatchContent({
        kind: 'rule',
        sub: 'list',
        args: [],
        options: { cwd: ws.root, catalogDir: ws.catalogDir, source: 'consumer' },
      })
      expect(result.stdout).toContain('beta')
      expect(result.stdout).not.toContain('alpha')
    })

    it('lists skills', async () => {
      writeCanonicalSkill(ws.catalogDir, 'alpha-skill', 'Alpha Skill')
      const result = await dispatchContent({
        kind: 'skill',
        sub: 'list',
        args: [],
        options: { cwd: ws.root, catalogDir: ws.catalogDir },
      })
      expect(result.exitCode).toBe(0)
      expect(result.stdout).toContain('alpha-skill')
    })
  })

  describe('show', () => {
    it('shows a canonical rule', async () => {
      writeCanonicalRule(ws.catalogDir, 'alpha', 'Alpha')
      const result = await dispatchContent({
        kind: 'rule',
        sub: 'show',
        args: ['alpha'],
        options: { cwd: ws.root, catalogDir: ws.catalogDir },
      })
      expect(result.exitCode).toBe(0)
      expect(result.stdout).toContain('Alpha')
      expect(result.stdout).toContain('Body for alpha')
    })

    it('prefers consumer over canonical when both exist', async () => {
      writeCanonicalRule(ws.catalogDir, 'shared', 'Canonical Title')
      mkdirSync(join(ws.root, 'agent-rules'), { recursive: true })
      const consumerFile = join(ws.root, 'agent-rules', 'shared.md')
      writeFileSync(
        consumerFile,
        [
          '---',
          'type: rule',
          'slug: shared',
          'title: Consumer Title',
          'status: active',
          'scope: repo',
          'applies_to: [agents]',
          `created: '${TODAY}'`,
          `last_reviewed: '${TODAY}'`,
          '---',
          '',
          'Consumer body.',
          '',
        ].join('\n'),
      )
      const result = await dispatchContent({
        kind: 'rule',
        sub: 'show',
        args: ['shared'],
        options: { cwd: ws.root, catalogDir: ws.catalogDir },
      })
      expect(result.stdout).toContain('Consumer Title')
      expect(result.stdout).toContain('Consumer body')
    })

    it('errors when slug not found', async () => {
      const result = await dispatchContent({
        kind: 'rule',
        sub: 'show',
        args: ['missing'],
        options: { cwd: ws.root, catalogDir: ws.catalogDir },
      })
      expect(result.exitCode).toBe(1)
      expect(result.stderr).toMatch(/not found/i)
    })
  })

  describe('deprecate', () => {
    it('flips status + adds deprecation_date in place', async () => {
      await dispatchContent({
        kind: 'rule',
        sub: 'new',
        args: ['old'],
        options: { cwd: ws.root, catalogDir: ws.catalogDir, title: 'Old' },
      })
      const result = await dispatchContent({
        kind: 'rule',
        sub: 'deprecate',
        args: ['old'],
        options: { cwd: ws.root, catalogDir: ws.catalogDir, reason: 'Replaced by new' },
      })
      expect(result.exitCode).toBe(0)
      const filePath = join(ws.root, 'agent-rules', 'old.md')
      const parsed = matter(readFileSync(filePath, 'utf8'))
      expect(parsed.data['status']).toBe('deprecated')
      expect(parsed.data['deprecation_date']).toBe(TODAY)
      expect(parsed.content).toMatch(/Deprecation note/)
      expect(parsed.content).toContain('Replaced by new')
    })

    it('errors when slug not in consumer', async () => {
      writeCanonicalRule(ws.catalogDir, 'canonical-only', 'Canonical Only')
      const result = await dispatchContent({
        kind: 'rule',
        sub: 'deprecate',
        args: ['canonical-only'],
        options: { cwd: ws.root, catalogDir: ws.catalogDir },
      })
      expect(result.exitCode).toBe(1)
      expect(result.stderr).toMatch(/consumer/i)
    })
  })
})
