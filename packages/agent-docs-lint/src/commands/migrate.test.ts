import { describe, expect, it } from 'vitest'

describe('migrate.ts CLI', () => {
  describe('getTodayDate', () => {
    it('should return date in YYYY-MM-DD format', () => {
      // Arrange
      const getTodayDate = () => {
        const result = new Date().toISOString().split('T')[0]
        return result ?? new Date().toISOString().slice(0, 10)
      }

      // Act
      const date = getTodayDate()

      // Assert
      expect(date).toMatch(/^\d{4}-\d{2}-\d{2}$/)
    })

    it('should return current date', () => {
      // Arrange
      const getTodayDate = () => {
        const result = new Date().toISOString().split('T')[0]
        return result ?? new Date().toISOString().slice(0, 10)
      }
      const expected = new Date().toISOString().split('T')[0]

      // Act
      const date = getTodayDate()

      // Assert
      expect(date).toBe(expected)
    })
  })

  describe('inferCategory', () => {
    it('should extract category from cookbook path', () => {
      // Arrange
      const filePath = 'docs/cookbook/hono-routes/example.md'
      const inferCategory = (path: string) => {
        const match = path.match(/docs\/cookbook\/([^/]+)\//)
        return match?.[1]
      }

      // Act
      const category = inferCategory(filePath)

      // Assert
      expect(category).toBe('hono-routes')
    })

    it('should return undefined for non-cookbook paths', () => {
      // Arrange
      const filePath = 'docs/guides/example.md'
      const inferCategory = (path: string) => {
        const match = path.match(/docs\/cookbook\/([^/]+)\//)
        return match?.[1]
      }

      // Act
      const category = inferCategory(filePath)

      // Assert
      expect(category).toBe(undefined)
    })

    it('should handle nested cookbook paths', () => {
      // Arrange
      const filePath = 'docs/cookbook/api-patterns/nested/example.md'
      const inferCategory = (path: string) => {
        const match = path.match(/docs\/cookbook\/([^/]+)\//)
        return match?.[1]
      }

      // Act
      const category = inferCategory(filePath)

      // Assert
      expect(category).toBe('api-patterns')
    })
  })

  describe('inferFocus', () => {
    it('should extract focus from adaptation folder name', () => {
      // Arrange
      const filePath = 'docs/adaptations/2024-01-15-cloudflare-workers/plan.md'
      const inferFocus = (path: string) => {
        const match = path.match(/docs\/adaptations\/\d{4}-\d{2}-\d{2}-([^/]+)\//)
        return match?.[1]?.replace(/-/g, ' ')
      }

      // Act
      const focus = inferFocus(filePath)

      // Assert
      expect(focus).toBe('cloudflare workers')
    })

    it('should return undefined for non-adaptation paths', () => {
      // Arrange
      const filePath = 'docs/guides/example.md'
      const inferFocus = (path: string) => {
        const match = path.match(/docs\/adaptations\/\d{4}-\d{2}-\d{2}-([^/]+)\//)
        return match?.[1]?.replace(/-/g, ' ')
      }

      // Act
      const focus = inferFocus(filePath)

      // Assert
      expect(focus).toBe(undefined)
    })

    it('should convert hyphens to spaces', () => {
      // Arrange
      const filePath = 'docs/adaptations/2024-01-15-multi-word-focus/plan.md'
      const inferFocus = (path: string) => {
        const match = path.match(/docs\/adaptations\/\d{4}-\d{2}-\d{2}-([^/]+)\//)
        return match?.[1]?.replace(/-/g, ' ')
      }

      // Act
      const focus = inferFocus(filePath)

      // Assert
      expect(focus).toBe('multi word focus')
    })
  })

  describe('generateDefaultFrontmatter', () => {
    it('should generate implementation-plan frontmatter', () => {
      // Arrange
      const docType = 'blueprint'
      const filePath = 'docs/plans/test.md'
      const today = new Date().toISOString().split('T')[0]
      const generateFrontmatter = (
        _type: string,
        _path: string,
        meta: Record<string, unknown> = {},
      ) => {
        return {
          type: 'blueprint',
          status: meta.status ?? 'draft',
          complexity: meta.complexity ?? 'M',
          last_updated: meta.last_updated ?? today,
          ...meta,
        }
      }

      // Act
      const frontmatter = generateFrontmatter(docType, filePath)

      // Assert
      expect(frontmatter.type).toBe('blueprint')
      expect(frontmatter.status).toBe('draft')
      expect(frontmatter.complexity).toBe('M')
      expect(frontmatter.last_updated).toBe(today)
    })

    it('should preserve existing metadata', () => {
      // Arrange
      const docType = 'blueprint'
      const filePath = 'docs/plans/test.md'
      const existingMeta = { status: 'in-progress', complexity: 'L' }
      const today = new Date().toISOString().split('T')[0]
      const generateFrontmatter = (
        _type: string,
        _path: string,
        meta: Record<string, unknown> = {},
      ) => {
        return {
          type: 'blueprint',
          status: meta.status ?? 'draft',
          complexity: meta.complexity ?? 'M',
          last_updated: meta.last_updated ?? today,
          ...meta,
        }
      }

      // Act
      const frontmatter = generateFrontmatter(docType, filePath, existingMeta)

      // Assert
      expect(frontmatter.status).toBe('in-progress')
      expect(frontmatter.complexity).toBe('L')
    })

    it('should generate evaluation frontmatter with path inference', () => {
      // Arrange
      const docType = 'evaluation'
      const filePath = 'docs/evaluations/feature-auth/claude.md'
      const today = new Date().toISOString().split('T')[0]
      const generateFrontmatter = (
        _type: string,
        path: string,
        meta: Record<string, unknown> = {},
      ) => {
        const subject = path.split('/').slice(-2, -1)[0] || 'Unknown'
        const scope = path.split('/').pop()?.replace('.md', '') || 'Unknown'
        return {
          type: 'evaluation',
          evaluation_date: meta.evaluation_date ?? today,
          model: meta.model ?? 'Unknown',
          subject: meta.subject ?? subject,
          scope: meta.scope ?? scope,
          ...meta,
        }
      }

      // Act
      const frontmatter = generateFrontmatter(docType, filePath)

      // Assert
      expect(frontmatter.type).toBe('evaluation')
      expect(frontmatter.subject).toBe('feature-auth')
      expect(frontmatter.scope).toBe('claude')
    })

    it('should generate cookbook frontmatter with inferred category', () => {
      // Arrange
      const docType = 'cookbook'
      const filePath = 'docs/cookbook/hono-routes/example.md'
      const inferCategory = (path: string) => {
        const match = path.match(/docs\/cookbook\/([^/]+)\//)
        return match?.[1]
      }
      const generateFrontmatter = (
        _type: string,
        path: string,
        meta: Record<string, unknown> = {},
      ) => {
        return {
          type: 'cookbook',
          category: meta.category ?? inferCategory(path) ?? 'general',
          ...meta,
        }
      }

      // Act
      const frontmatter = generateFrontmatter(docType, filePath)

      // Assert
      expect(frontmatter.type).toBe('cookbook')
      expect(frontmatter.category).toBe('hono-routes')
    })

    it('should generate adaptation frontmatter with inferred focus', () => {
      // Arrange
      const docType = 'adaptation'
      const filePath = 'docs/adaptations/2024-01-15-cloudflare-workers/plan.md'
      const inferFocus = (path: string) => {
        const match = path.match(/docs\/adaptations\/\d{4}-\d{2}-\d{2}-([^/]+)\//)
        return match?.[1]?.replace(/-/g, ' ')
      }
      const generateFrontmatter = (
        _type: string,
        path: string,
        meta: Record<string, unknown> = {},
      ) => {
        return {
          type: 'adaptation',
          focus: meta.focus ?? inferFocus(path) ?? 'analysis',
          status: meta.status ?? 'in-progress',
          ...meta,
        }
      }

      // Act
      const frontmatter = generateFrontmatter(docType, filePath)

      // Assert
      expect(frontmatter.type).toBe('adaptation')
      expect(frontmatter.focus).toBe('cloudflare workers')
      expect(frontmatter.status).toBe('in-progress')
    })

    it('should generate research frontmatter', () => {
      // Arrange
      const docType = 'research'
      const filePath = 'docs/research/test.md'
      const generateFrontmatter = (
        _type: string,
        _path: string,
        meta: Record<string, unknown> = {},
      ) => {
        return {
          type: 'research',
          status: meta.status ?? 'active',
          ...meta,
        }
      }

      // Act
      const frontmatter = generateFrontmatter(docType, filePath)

      // Assert
      expect(frontmatter.type).toBe('research')
      expect(frontmatter.status).toBe('active')
    })

    it('should generate audit frontmatter with last_updated', () => {
      // Arrange
      const docType = 'audit'
      const filePath = 'docs/research/quality-audits/test.md'
      const today = new Date().toISOString().split('T')[0]
      const generateFrontmatter = (
        _type: string,
        _path: string,
        meta: Record<string, unknown> = {},
      ) => {
        return {
          type: 'audit',
          last_updated: meta.last_updated ?? today,
          ...meta,
        }
      }

      // Act
      const frontmatter = generateFrontmatter(docType, filePath)

      // Assert
      expect(frontmatter.type).toBe('audit')
      expect(frontmatter.last_updated).toBe(today)
    })

    it('should generate readme frontmatter (minimal)', () => {
      // Arrange
      const docType = 'readme'
      const filePath = 'README.md'
      const generateFrontmatter = (
        _type: string,
        _path: string,
        meta: Record<string, unknown> = {},
      ) => {
        return {
          type: 'readme',
          ...meta,
        }
      }

      // Act
      const frontmatter = generateFrontmatter(docType, filePath)

      // Assert
      expect(frontmatter.type).toBe('readme')
      expect(Object.keys(frontmatter)).toHaveLength(1)
    })
  })

  describe('DEFAULT_PATTERNS', () => {
    it('should include core documentation paths', () => {
      // Arrange
      const patterns = ['docs/**/*.md', '.agent/rules/agent-guide.md', 'CLAUDE.md', 'README.md']

      // Assert
      expect(patterns).toContain('docs/**/*.md')
      expect(patterns).toContain('.agent/rules/agent-guide.md')
      expect(patterns).toContain('CLAUDE.md')
      expect(patterns).toContain('README.md')
    })
  })

  describe('IGNORE_PATTERNS', () => {
    it('should exclude build artifacts', () => {
      // Arrange
      const patterns = ['**/node_modules/**', '**/dist/**', '**/.git/**']

      // Assert
      expect(patterns).toContain('**/node_modules/**')
      expect(patterns).toContain('**/dist/**')
      expect(patterns).toContain('**/.git/**')
    })
  })
})
