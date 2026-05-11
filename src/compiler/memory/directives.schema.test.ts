import { describe, expect, it } from 'vitest'

import { memoryMergeYamlSchema, sectionDirectiveSchema } from './directives.schema.js'

describe('sectionDirectiveSchema', () => {
  it('parses a valid append directive', () => {
    const result = sectionDirectiveSchema.safeParse({
      heading: 'Build',
      op: 'append',
      content: 'extra content',
    })
    expect(result.success).toBe(true)
  })

  it('parses a valid delete directive', () => {
    const result = sectionDirectiveSchema.safeParse({ heading: 'Build', op: 'delete' })
    expect(result.success).toBe(true)
  })

  it('parses a valid rotate directive with rotation_eligible: true', () => {
    const result = sectionDirectiveSchema.safeParse({
      heading: 'Old Section',
      op: 'rotate',
      rotation_eligible: true,
      archive_to: 'AGENTS.history.md',
      threshold_days: 90,
      keep_summary: true,
    })
    expect(result.success).toBe(true)
  })

  it('parses rotate directive with optional fields missing', () => {
    // With a flat schema, rotate-specific fields are optional (no built-in defaults)
    // Defaults are applied by applyDirectives at runtime using nullish coalescing
    const result = sectionDirectiveSchema.safeParse({
      heading: 'Old Section',
      op: 'rotate',
      rotation_eligible: true,
    })
    expect(result.success).toBe(true)
    if (result.success) {
      expect(result.data.op).toBe('rotate')
      expect(result.data.rotation_eligible).toBe(true)
      // Optional rotate fields are undefined when not supplied
      expect(result.data.archive_to).toBeUndefined()
    }
  })

  it('rejects invalid op', () => {
    const result = sectionDirectiveSchema.safeParse({ heading: 'Build', op: 'upsert' })
    expect(result.success).toBe(false)
  })
})

describe('memoryMergeYamlSchema', () => {
  it('parses a valid yaml shape', () => {
    const result = memoryMergeYamlSchema.safeParse({
      sections: [{ heading: 'Build', op: 'delete' }],
      frontmatter_patch: { owner: 'team' },
    })
    expect(result.success).toBe(true)
  })

  it('parses empty sections array', () => {
    const result = memoryMergeYamlSchema.safeParse({ sections: [] })
    expect(result.success).toBe(true)
    if (result.success) expect(result.data.sections).toEqual([])
  })
})
