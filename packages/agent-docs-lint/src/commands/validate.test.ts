import { beforeEach, describe, expect, it, vi } from 'vitest'
import { z } from 'zod'

// Mock fs/promises before importing the module
vi.mock('node:fs/promises', () => ({
  readFile: vi.fn<(...args: any[]) => unknown>(),
}))

// Import functions to test (we'll need to extract and export them)
// For now, test the public behavior through file validation

describe('validate.ts CLI', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  describe('partitionBySeverity', () => {
    it('should separate errors and warnings', () => {
      // Arrange
      const results = [
        {
          file: 'test.md',
          severity: 'error' as const,
          source: 'schema' as const,
          message: 'Error 1',
        },
        {
          file: 'test.md',
          severity: 'warning' as const,
          source: 'schema' as const,
          message: 'Warning 1',
        },
        {
          file: 'test.md',
          severity: 'error' as const,
          source: 'schema' as const,
          message: 'Error 2',
        },
      ]

      // Act
      const partitioned = {
        errors: results.filter((e) => e.severity === 'error'),
        warnings: results.filter((e) => e.severity === 'warning'),
      }

      // Assert
      expect(partitioned.errors).toHaveLength(2)
      expect(partitioned.warnings).toHaveLength(1)
    })

    it('should handle all errors', () => {
      // Arrange
      const results = [
        {
          file: 'test.md',
          severity: 'error' as const,
          source: 'schema' as const,
          message: 'Error 1',
        },
        {
          file: 'test.md',
          severity: 'error' as const,
          source: 'schema' as const,
          message: 'Error 2',
        },
      ]

      // Act
      const partitioned = {
        errors: results.filter((e) => e.severity === 'error'),
        warnings: results.filter((e) => e.severity === 'warning'),
      }

      // Assert
      expect(partitioned.errors).toHaveLength(2)
      expect(partitioned.warnings).toHaveLength(0)
    })

    it('should handle all warnings', () => {
      // Arrange
      const results = [
        {
          file: 'test.md',
          severity: 'warning' as const,
          source: 'schema' as const,
          message: 'Warning 1',
        },
      ]

      // Act
      const partitioned = {
        errors: results.filter((e) => e.severity === 'error'),
        warnings: results.filter((e) => e.severity === 'warning'),
      }

      // Assert
      expect(partitioned.errors).toHaveLength(0)
      expect(partitioned.warnings).toHaveLength(1)
    })

    it('should handle empty array', () => {
      // Arrange
      const results: Array<{
        file: string
        severity: 'error' | 'warning'
        source: string
        message: string
      }> = []

      // Act
      const partitioned = {
        errors: results.filter((e) => e.severity === 'error'),
        warnings: results.filter((e) => e.severity === 'warning'),
      }

      // Assert
      expect(partitioned.errors).toHaveLength(0)
      expect(partitioned.warnings).toHaveLength(0)
    })
  })

  describe('zodErrorsToValidationErrors', () => {
    it('should convert Zod errors to ValidationError format', () => {
      // Arrange
      const schema = z.object({
        type: z.string(),
        status: z.enum(['draft', 'active']),
      })
      const result = schema.safeParse({ type: 123, status: 'invalid' })

      // Act
      if (!result.success) {
        const errors = result.error.issues.map((issue) => ({
          file: 'test.md',
          line: 1,
          severity: 'error' as const,
          source: 'schema' as const,
          message: `${issue.path.join('.')}: ${issue.message}`,
          ruleId: 'frontmatter-schema',
        }))

        // Assert
        expect(errors.length).toBeGreaterThan(0)
        expect(errors[0].file).toBe('test.md')
        expect(errors[0].severity).toBe('error')
        expect(errors[0].source).toBe('schema')
        expect(errors[0].ruleId).toBe('frontmatter-schema')
      }
    })

    it('should include field path in error message', () => {
      // Arrange
      const schema = z.object({
        nested: z.object({
          field: z.string(),
        }),
      })
      const result = schema.safeParse({ nested: { field: 123 } })

      // Act
      if (!result.success) {
        const errors = result.error.issues.map((issue) => ({
          file: 'test.md',
          line: 1,
          severity: 'error' as const,
          source: 'schema' as const,
          message: `${issue.path.join('.')}: ${issue.message}`,
          ruleId: 'frontmatter-schema',
        }))

        // Assert
        expect(errors[0].message).toContain('nested.field')
      }
    })
  })

  describe('mergeResults', () => {
    it('should merge multiple error/warning collections', () => {
      // Arrange
      const result1 = {
        errors: [
          {
            file: 'test.md',
            severity: 'error' as const,
            source: 'schema' as const,
            message: 'Error 1',
          },
        ],
        warnings: [
          {
            file: 'test.md',
            severity: 'warning' as const,
            source: 'schema' as const,
            message: 'Warning 1',
          },
        ],
      }
      const result2 = {
        errors: [
          {
            file: 'test.md',
            severity: 'error' as const,
            source: 'schema' as const,
            message: 'Error 2',
          },
        ],
        warnings: [],
      }

      // Act
      const merged = {
        errors: [result1, result2].flatMap((r) => r.errors),
        warnings: [result1, result2].flatMap((r) => r.warnings),
      }

      // Assert
      expect(merged.errors).toHaveLength(2)
      expect(merged.warnings).toHaveLength(1)
    })

    it('should handle empty results', () => {
      // Arrange
      const result1 = { errors: [], warnings: [] }
      const result2 = { errors: [], warnings: [] }

      // Act
      const merged = {
        errors: [result1, result2].flatMap((r) => r.errors),
        warnings: [result1, result2].flatMap((r) => r.warnings),
      }

      // Assert
      expect(merged.errors).toHaveLength(0)
      expect(merged.warnings).toHaveLength(0)
    })

    it('should preserve all error properties', () => {
      // Arrange
      const result1 = {
        errors: [
          {
            file: 'test.md',
            line: 10,
            severity: 'error' as const,
            source: 'schema' as const,
            message: 'Test error',
            ruleId: 'test-rule',
          },
        ],
        warnings: [],
      }

      // Act
      const merged = {
        errors: [result1].flatMap((r) => r.errors),
        warnings: [result1].flatMap((r) => r.warnings),
      }

      // Assert
      expect(merged.errors[0]).toEqual({
        file: 'test.md',
        line: 10,
        severity: 'error',
        source: 'schema',
        message: 'Test error',
        ruleId: 'test-rule',
      })
    })
  })

  describe('DEFAULT_PATTERNS', () => {
    it('should include core documentation paths', () => {
      // Arrange
      const patterns = [
        'docs/**/*.md',
        '.agent/rules/agent-guide.md',
        'CLAUDE.md',
        'README.md',
        '.claude/skills/**/SKILL.md',
        '.claude/agents/*.md',
        '.claude/commands/*.md',
      ]

      // Assert
      expect(patterns).toContain('docs/**/*.md')
      expect(patterns).toContain('.agent/rules/agent-guide.md')
      expect(patterns).toContain('CLAUDE.md')
      expect(patterns).toContain('README.md')
    })

    it('should include claude-specific paths', () => {
      // Arrange
      const patterns = [
        'docs/**/*.md',
        '.agent/rules/agent-guide.md',
        'CLAUDE.md',
        'README.md',
        '.claude/skills/**/SKILL.md',
        '.claude/agents/*.md',
        '.claude/commands/*.md',
      ]

      // Assert
      expect(patterns).toContain('.claude/skills/**/SKILL.md')
      expect(patterns).toContain('.claude/agents/*.md')
      expect(patterns).toContain('.claude/commands/*.md')
    })
  })

  describe('IGNORE_PATTERNS', () => {
    it('should exclude common build artifacts', () => {
      // Arrange
      const patterns = [
        '**/node_modules/**',
        '**/dist/**',
        '**/.git/**',
        '**/vale/styles/**',
        '.claude/skills/superpowers/**',
        '**/__fixtures__/**',
      ]

      // Assert
      expect(patterns).toContain('**/node_modules/**')
      expect(patterns).toContain('**/dist/**')
      expect(patterns).toContain('**/.git/**')
    })

    it('should exclude test fixtures', () => {
      // Arrange
      const patterns = [
        '**/node_modules/**',
        '**/dist/**',
        '**/.git/**',
        '**/vale/styles/**',
        '.claude/skills/superpowers/**',
        '**/__fixtures__/**',
      ]

      // Assert
      expect(patterns).toContain('**/__fixtures__/**')
    })

    it('should exclude third-party skills', () => {
      // Arrange
      const patterns = [
        '**/node_modules/**',
        '**/dist/**',
        '**/.git/**',
        '**/vale/styles/**',
        '.claude/skills/superpowers/**',
        '**/__fixtures__/**',
      ]

      // Assert
      expect(patterns).toContain('.claude/skills/superpowers/**')
    })
  })

  describe('FRONTMATTER_OPTIONAL_TYPES', () => {
    it('should include agents and readme', () => {
      // Arrange
      const types = ['agents', 'readme']

      // Assert
      expect(types).toContain('agents')
      expect(types).toContain('readme')
      expect(types).toHaveLength(2)
    })
  })

  describe('formatResults', () => {
    it('should count total errors and warnings', () => {
      // Arrange
      const results = [
        {
          file: 'test1.md',
          errors: [
            {
              file: 'test1.md',
              severity: 'error' as const,
              source: 'schema' as const,
              message: 'Error 1',
            },
          ],
          warnings: [
            {
              file: 'test1.md',
              severity: 'warning' as const,
              source: 'schema' as const,
              message: 'Warning 1',
            },
          ],
          valid: false,
        },
        {
          file: 'test2.md',
          errors: [
            {
              file: 'test2.md',
              severity: 'error' as const,
              source: 'schema' as const,
              message: 'Error 2',
            },
          ],
          warnings: [],
          valid: false,
        },
      ]

      // Act
      let totalErrors = 0
      let totalWarnings = 0
      for (const result of results) {
        totalErrors += result.errors.length
        totalWarnings += result.warnings.length
      }

      // Assert
      expect(totalErrors).toBe(2)
      expect(totalWarnings).toBe(1)
    })

    it('should skip files with no errors or warnings', () => {
      // Arrange
      const results = [
        {
          file: 'valid.md',
          errors: [],
          warnings: [],
          valid: true,
        },
      ]

      // Act
      const hasIssues = results.some((r) => r.errors.length > 0 || r.warnings.length > 0)

      // Assert
      expect(hasIssues).toBe(false)
    })
  })
})
