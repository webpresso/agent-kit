import { describe, expect, it } from 'vitest'

import { baseFrontmatter, complexity, dateString, implementationStatus } from './schemas/common'
import { decisionFrontmatter } from './schemas/decision'
import { implementationPlanFrontmatter } from './schemas/implementation-plan'
import { detectDocType, normalizeDocType, schemaRegistry } from './schemas/index'

describe('common schemas', () => {
  describe('dateString', () => {
    it('should accept valid YYYY-MM-DD string', () => {
      const result = dateString.safeParse('2026-01-01')
      expect(result.success).toBe(true)
    })

    it('should accept Date object and transform to YYYY-MM-DD', () => {
      const date = new Date('2026-01-01')
      const result = dateString.safeParse(date)
      expect(result.success).toBe(true)
      if (result.success) {
        expect(result.data).toBe('2026-01-01')
      }
    })

    it('should reject invalid date string', () => {
      const result = dateString.safeParse('not-a-date')
      expect(result.success).toBe(false)
    })

    it('should reject date in wrong format', () => {
      const result = dateString.safeParse('01/01/2026')
      expect(result.success).toBe(false)
    })
  })

  describe('baseFrontmatter', () => {
    it('should accept empty object (all fields optional)', () => {
      const result = baseFrontmatter.safeParse({})
      expect(result.success).toBe(true)
    })

    it('should accept valid complete frontmatter', () => {
      const data = {
        type: 'guide',
        title: 'Test Guide',
        last_updated: '2026-01-01',
        status: 'active',
        authors: ['alice', 'bob'],
        tags: ['tag1', 'tag2'],
        related: ['doc1.md', 'doc2.md'],
      }
      const result = baseFrontmatter.safeParse(data)
      expect(result.success).toBe(true)
    })

    it('should accept valid status values', () => {
      const statuses = [
        'draft',
        'review',
        'active',
        'accepted',
        'deprecated',
        'archived',
        'monitoring',
        'needs-remediation',
        'backlog',
        'blocked',
      ]
      for (const status of statuses) {
        const result = baseFrontmatter.safeParse({ status })
        expect(result.success).toBe(true)
      }
    })

    it('should reject invalid status', () => {
      const result = baseFrontmatter.safeParse({ status: 'invalid-status' })
      expect(result.success).toBe(false)
    })
  })

  describe('implementationStatus', () => {
    it('should accept valid implementation statuses', () => {
      const statuses = [
        'draft',
        'in-progress',
        'planned',
        'completed',
        'complete',
        'archived',
        'current',
      ]
      for (const status of statuses) {
        const result = implementationStatus.safeParse(status)
        expect(result.success).toBe(true)
      }
    })

    it('should reject invalid status', () => {
      const result = implementationStatus.safeParse('invalid')
      expect(result.success).toBe(false)
    })
  })

  describe('complexity', () => {
    it('should accept valid complexity values', () => {
      const values = ['XS', 'S', 'M', 'L', 'XL']
      for (const value of values) {
        const result = complexity.safeParse(value)
        expect(result.success).toBe(true)
      }
    })

    it('should reject invalid complexity', () => {
      const result = complexity.safeParse('XXL')
      expect(result.success).toBe(false)
    })

    it('should reject lowercase complexity', () => {
      const result = complexity.safeParse('m')
      expect(result.success).toBe(false)
    })
  })
})

describe('implementationPlanFrontmatter', () => {
  it('should accept valid implementation plan', () => {
    const data = {
      type: 'blueprint',
      status: 'in-progress',
      complexity: 'M',
      last_updated: '2026-01-01',
    }
    const result = implementationPlanFrontmatter.safeParse(data)
    expect(result.success).toBe(true)
  })

  it('should accept without status (optional)', () => {
    const data = {
      complexity: 'M',
      last_updated: '2026-01-01',
    }
    const result = implementationPlanFrontmatter.safeParse(data)
    expect(result.success).toBe(true)
  })

  it('should accept without complexity (optional)', () => {
    const data = {
      status: 'draft',
      last_updated: '2026-01-01',
    }
    const result = implementationPlanFrontmatter.safeParse(data)
    expect(result.success).toBe(true)
  })

  it('should accept without last_updated (optional)', () => {
    const data = {
      status: 'draft',
      complexity: 'M',
    }
    const result = implementationPlanFrontmatter.safeParse(data)
    expect(result.success).toBe(true)
  })

  it('should accept optional depends_on array', () => {
    const data = {
      status: 'draft',
      complexity: 'M',
      last_updated: '2026-01-01',
      depends_on: ['plan1', 'plan2'],
    }
    const result = implementationPlanFrontmatter.safeParse(data)
    expect(result.success).toBe(true)
  })

  it('should accept optional epic', () => {
    const data = {
      status: 'draft',
      complexity: 'M',
      last_updated: '2026-01-01',
      epic: 'phase-1',
    }
    const result = implementationPlanFrontmatter.safeParse(data)
    expect(result.success).toBe(true)
  })
})

describe('decisionFrontmatter', () => {
  it('should accept valid decision record (MADR format)', () => {
    const data = {
      type: 'decision',
      status: 'accepted',
      date: '2026-01-02',
      decision: 'Use MADR format for decision records',
    }
    const result = decisionFrontmatter.safeParse(data)
    expect(result.success).toBe(true)
  })

  it('should require status field', () => {
    const data = {
      date: '2026-01-02',
      decision: 'Some decision',
    }
    const result = decisionFrontmatter.safeParse(data)
    expect(result.success).toBe(false)
  })

  it('should be detectable from docs/decisions/ path', () => {
    const docType = detectDocType('docs/decisions/0001-use-madr.md')
    expect(docType).toBe('decision')
  })
})

describe('simplified type system', () => {
  describe('schemaRegistry', () => {
    it('should have exactly 6 types', () => {
      const types = Object.keys(schemaRegistry)
      expect(types).toHaveLength(6)
      expect(types).toContain('guide')
      expect(types).toContain('system')
      expect(types).toContain('research')
      expect(types).toContain('blueprint')
      expect(types).toContain('decision')
      expect(types).toContain('unknown')
    })
  })

  describe('normalizeDocType', () => {
    it('should return unknown for undefined', () => {
      expect(normalizeDocType()).toBe('unknown')
    })

    it('should pass through valid new types', () => {
      expect(normalizeDocType('guide')).toBe('guide')
      expect(normalizeDocType('system')).toBe('system')
      expect(normalizeDocType('research')).toBe('research')
      expect(normalizeDocType('blueprint')).toBe('blueprint')
      expect(normalizeDocType('decision')).toBe('decision')
      expect(normalizeDocType('unknown')).toBe('unknown')
    })

    it('should return unknown for unrecognized types', () => {
      expect(normalizeDocType('nonexistent')).toBe('unknown')
      expect(normalizeDocType('core')).toBe('unknown')
      expect(normalizeDocType('cookbook')).toBe('unknown')
      expect(normalizeDocType('audit')).toBe('unknown')
      expect(normalizeDocType('draft')).toBe('unknown')
      expect(normalizeDocType('implementation-plan')).toBe('unknown')
    })
  })

  describe('detectDocType', () => {
    it('should detect blueprints under webpresso/blueprints/', () => {
      expect(detectDocType('webpresso/blueprints/active/test/_overview.md')).toBe('blueprint')
    })

    it('should detect decisions', () => {
      expect(detectDocType('docs/decisions/0001-test.md')).toBe('decision')
      expect(detectDocType('docs/system/decisions/0002-test.md')).toBe('decision')
    })

    it('should detect research', () => {
      expect(detectDocType('docs/research/2026-01-topic/index.md')).toBe('research')
    })

    it('should detect guides from docs/', () => {
      expect(detectDocType('docs/how-to/testing.md')).toBe('guide')
      expect(detectDocType('docs/guides/testing.md')).toBe('guide')
    })

    it('should detect system docs from docs/system/', () => {
      expect(detectDocType('docs/system/config.md')).toBe('system')
      expect(detectDocType('docs/system/routing/architecture.md')).toBe('system')
    })

    it('should detect agent files as guides', () => {
      expect(detectDocType('.agent/rules/agent-guide.md')).toBe('guide')
      expect(detectDocType('CLAUDE.md')).toBe('guide')
      expect(detectDocType('GEMINI.md')).toBe('guide')
    })

    it('should detect README files as guides', () => {
      expect(detectDocType('README.md')).toBe('guide')
      expect(detectDocType('packages/cli/README.md')).toBe('guide')
    })

    it('should return unknown for unmatched paths', () => {
      expect(detectDocType('random/path/file.md')).toBe('unknown')
    })
  })
})
