import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

import { auditContent } from './audit.js'

interface Fixture {
  readonly root: string
  readonly catalog: string
  readonly consumer: string
}

function makeFixture(): Fixture {
  const root = mkdtempSync(join(tmpdir(), 'content-audit-'))
  const catalog = join(root, 'catalog', 'agent')
  const consumer = join(root, 'consumer')
  mkdirSync(join(catalog, 'rules'), { recursive: true })
  mkdirSync(join(catalog, 'skills'), { recursive: true })
  mkdirSync(join(consumer, 'agent-rules'), { recursive: true })
  mkdirSync(join(consumer, 'agent-skills'), { recursive: true })
  return { root, catalog, consumer }
}

function writeRule(
  dir: string,
  filename: string,
  fm: Record<string, unknown>,
  body = 'body\n',
): void {
  const lines = ['---']
  for (const [k, v] of Object.entries(fm)) {
    if (Array.isArray(v)) {
      lines.push(`${k}:`)
      for (const item of v) lines.push(`  - ${JSON.stringify(item)}`)
    } else {
      lines.push(`${k}: ${JSON.stringify(v)}`)
    }
  }
  lines.push('---')
  lines.push('')
  lines.push(body)
  writeFileSync(join(dir, filename), lines.join('\n'))
}

function writeSkill(
  dir: string,
  slugDir: string,
  fm: Record<string, unknown>,
  body = 'body\n',
): void {
  const skillDir = join(dir, slugDir)
  mkdirSync(skillDir, { recursive: true })
  writeRule(skillDir, 'SKILL.md', fm, body)
}

function validRuleFm(slug: string, extra: Record<string, unknown> = {}): Record<string, unknown> {
  return {
    type: 'rule',
    slug,
    title: `Rule ${slug}`,
    status: 'active',
    scope: 'repo',
    applies_to: ['agents'],
    created: '2026-01-01',
    last_reviewed: '2026-04-01',
    ...extra,
  }
}

function validSkillFm(slug: string, extra: Record<string, unknown> = {}): Record<string, unknown> {
  return { ...validRuleFm(slug, extra), type: 'skill', title: `Skill ${slug}` }
}

describe('auditContent', () => {
  let fx: Fixture
  beforeEach(() => {
    fx = makeFixture()
  })
  afterEach(() => {
    rmSync(fx.root, { recursive: true, force: true })
  })

  it('passes on a clean fixture (rule kind)', () => {
    writeRule(join(fx.catalog, 'rules'), 'cat-a.md', validRuleFm('cat-a'))
    writeRule(join(fx.consumer, 'agent-rules'), 'con-a.md', validRuleFm('con-a'))
    const result = auditContent({
      catalogDir: fx.catalog,
      consumerRoot: fx.consumer,
      kind: 'rule',
    })
    expect(result.findings).toEqual([])
    expect(result.passed).toBe(true)
  })

  it('passes on a clean fixture (skill kind)', () => {
    writeSkill(join(fx.catalog, 'skills'), 'cat-s', validSkillFm('cat-s'))
    writeSkill(join(fx.consumer, 'agent-skills'), 'con-s', validSkillFm('con-s'))
    const result = auditContent({
      catalogDir: fx.catalog,
      consumerRoot: fx.consumer,
      kind: 'skill',
    })
    expect(result.findings).toEqual([])
    expect(result.passed).toBe(true)
  })

  it('errors on schema parse failure (missing required field)', () => {
    const fm = validRuleFm('bad')
    delete (fm as Record<string, unknown>)['title']
    writeRule(join(fx.consumer, 'agent-rules'), 'bad.md', fm)
    const result = auditContent({
      catalogDir: fx.catalog,
      consumerRoot: fx.consumer,
      kind: 'rule',
    })
    expect(result.passed).toBe(false)
    expect(result.findings.some((f) => f.severity === 'error' && /title/i.test(f.message))).toBe(
      true,
    )
  })

  it('errors on filename / slug mismatch (rule)', () => {
    writeRule(join(fx.consumer, 'agent-rules'), 'foo.md', validRuleFm('bar'))
    const result = auditContent({
      catalogDir: fx.catalog,
      consumerRoot: fx.consumer,
      kind: 'rule',
    })
    expect(result.passed).toBe(false)
    expect(
      result.findings.some(
        (f) => f.severity === 'error' && /slug/i.test(f.message) && /filename/i.test(f.message),
      ),
    ).toBe(true)
  })

  it('errors on dir / slug mismatch (skill)', () => {
    writeSkill(join(fx.consumer, 'agent-skills'), 'foo-dir', validSkillFm('different-slug'))
    const result = auditContent({
      catalogDir: fx.catalog,
      consumerRoot: fx.consumer,
      kind: 'skill',
    })
    expect(result.passed).toBe(false)
    expect(result.findings.some((f) => /slug/i.test(f.message))).toBe(true)
  })

  it('errors on duplicate consumer slug (rule)', () => {
    // Two consumer rule files cannot share a slug. Create slug collision via
    // frontmatter `slug` field while filenames differ — both will fail
    // filename-mismatch too, but duplicate detection is triggered separately.
    writeRule(join(fx.consumer, 'agent-rules'), 'a.md', validRuleFm('shared'))
    writeRule(join(fx.consumer, 'agent-rules'), 'b.md', validRuleFm('shared'))
    const result = auditContent({
      catalogDir: fx.catalog,
      consumerRoot: fx.consumer,
      kind: 'rule',
    })
    expect(result.passed).toBe(false)
    expect(result.findings.some((f) => /duplicate/i.test(f.message))).toBe(true)
  })

  it('errors on catalog collision', () => {
    writeRule(join(fx.catalog, 'rules'), 'shared.md', validRuleFm('shared'))
    writeRule(join(fx.consumer, 'agent-rules'), 'shared.md', validRuleFm('shared'))
    const result = auditContent({
      catalogDir: fx.catalog,
      consumerRoot: fx.consumer,
      kind: 'rule',
    })
    expect(result.passed).toBe(false)
    expect(result.findings.some((f) => /collision/i.test(f.message))).toBe(true)
  })

  it('errors on broken `related` ref', () => {
    writeRule(
      join(fx.consumer, 'agent-rules'),
      'a.md',
      validRuleFm('a', { related: ['nonexistent'] }),
    )
    const result = auditContent({
      catalogDir: fx.catalog,
      consumerRoot: fx.consumer,
      kind: 'rule',
    })
    expect(result.passed).toBe(false)
    expect(
      result.findings.some(
        (f) =>
          f.severity === 'error' && /related/i.test(f.message) && /nonexistent/.test(f.message),
      ),
    ).toBe(true)
  })

  it('resolves `related` against catalog or consumer (either kind)', () => {
    writeSkill(join(fx.catalog, 'skills'), 'helper-skill', validSkillFm('helper-skill'))
    writeRule(
      join(fx.consumer, 'agent-rules'),
      'a.md',
      validRuleFm('a', { related: ['helper-skill'] }),
    )
    const result = auditContent({
      catalogDir: fx.catalog,
      consumerRoot: fx.consumer,
      kind: 'rule',
    })
    expect(result.passed).toBe(true)
  })

  it('warns on stale `last_reviewed` (>180 days)', () => {
    writeRule(
      join(fx.consumer, 'agent-rules'),
      'old.md',
      validRuleFm('old', { last_reviewed: '2020-01-01' }),
    )
    const result = auditContent({
      catalogDir: fx.catalog,
      consumerRoot: fx.consumer,
      kind: 'rule',
    })
    expect(result.passed).toBe(true) // warning only
    expect(
      result.findings.some(
        (f) => f.severity === 'warning' && /last_reviewed|stale/i.test(f.message),
      ),
    ).toBe(true)
  })

  it('multi-finding: surfaces all problems at once', () => {
    writeRule(join(fx.catalog, 'rules'), 'shared.md', validRuleFm('shared'))
    writeRule(join(fx.consumer, 'agent-rules'), 'shared.md', validRuleFm('shared'))
    writeRule(
      join(fx.consumer, 'agent-rules'),
      'wrongname.md',
      validRuleFm('different', { related: ['ghost'] }),
    )
    const result = auditContent({
      catalogDir: fx.catalog,
      consumerRoot: fx.consumer,
      kind: 'rule',
    })
    expect(result.passed).toBe(false)
    expect(result.findings.length).toBeGreaterThanOrEqual(2)
    const messages = result.findings.map((f) => f.message).join('\n')
    expect(messages).toMatch(/collision/i)
    expect(messages).toMatch(/ghost/)
  })

  it('kind: rule filters out skill records', () => {
    // A bad skill (broken frontmatter) plus a clean rule. Auditing rule kind
    // must ignore the skill and pass.
    writeSkill(join(fx.consumer, 'agent-skills'), 'bad-skill', { type: 'skill' }) // missing fields
    writeRule(join(fx.consumer, 'agent-rules'), 'good.md', validRuleFm('good'))
    const result = auditContent({
      catalogDir: fx.catalog,
      consumerRoot: fx.consumer,
      kind: 'rule',
    })
    expect(result.passed).toBe(true)
    expect(result.findings).toEqual([])
  })

  it('kind: skill filters out rule records', () => {
    writeRule(join(fx.consumer, 'agent-rules'), 'bad.md', { type: 'rule' })
    writeSkill(join(fx.consumer, 'agent-skills'), 'good', validSkillFm('good'))
    const result = auditContent({
      catalogDir: fx.catalog,
      consumerRoot: fx.consumer,
      kind: 'skill',
    })
    expect(result.passed).toBe(true)
    expect(result.findings).toEqual([])
  })

  it('respects custom staleReviewDays', () => {
    // 100 days ago: stale at 30, fresh at 200
    vi.useFakeTimers()
    vi.setSystemTime(new Date('2026-01-01T00:00:00.000Z'))
    const past = new Date(new Date('2026-01-01T00:00:00.000Z').getTime() - 100 * 24 * 60 * 60 * 1000)
    const iso = past.toISOString().slice(0, 10)
    writeRule(join(fx.consumer, 'agent-rules'), 'r.md', validRuleFm('r', { last_reviewed: iso }))
    const stale = auditContent({
      catalogDir: fx.catalog,
      consumerRoot: fx.consumer,
      kind: 'rule',
      staleReviewDays: 30,
    })
    expect(stale.findings.some((f) => f.severity === 'warning')).toBe(true)
    const fresh = auditContent({
      catalogDir: fx.catalog,
      consumerRoot: fx.consumer,
      kind: 'rule',
      staleReviewDays: 200,
    })
    expect(fresh.findings).toEqual([])
    vi.useRealTimers()
  })
})
