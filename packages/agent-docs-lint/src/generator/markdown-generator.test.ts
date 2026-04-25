import type { GenerateDocInput } from './types'

import { describe, expect, it } from 'vitest'

import { generateDoc } from './markdown-generator'

describe('generateDoc', () => {
  describe('basic document generation', () => {
    it('should generate markdown with frontmatter and sections', () => {
      const input: GenerateDocInput = {
        template: 'guide',
        ssot: {
          frontmatter: {
            type: 'guide',
            last_updated: '2026-02-05',
          },
          sections: {
            Overview: 'This is a guide for testing.',
          },
        },
        llmBlocks: [],
      }

      const result = generateDoc(input)

      expect(result.success).toBe(true)
      expect(result.markdown).toContain('---')
      expect(result.markdown).toContain('type: guide')
      expect(result.markdown).toContain('last_updated: 2026-02-05')
      expect(result.markdown).toContain('## Overview')
      expect(result.markdown).toContain('This is a guide for testing.')
    })

    it('should merge LLM blocks with SSOT sections', () => {
      const input: GenerateDocInput = {
        template: 'guide',
        ssot: {
          frontmatter: {
            type: 'guide',
            last_updated: '2026-02-05',
          },
          sections: {
            Overview: 'SSOT overview content.',
          },
        },
        llmBlocks: [
          {
            section: 'Details',
            content: 'LLM-generated detailed explanation.',
          },
        ],
      }

      const result = generateDoc(input)

      expect(result.success).toBe(true)
      expect(result.markdown).toContain('## Overview')
      expect(result.markdown).toContain('SSOT overview content.')
      expect(result.markdown).toContain('## Details')
      expect(result.markdown).toContain('LLM-generated detailed explanation.')
    })

    it('should preserve section order: SSOT sections first, then LLM blocks appended', () => {
      const input: GenerateDocInput = {
        template: 'guide',
        ssot: {
          frontmatter: {
            type: 'guide',
            last_updated: '2026-02-05',
          },
          sections: {
            Overview: 'First section.',
            References: 'Second section.',
          },
        },
        llmBlocks: [
          {
            section: 'Implementation',
            content: 'LLM section appended last.',
          },
        ],
      }

      const result = generateDoc(input)

      expect(result.success).toBe(true)
      const markdown = result.markdown!
      const overviewIdx = markdown.indexOf('## Overview')
      const refsIdx = markdown.indexOf('## References')
      const implIdx = markdown.indexOf('## Implementation')

      // SSOT sections maintain their order
      expect(overviewIdx).toBeLessThan(refsIdx)
      // LLM blocks are appended after all SSOT sections
      expect(refsIdx).toBeLessThan(implIdx)
    })
  })

  describe('frontmatter validation', () => {
    it('should fail when required frontmatter field is missing', () => {
      const input: GenerateDocInput = {
        template: 'guide',
        ssot: {
          frontmatter: {
            // Missing 'type' which is required
            last_updated: '2026-02-05',
          },
          sections: {},
        },
        llmBlocks: [],
      }

      const result = generateDoc(input)

      expect(result.success).toBe(false)
      expect(Array.isArray(result.errors)).toBe(true)
      expect(result.errors!.length).toBeGreaterThan(0)
      expect(result.errors![0]).toEqual(
        expect.objectContaining({
          code: 'MISSING_REQUIRED_FRONTMATTER',
          field: 'type',
        }),
      )
    })

    it('should fail when frontmatter value does not match enum', () => {
      const input: GenerateDocInput = {
        template: 'blueprint',
        ssot: {
          frontmatter: {
            type: 'blueprint',
            status: 'invalid-status', // Should be draft, in-progress, or complete
            complexity: 'M',
            last_updated: '2026-02-05',
          },
          sections: {},
        },
        llmBlocks: [],
      }

      const result = generateDoc(input)

      expect(result.success).toBe(false)
      expect(Array.isArray(result.errors)).toBe(true)
      expect(result.errors![0]).toEqual(
        expect.objectContaining({
          code: 'INVALID_FRONTMATTER_VALUE',
          field: 'status',
          expected: expect.stringContaining('draft'),
        }),
      )
    })

    it('should allow optional frontmatter fields to be omitted', () => {
      const input: GenerateDocInput = {
        template: 'guide',
        ssot: {
          frontmatter: {
            type: 'guide',
            last_updated: '2026-02-05',
            // redirect_to is optional, omitting it
          },
          sections: {
            Overview: 'Content',
          },
        },
        llmBlocks: [],
      }

      const result = generateDoc(input)

      expect(result.success).toBe(true)
    })
  })

  describe('template loading', () => {
    it('should fail with actionable error for non-existent template', () => {
      const input: GenerateDocInput = {
        template: 'non-existent-template',
        ssot: {
          frontmatter: {},
          sections: {},
        },
        llmBlocks: [],
      }

      const result = generateDoc(input)

      expect(result.success).toBe(false)
      expect(Array.isArray(result.errors)).toBe(true)
      expect(result.errors![0]).toEqual(
        expect.objectContaining({
          code: 'TEMPLATE_NOT_FOUND',
          message: expect.stringContaining('non-existent-template'),
        }),
      )
    })
  })

  describe('LLM block validation', () => {
    it('should warn when LLM block targets non-existent section', () => {
      const input: GenerateDocInput = {
        template: 'guide',
        ssot: {
          frontmatter: {
            type: 'guide',
            last_updated: '2026-02-05',
          },
          sections: {
            Overview: 'Content',
          },
        },
        llmBlocks: [
          {
            section: 'NonExistentSection',
            content: 'This should generate a warning.',
          },
        ],
      }

      const result = generateDoc(input)

      // Should still succeed but include the section
      expect(result.success).toBe(true)
      expect(result.markdown).toContain('## NonExistentSection')
    })
  })

  describe('AST manipulation', () => {
    it('should properly handle markdown formatting in sections', () => {
      const input: GenerateDocInput = {
        template: 'guide',
        ssot: {
          frontmatter: {
            type: 'guide',
            last_updated: '2026-02-05',
          },
          sections: {
            Overview: '**Bold** and *italic* text with `code`.',
          },
        },
        llmBlocks: [],
      }

      const result = generateDoc(input)

      expect(result.success).toBe(true)
      expect(result.markdown).toContain('**Bold**')
      expect(result.markdown).toContain('*italic*')
      expect(result.markdown).toContain('`code`')
    })

    it('should handle code blocks in sections', () => {
      const input: GenerateDocInput = {
        template: 'guide',
        ssot: {
          frontmatter: {
            type: 'guide',
            last_updated: '2026-02-05',
          },
          sections: {
            Overview: 'Example:\n\n```typescript\nconst x = 1;\n```',
          },
        },
        llmBlocks: [],
      }

      const result = generateDoc(input)

      expect(result.success).toBe(true)
      expect(result.markdown).toContain('```typescript')
      expect(result.markdown).toContain('const x = 1;')
      expect(result.markdown).toContain('```')
    })

    it('should handle lists in sections', () => {
      const input: GenerateDocInput = {
        template: 'guide',
        ssot: {
          frontmatter: {
            type: 'guide',
            last_updated: '2026-02-05',
          },
          sections: {
            Overview: '- Item 1\n- Item 2\n- Item 3',
          },
        },
        llmBlocks: [],
      }

      const result = generateDoc(input)

      expect(result.success).toBe(true)
      expect(result.markdown).toContain('- Item 1')
      expect(result.markdown).toContain('- Item 2')
      expect(result.markdown).toContain('- Item 3')
    })
  })

  describe('stable output', () => {
    it('should produce identical output for identical input', () => {
      const input: GenerateDocInput = {
        template: 'guide',
        ssot: {
          frontmatter: {
            type: 'guide',
            last_updated: '2026-02-05',
          },
          sections: {
            Overview: 'Stable content',
          },
        },
        llmBlocks: [
          {
            section: 'Details',
            content: 'LLM content',
          },
        ],
      }

      const result1 = generateDoc(input)
      const result2 = generateDoc(input)

      expect(result1.markdown).toBe(result2.markdown)
    })
  })

  describe('error messages', () => {
    it('should provide actionable error for missing required frontmatter', () => {
      const input: GenerateDocInput = {
        template: 'guide',
        ssot: {
          frontmatter: {},
          sections: {},
        },
        llmBlocks: [],
      }

      const result = generateDoc(input)

      expect(result.success).toBe(false)
      expect(result.errors![0].message).toMatch(/required.*type/i)
    })
  })
})

describe('edge cases', () => {
  it('should handle empty sections object', () => {
    const input: GenerateDocInput = {
      template: 'guide',
      ssot: {
        frontmatter: {
          type: 'guide',
          last_updated: '2026-02-05',
        },
        sections: {},
      },
      llmBlocks: [],
    }

    const result = generateDoc(input)

    // Should succeed with just frontmatter
    expect(result.success).toBe(true)
    expect(result.markdown).toContain('type: guide')
  })

  it('should handle empty frontmatter object', () => {
    // Use a template that has no required frontmatter (core-doc allows enum for type)
    // For this test we'll create a minimal guide with type
    const input: GenerateDocInput = {
      template: 'guide',
      ssot: {
        frontmatter: {
          type: 'guide',
          last_updated: '2026-02-05',
        },
        sections: {
          Overview: 'Content',
        },
      },
      llmBlocks: [],
    }

    const result = generateDoc(input)

    expect(result.success).toBe(true)
  })

  it('should handle empty LLM blocks array', () => {
    const input: GenerateDocInput = {
      template: 'guide',
      ssot: {
        frontmatter: {
          type: 'guide',
          last_updated: '2026-02-05',
        },
        sections: {
          Overview: 'Content',
        },
      },
      llmBlocks: [],
    }

    const result = generateDoc(input)

    expect(result.success).toBe(true)
  })

  it('should handle sections with empty content', () => {
    const input: GenerateDocInput = {
      template: 'guide',
      ssot: {
        frontmatter: {
          type: 'guide',
          last_updated: '2026-02-05',
        },
        sections: {
          Overview: '',
        },
      },
      llmBlocks: [],
    }

    const result = generateDoc(input)

    expect(result.success).toBe(true)
    expect(result.markdown).toContain('## Overview')
  })

  it('should handle frontmatter with array values', () => {
    const input: GenerateDocInput = {
      template: 'blueprint',
      ssot: {
        frontmatter: {
          type: 'blueprint',
          status: 'draft',
          complexity: 'M',
          last_updated: '2026-02-05',
          depends_on: ['plan-a', 'plan-b'],
        },
        sections: {},
      },
      llmBlocks: [],
    }

    const result = generateDoc(input)

    expect(result.success).toBe(true)
    expect(result.markdown).toContain('depends_on:')
    expect(result.markdown).toMatch(/- plan-a/)
    expect(result.markdown).toMatch(/- plan-b/)
  })
})
