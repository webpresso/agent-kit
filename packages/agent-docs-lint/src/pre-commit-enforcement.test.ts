import { describe, expect, it } from 'vitest'

import { baseFrontmatter } from './schemas/common'
import { implementationPlanFrontmatter } from './schemas/implementation-plan'
import { detectDocType, docTypeConfigs, schemaRegistry } from './schemas/index'

/**
 * Pre-commit enforcement tests for docs-linter.
 * Validates that the schema registry correctly catches invalid frontmatter.
 *
 * These tests ensure:
 * 1. Simplified 5-type system works correctly
 * 2. Invalid enum values are rejected for strict types
 * 3. Path detection maps to simplified types
 */
describe('pre-commit enforcement - schema validation', () => {
  describe('guide docs (general documentation)', () => {
    it('should accept guide doc with all optional fields', () => {
      const result = baseFrontmatter.safeParse({
        type: 'guide',
      })
      expect(result.success).toBe(true)
    })

    it('should accept guide doc with optional last_updated', () => {
      const result = baseFrontmatter.safeParse({
        type: 'guide',
        last_updated: '2026-01-07',
      })
      expect(result.success).toBe(true)
    })

    it('should accept empty frontmatter for guides', () => {
      const result = baseFrontmatter.safeParse({})
      expect(result.success).toBe(true)
    })
  })

  describe('implementation plans', () => {
    it('should accept valid implementation plan', () => {
      const result = implementationPlanFrontmatter.safeParse({
        type: 'blueprint',
        status: 'in-progress',
        complexity: 'M',
        last_updated: '2026-01-07',
      })
      expect(result.success).toBe(true)
    })

    it("should reject invalid status enum value 'proposed'", () => {
      const result = implementationPlanFrontmatter.safeParse({
        type: 'blueprint',
        status: 'proposed', // invalid - should be draft/in-progress/complete/etc.
        complexity: 'M',
        last_updated: '2026-01-07',
      })
      expect(result.success).toBe(false)
    })
  })

  describe('research docs', () => {
    it('should accept valid research doc with all optional fields', () => {
      const result = baseFrontmatter.safeParse({
        type: 'research',
      })
      expect(result.success).toBe(true)
    })

    it('should accept research doc with status', () => {
      const result = baseFrontmatter.safeParse({
        type: 'research',
        status: 'active',
      })
      expect(result.success).toBe(true)
    })
  })
})

describe('pre-commit enforcement - simplified type registry', () => {
  it('should have all 6 simplified doc types registered', () => {
    const requiredTypes = ['guide', 'system', 'research', 'blueprint', 'decision', 'unknown']

    for (const docType of requiredTypes) {
      const schema = schemaRegistry[docType as keyof typeof schemaRegistry]
      expect(typeof schema, `Missing schema for type: ${docType}`).toBe('object')
      expect(schema).not.toBeNull()
    }
  })

  it('should have path patterns configured for major directories', () => {
    // Verify key directories have detection patterns
    const hasPatternFor = (substring: string) =>
      docTypeConfigs.some((config) =>
        config.pathPatterns.some((p) => p.source.includes(substring.replace(/\//g, '\\/'))),
      )

    expect(hasPatternFor('webpresso/blueprints')).toBe(true)
    expect(hasPatternFor('research')).toBe(true)
    expect(hasPatternFor('docs')).toBe(true)
  })
})

describe('pre-commit enforcement - path detection with simplified types', () => {
  it('should detect research docs correctly', () => {
    expect(detectDocType('docs/research/2026-01-topic/findings.md')).toBe('research')
  })

  it('should detect decisions from docs/decisions/ path', () => {
    expect(detectDocType('docs/decisions/0001-use-madr.md')).toBe('decision')
  })

  it('should detect implementation plans', () => {
    expect(detectDocType('webpresso/blueprints/my-plan/_overview.md')).toBe('blueprint')
  })

  it('should detect guides from docs/ paths', () => {
    expect(detectDocType('docs/how-to/testing.md')).toBe('guide')
  })

  it('should detect agent-guide.md as guide', () => {
    expect(detectDocType('.agent/rules/agent-guide.md')).toBe('guide')
  })

  it('should detect README.md as guide', () => {
    expect(detectDocType('README.md')).toBe('guide')
  })

  it('should return unknown for unmatched paths', () => {
    expect(detectDocType('some/random/file.md')).toBe('unknown')
  })
})
