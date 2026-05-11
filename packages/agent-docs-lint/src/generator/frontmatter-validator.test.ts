import type { TemplateSchema } from './types'

import { describe, expect, it } from 'vitest'

import { validateFrontmatter } from './frontmatter-validator'

describe('validateFrontmatter', () => {
  const mockSchema: TemplateSchema = {
    name: 'test',
    description: 'Test template',
    frontmatter: {
      required: {
        type: {
          value: 'guide',
          description: 'Must be exactly "guide"',
        },
        last_updated: {
          type: 'date',
          format: 'YYYY-MM-DD',
          description: 'Last modification date',
        },
        status: {
          enum: ['draft', 'in-progress', 'complete'],
          description: 'Current status',
        },
      },
      optional: {
        redirect_to: {
          type: 'string',
          description: 'Redirect path',
        },
      },
    },
    sections: { required: [], optional: [] },
    location: { patterns: ['docs/**/*.md'] },
    naming: { pattern: '*.md', case: 'lower' },
  }

  describe('required fields', () => {
    it('should return no errors when all required fields present', () => {
      const frontmatter = {
        type: 'guide',
        last_updated: '2026-02-05',
        status: 'draft',
      }

      const errors = validateFrontmatter(frontmatter, mockSchema)

      expect(errors).toHaveLength(0)
    })

    it('should return error for missing required field', () => {
      const frontmatter = {
        last_updated: '2026-02-05',
        status: 'draft',
      }

      const errors = validateFrontmatter(frontmatter, mockSchema)

      expect(errors).toHaveLength(1)
      expect(errors[0].code).toBe('MISSING_REQUIRED_FRONTMATTER')
      expect(errors[0].field).toBe('type')
    })

    it('should return multiple errors for multiple missing fields', () => {
      const frontmatter = {}

      const errors = validateFrontmatter(frontmatter, mockSchema)

      expect(errors.length).toBeGreaterThanOrEqual(3)
    })
  })

  describe('fixed value validation', () => {
    it('should pass when value matches fixed value', () => {
      const frontmatter = {
        type: 'guide',
        last_updated: '2026-02-05',
        status: 'draft',
      }

      const errors = validateFrontmatter(frontmatter, mockSchema)

      expect(errors).toHaveLength(0)
    })

    it('should fail when value does not match fixed value', () => {
      const frontmatter = {
        type: 'wrong-type',
        last_updated: '2026-02-05',
        status: 'draft',
      }

      const errors = validateFrontmatter(frontmatter, mockSchema)

      expect(errors).toHaveLength(1)
      expect(errors[0].code).toBe('INVALID_FRONTMATTER_VALUE')
      expect(errors[0].field).toBe('type')
      expect(errors[0].expected).toBe('guide')
      expect(errors[0].actual).toBe('wrong-type')
    })
  })

  describe('enum validation', () => {
    it('should pass when value is in enum', () => {
      const frontmatter = {
        type: 'guide',
        last_updated: '2026-02-05',
        status: 'in-progress',
      }

      const errors = validateFrontmatter(frontmatter, mockSchema)

      expect(errors).toHaveLength(0)
    })

    it('should fail when value is not in enum', () => {
      const frontmatter = {
        type: 'guide',
        last_updated: '2026-02-05',
        status: 'invalid-status',
      }

      const errors = validateFrontmatter(frontmatter, mockSchema)

      expect(errors).toHaveLength(1)
      expect(errors[0].code).toBe('INVALID_FRONTMATTER_VALUE')
      expect(errors[0].field).toBe('status')
      expect(errors[0].expected).toContain('draft')
      expect(errors[0].actual).toBe('invalid-status')
    })
  })

  describe('edge cases', () => {
    it('should handle empty schema', () => {
      const emptySchema: TemplateSchema = {
        name: 'empty',
        description: '',
        frontmatter: { required: {}, optional: {} },
        sections: { required: [], optional: [] },
        location: { patterns: [] },
        naming: { pattern: '', case: 'lower' },
      }

      const errors = validateFrontmatter({}, emptySchema)

      expect(errors).toHaveLength(0)
    })

    it('should handle null values', () => {
      const frontmatter = {
        type: null as unknown as string,
        last_updated: '2026-02-05',
        status: 'draft',
      }

      const errors = validateFrontmatter(frontmatter, mockSchema)

      expect(errors.length).toBeGreaterThan(0)
      expect(errors[0].code).toBe('MISSING_REQUIRED_FRONTMATTER')
    })

    it('should handle undefined values', () => {
      const frontmatter = {
        type: undefined,
        last_updated: '2026-02-05',
        status: 'draft',
      }

      const errors = validateFrontmatter(frontmatter, mockSchema)

      expect(errors.length).toBeGreaterThan(0)
      expect(errors[0].code).toBe('MISSING_REQUIRED_FRONTMATTER')
    })
  })
})
