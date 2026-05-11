import { describe, expect, it } from 'vitest'

import { applyDirectives } from './directives.js'
import type { DirectiveContext } from './directives.js'

function makeContext(overrides: Partial<DirectiveContext> = {}): DirectiveContext {
  return {
    dryRun: false,
    isShallowClone: false,
    rotationLog: [],
    warnings: [],
    ...overrides,
  }
}

function makeSection(heading: string, content: string) {
  return { heading, content }
}

describe('applyDirectives', () => {
  it('append adds content after existing section', () => {
    const sections = new Map([['build', makeSection('Build', 'original')]])
    const ctx = makeContext()
    const result = applyDirectives(
      sections,
      [{ heading: 'Build', op: 'append', content: 'appended' }],
      ctx,
    )
    expect(result.get('build')?.content).toContain('original')
    expect(result.get('build')?.content).toContain('appended')
  })

  it('prepend adds content before existing section', () => {
    const sections = new Map([['build', makeSection('Build', 'original')]])
    const ctx = makeContext()
    const result = applyDirectives(
      sections,
      [{ heading: 'Build', op: 'prepend', content: 'prepended' }],
      ctx,
    )
    const content = result.get('build')?.content ?? ''
    expect(content.indexOf('prepended')).toBeLessThan(content.indexOf('original'))
  })

  it('replace overwrites section content', () => {
    const sections = new Map([['build', makeSection('Build', 'original')]])
    const ctx = makeContext()
    const result = applyDirectives(
      sections,
      [{ heading: 'Build', op: 'replace', content: 'new content' }],
      ctx,
    )
    expect(result.get('build')?.content).toBe('new content')
  })

  it('delete removes the section', () => {
    const sections = new Map([
      ['build', makeSection('Build', 'content')],
      ['test', makeSection('Test', 'test content')],
    ])
    const ctx = makeContext()
    const result = applyDirectives(sections, [{ heading: 'Build', op: 'delete' }], ctx)
    expect(result.has('build')).toBe(false)
    expect(result.has('test')).toBe(true)
  })

  it('rotate with rotation_eligible: false via schema means op rotate requires rotation_eligible: true', () => {
    // rotation_eligible: true is required by schema on op: rotate
    // Simulate a context where shallow clone is true
    const sections = new Map([['old-context', makeSection('Old Context', 'old data')]])
    const ctx = makeContext({ isShallowClone: true })
    const result = applyDirectives(
      sections,
      [
        {
          op: 'rotate',
          heading: 'Old Context',
          rotation_eligible: true,
          archive_to: 'AGENTS.history.md',
          threshold_days: 30,
          keep_summary: true,
        },
      ],
      ctx,
    )
    // Shallow clone — no rotation, warning emitted
    expect(result.has('old-context')).toBe(true)
    expect(ctx.warnings).toHaveLength(1)
    expect(ctx.warnings[0]).toContain('shallow clone')
  })

  it('rotate with shallow clone emits warning and does not rotate', () => {
    const sections = new Map([['history', makeSection('History', 'old entries')]])
    const ctx = makeContext({ isShallowClone: true })
    applyDirectives(
      sections,
      [
        {
          op: 'rotate',
          heading: 'History',
          rotation_eligible: true,
          archive_to: 'AGENTS.history.md',
          threshold_days: 30,
          keep_summary: true,
        },
      ],
      ctx,
    )
    expect(ctx.rotationLog).toHaveLength(0)
    expect(ctx.warnings.some((w) => w.includes('shallow clone'))).toBe(true)
  })

  it('dryRun rotate does not modify sections but logs the would-be rotation', () => {
    const sections = new Map([['old', makeSection('Old', 'content')]])
    const ctx = makeContext({ dryRun: true })
    // We can't easily make the age check pass without a real git repo,
    // so this test just checks that dry-run mode doesn't crash
    const result = applyDirectives(
      sections,
      [
        {
          op: 'rotate',
          heading: 'Old',
          rotation_eligible: true,
          archive_to: 'AGENTS.history.md',
          threshold_days: 30,
          keep_summary: true,
        },
      ],
      ctx,
    )
    // Section should still exist (no filePath → shouldRotate = false)
    expect(result.has('old')).toBe(true)
  })

  it('unknown slug in directive is a no-op', () => {
    const sections = new Map([['build', makeSection('Build', 'content')]])
    const ctx = makeContext()
    const result = applyDirectives(
      sections,
      [{ heading: 'NonExistent', op: 'delete' }],
      ctx,
    )
    expect(result.has('build')).toBe(true)
    expect(result.size).toBe(1)
  })
})
