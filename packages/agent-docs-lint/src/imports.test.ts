import { dirname, resolve } from 'node:path'
import { describe, expect, it } from 'vitest'

import { extractImports, resolveImportPath, validateImports } from './validators/imports'

describe('extractImports', () => {
  describe('valid imports', () => {
    it('should extract simple @import with extension', () => {
      // Arrange
      const content = '@.agent/rules/agent-guide.md'

      // Act
      const result = extractImports(content)

      // Assert
      expect(result).toHaveLength(1)
      expect(result[0].path).toBe('.agent/rules/agent-guide.md')
      expect(result[0].line).toBe(1)
    })

    it('should extract relative imports with ./', () => {
      // Arrange
      const content = '@./docs/guide.md'

      // Act
      const result = extractImports(content)

      // Assert
      expect(result).toHaveLength(1)
      expect(result[0].path).toBe('./docs/guide.md')
    })

    it('should extract parent directory imports with ../', () => {
      // Arrange
      const content = '@../README.md'

      // Act
      const result = extractImports(content)

      // Assert
      expect(result).toHaveLength(1)
      expect(result[0].path).toBe('../README.md')
    })

    it('should extract multiple imports', () => {
      // Arrange
      const content = `# Title

@.agent/rules/agent-guide.md

Some text

@./docs/guide.md

More text

@../README.md`

      // Act
      const result = extractImports(content)

      // Assert
      expect(result).toHaveLength(3)
      expect(result[0].path).toBe('.agent/rules/agent-guide.md')
      expect(result[0].line).toBe(3)
      expect(result[1].path).toBe('./docs/guide.md')
      expect(result[1].line).toBe(7)
      expect(result[2].path).toBe('../README.md')
      expect(result[2].line).toBe(11)
    })

    it('should handle imports with whitespace before/after', () => {
      // Arrange
      const content = '   @.agent/rules/agent-guide.md   '

      // Act
      const result = extractImports(content)

      // Assert
      expect(result).toHaveLength(1)
      expect(result[0].path).toBe('.agent/rules/agent-guide.md')
    })
  })

  describe('code blocks', () => {
    it('should skip imports inside code blocks', () => {
      // Arrange
      const content = `# Title

\`\`\`bash
@.agent/rules/agent-guide.md
\`\`\`

@REAL.md`

      // Act
      const result = extractImports(content)

      // Assert
      expect(result).toHaveLength(1)
      expect(result[0].path).toBe('REAL.md')
    })

    it('should handle multiple code blocks', () => {
      // Arrange
      const content = `@before.md

\`\`\`
@inside1.md
\`\`\`

@between.md

\`\`\`js
@inside2.md
\`\`\`

@after.md`

      // Act
      const result = extractImports(content)

      // Assert
      expect(result).toHaveLength(3)
      expect(result.map((r) => r.path)).toEqual(['before.md', 'between.md', 'after.md'])
    })

    it('should handle nested code markers in content', () => {
      // Arrange
      const content = `@valid.md

\`\`\`
Code with \`inline\` markers
@invalid.md
\`\`\``

      // Act
      const result = extractImports(content)

      // Assert
      expect(result).toHaveLength(1)
      expect(result[0].path).toBe('valid.md')
    })
  })

  describe('decorators and npm packages', () => {
    it('should skip decorators with parentheses', () => {
      // Arrange
      const content = `@decorator()
@VALID.md
@migrations([1,2,3])`

      // Act
      const result = extractImports(content)

      // Assert
      expect(result).toHaveLength(1)
      expect(result[0].path).toBe('VALID.md')
    })

    it('should skip decorators with brackets', () => {
      // Arrange
      const content = `@decorator[]
@VALID.md
@migrations[1]`

      // Act
      const result = extractImports(content)

      // Assert
      expect(result).toHaveLength(1)
      expect(result[0].path).toBe('VALID.md')
    })

    it('should skip npm packages (@org/package)', () => {
      // Arrange
      const content = `@webpresso/utils
@VALID.md
@anthropic/sdk`

      // Act
      const result = extractImports(content)

      // Assert
      expect(result).toHaveLength(1)
      expect(result[0].path).toBe('VALID.md')
    })

    it('should skip bare @ symbols without paths', () => {
      // Arrange
      const content = `@
@ invalid
@VALID.md`

      // Act
      const result = extractImports(content)

      // Assert
      expect(result).toHaveLength(1)
      expect(result[0].path).toBe('VALID.md')
    })
  })

  describe('edge cases', () => {
    it('should handle empty content', () => {
      // Arrange
      const content = ''

      // Act
      const result = extractImports(content)

      // Assert
      expect(result).toHaveLength(0)
    })

    it('should handle content with no imports', () => {
      // Arrange
      const content = '# Just a heading\n\nSome text'

      // Act
      const result = extractImports(content)

      // Assert
      expect(result).toHaveLength(0)
    })

    it('should handle imports on first line', () => {
      // Arrange
      const content = '@FIRST.md\nRest of content'

      // Act
      const result = extractImports(content)

      // Assert
      expect(result).toHaveLength(1)
      expect(result[0].line).toBe(1)
    })

    it('should skip empty lines', () => {
      // Arrange
      const content = '\n\n@VALID.md\n\n'

      // Act
      const result = extractImports(content)

      // Assert
      expect(result).toHaveLength(1)
      expect(result[0].path).toBe('VALID.md')
    })
  })
})

describe('resolveImportPath', () => {
  it('should resolve relative path with ./', () => {
    // Arrange
    const importPath = './guide.md'
    const fromFile = '/project/docs/README.md'
    const projectRoot = '/project'

    // Act
    const result = resolveImportPath(importPath, fromFile, projectRoot)

    // Assert
    expect(result).toBe(resolve('/project/docs', 'guide.md'))
  })

  it('should resolve parent path with ../', () => {
    // Arrange
    const importPath = '../.agent/rules/agent-guide.md'
    const fromFile = '/project/docs/plans/plan.md'
    const projectRoot = '/project'

    // Act
    const result = resolveImportPath(importPath, fromFile, projectRoot)

    // Assert
    expect(result).toBe(resolve('/project/docs', '.agent/rules/agent-guide.md'))
  })

  it('should resolve root-relative path', () => {
    // Arrange
    const importPath = '.agent/rules/agent-guide.md'
    const fromFile = '/project/docs/README.md'
    const projectRoot = '/project'

    // Act
    const result = resolveImportPath(importPath, fromFile, projectRoot)

    // Assert
    expect(result).toBe(resolve('/project', '.agent/rules/agent-guide.md'))
  })

  it('should resolve nested relative path', () => {
    // Arrange
    const importPath = './subdir/file.md'
    const fromFile = '/project/docs/README.md'
    const projectRoot = '/project'

    // Act
    const result = resolveImportPath(importPath, fromFile, projectRoot)

    // Assert
    expect(result).toBe(resolve('/project/docs/subdir', 'file.md'))
  })

  it('should resolve multiple parent directories', () => {
    // Arrange
    const importPath = '../../root.md'
    const fromFile = '/project/docs/plans/2024/plan.md'
    const projectRoot = '/project'

    // Act
    const result = resolveImportPath(importPath, fromFile, projectRoot)

    // Assert
    expect(result).toBe(resolve('/project/docs', 'root.md'))
  })
})

describe('validateImports', () => {
  describe('file existence', () => {
    it('should error when imported file does not exist', () => {
      // Arrange
      const filePath = __filename // This file exists
      const content = '@./nonexistent.md'
      const projectRoot = dirname(__filename)

      // Act
      const errors = validateImports(filePath, content, projectRoot)

      // Assert
      expect(errors.length).toBeGreaterThan(0)
      const notFoundError = errors.find((e) => e.ruleId === 'import-not-found')
      expect(notFoundError).toEqual(
        expect.objectContaining({
          ruleId: 'import-not-found',
          severity: 'error',
          message: expect.stringContaining('Import not found'),
        }),
      )
      expect(notFoundError?.message).toContain('@./nonexistent.md')
    })

    it('should pass when imported file exists', () => {
      // Arrange
      const filePath = __filename
      const content = `@${__filename.split('/').pop()}` // Import this very file
      const projectRoot = dirname(__filename)

      // Act
      const errors = validateImports(filePath, content, projectRoot)

      // Assert
      // Should have no "import-not-found" errors
      const notFoundErrors = errors.filter((e) => e.ruleId === 'import-not-found')
      expect(notFoundErrors).toHaveLength(0)
    })
  })

  describe('import count warning', () => {
    it('should warn when >10 imports', () => {
      // Arrange
      const filePath = __filename
      // Create content with 11 imports (all to non-existent files, but count triggers first)
      const imports = Array.from({ length: 11 }, (_, i) => `@file${i}.md`)
      const content = imports.join('\n')
      const projectRoot = dirname(__filename)

      // Act
      const errors = validateImports(filePath, content, projectRoot)

      // Assert
      const countWarning = errors.find((e) => e.ruleId === 'import-count')
      expect(countWarning).toEqual(
        expect.objectContaining({
          ruleId: 'import-count',
          severity: 'warning',
          message: expect.stringContaining('11'),
        }),
      )
      expect(countWarning?.message).toContain('Consider consolidating')
    })

    it('should not warn with ≤10 imports', () => {
      // Arrange
      const filePath = __filename
      const imports = Array.from({ length: 10 }, (_, i) => `@file${i}.md`)
      const content = imports.join('\n')
      const projectRoot = dirname(__filename)

      // Act
      const errors = validateImports(filePath, content, projectRoot)

      // Assert
      const countWarning = errors.find((e) => e.ruleId === 'import-count')
      expect(countWarning).toBe(undefined)
    })
  })

  describe('no imports', () => {
    it('should return empty array when no imports', () => {
      // Arrange
      const filePath = __filename
      const content = '# Just some content\n\nNo imports here'
      const projectRoot = dirname(__filename)

      // Act
      const errors = validateImports(filePath, content, projectRoot)

      // Assert
      expect(errors).toHaveLength(0)
    })
  })

  describe('circular dependencies', () => {
    it('should detect self-import as circular', () => {
      // Arrange
      const filePath = __filename
      const content = `@${__filename.split('/').pop()}` // Import itself
      const projectRoot = dirname(__filename)

      // Act
      const errors = validateImports(filePath, content, projectRoot)

      // Assert
      const circularError = errors.find((e) => e.ruleId === 'circular-import')
      expect(circularError).toEqual(
        expect.objectContaining({
          ruleId: 'circular-import',
          severity: 'error',
          message: expect.stringContaining('Circular import detected'),
        }),
      )
    })
  })

  describe('multi-line and re-exports', () => {
    it('should handle multi-line imports with line breaks', () => {
      // Arrange
      const content = `# Title

@./file1.md
@./file2.md
@./file3.md`

      // Act
      const result = extractImports(content)

      // Assert
      expect(result).toHaveLength(3)
      expect(result.map((r) => r.path)).toEqual(['./file1.md', './file2.md', './file3.md'])
    })

    it('should handle re-export pattern with extensions', () => {
      // Arrange
      const content = `# Module

@./core.md
@./utils.md
@./types.md`

      // Act
      const result = extractImports(content)

      // Assert
      expect(result).toHaveLength(3)
      expect(result.every((r) => r.path.startsWith('./'))).toBe(true)
    })
  })
})
