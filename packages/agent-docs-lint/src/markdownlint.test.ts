import { describe, expect, it } from 'vitest'

import { validateMarkdownlint } from './validators/markdownlint'

describe('validateMarkdownlint', () => {
  describe('valid markdown', () => {
    it('should pass for well-formatted markdown', () => {
      // Arrange
      const content = `# Title

## Section

Some content here.

- Item 1
- Item 2

\`\`\`js
const x = 1;
\`\`\`
`

      // Act
      const { errors } = validateMarkdownlint('test.md', content)

      // Assert
      expect(errors).toHaveLength(0)
    })

    it('should pass for frontmatter + content', () => {
      // Arrange
      const content = `---
type: test
---

## Heading

Content here.
`

      // Act
      const { errors } = validateMarkdownlint('test.md', content)

      // Assert
      expect(errors).toHaveLength(0)
    })
  })

  describe('heading violations', () => {
    it('should detect skipped heading levels (MD001)', () => {
      // Arrange
      const content = `# Title

### Skipped H2
`

      // Act
      const { errors } = validateMarkdownlint('test.md', content)

      // Assert
      expect(errors.length).toBeGreaterThan(0)
      const md001Error = errors.find((e) => e.ruleId.includes('MD001'))
      expect(md001Error).toEqual(
        expect.objectContaining({
          ruleId: expect.stringContaining('MD001'),
          severity: 'warning',
        }),
      )
    })

    it('should detect missing space after # (MD018)', () => {
      // Arrange
      const content = '#Title without space'

      // Act
      const { errors } = validateMarkdownlint('test.md', content)

      // Assert
      expect(errors.length).toBeGreaterThan(0)
      const md018Error = errors.find((e) => e.ruleId.includes('MD018'))
      expect(md018Error).toEqual(
        expect.objectContaining({
          ruleId: expect.stringContaining('MD018'),
          severity: 'warning',
        }),
      )
    })

    it('should detect duplicate headings at same level (MD024)', () => {
      // Arrange
      const content = `# Introduction

Some text.

# Introduction

More text.
`

      // Act
      const { errors } = validateMarkdownlint('test.md', content)

      // Assert
      expect(errors.length).toBeGreaterThan(0)
      const md024Error = errors.find((e) => e.ruleId.includes('MD024'))
      expect(md024Error).toEqual(
        expect.objectContaining({
          ruleId: expect.stringContaining('MD024'),
          severity: 'warning',
        }),
      )
    })
  })

  describe('blank line violations', () => {
    it('should detect too many blank lines (MD012)', () => {
      // Arrange
      const content = `# Title



Content after 3 blank lines (max 2).
`

      // Act
      const { errors } = validateMarkdownlint('test.md', content)

      // Assert
      expect(errors.length).toBeGreaterThan(0)
      const md012Error = errors.find((e) => e.ruleId.includes('MD012'))
      expect(md012Error).toEqual(
        expect.objectContaining({
          ruleId: expect.stringContaining('MD012'),
          severity: 'warning',
        }),
      )
    })

    it('should NOT detect missing blank lines around code fences (MD031 disabled)', () => {
      // Arrange - MD031 is disabled due to 132+ existing violations (cosmetic rule)
      const content = `Some text
\`\`\`js
code
\`\`\`
More text`

      // Act
      const { errors } = validateMarkdownlint('test.md', content)

      // Assert - MD031 is intentionally disabled in config
      const md031Error = errors.find((e) => e.ruleId.includes('MD031'))
      expect(md031Error).toBe(undefined)
    })
  })

  describe('code block violations', () => {
    it('should detect missing language in fenced code (MD040)', () => {
      // Arrange
      const content = `# Title

\`\`\`
code without language
\`\`\`
`

      // Act
      const { errors } = validateMarkdownlint('test.md', content)

      // Assert
      expect(errors.length).toBeGreaterThan(0)
      const md040Error = errors.find((e) => e.ruleId.includes('MD040'))
      expect(md040Error).toEqual(
        expect.objectContaining({
          ruleId: expect.stringContaining('MD040'),
          severity: 'warning',
        }),
      )
    })

    it('should allow fenced code blocks with language', () => {
      // Arrange
      const content = `# Title

\`\`\`js
const x = 1;
\`\`\`
`

      // Act
      const { errors } = validateMarkdownlint('test.md', content)

      // Assert
      const md040Error = errors.find((e) => e.ruleId.includes('MD040'))
      expect(md040Error).toBe(undefined)
    })
  })

  describe('list violations', () => {
    it('should detect inconsistent list markers (MD004)', () => {
      // Arrange
      const content = `# Title

- Item 1
* Item 2
`

      // Act
      const { errors } = validateMarkdownlint('test.md', content)

      // Assert
      expect(errors.length).toBeGreaterThan(0)
      const md004Error = errors.find((e) => e.ruleId.includes('MD004'))
      expect(md004Error).toEqual(
        expect.objectContaining({
          ruleId: expect.stringContaining('MD004'),
          severity: 'warning',
        }),
      )
    })

    it('should allow consistent dash markers', () => {
      // Arrange
      const content = `# Title

- Item 1
- Item 2
- Item 3
`

      // Act
      const { errors } = validateMarkdownlint('test.md', content)

      // Assert
      const md004Error = errors.find((e) => e.ruleId.includes('MD004'))
      expect(md004Error).toBe(undefined)
    })
  })

  describe('link violations', () => {
    it('should NOT detect bare URLs (MD034 disabled)', () => {
      // Arrange - MD034 is disabled due to 56+ existing violations (cosmetic rule)
      const content = `# Title

See https://example.com for more info.
`

      // Act
      const { errors } = validateMarkdownlint('test.md', content)

      // Assert - MD034 is intentionally disabled in config
      const md034Error = errors.find((e) => e.ruleId.includes('MD034'))
      expect(md034Error).toBe(undefined)
    })

    it('should allow properly formatted links', () => {
      // Arrange
      const content = `# Title

See [example](https://example.com) for more info.
`

      // Act
      const { errors } = validateMarkdownlint('test.md', content)

      // Assert
      const md034Error = errors.find((e) => e.ruleId.includes('MD034'))
      expect(md034Error).toBe(undefined)
    })
  })

  describe('whitespace violations', () => {
    it('should NOT detect trailing spaces (MD009 disabled)', () => {
      // Arrange - MD009 is disabled as cosmetic rule
      const content = '# Title\n\nSome content here.   '

      // Act
      const { errors } = validateMarkdownlint('test.md', content)

      // Assert - MD009 is intentionally disabled in config
      const md009Error = errors.find((e) => e.ruleId.includes('MD009'))
      expect(md009Error).toBe(undefined)
    })

    it('should detect hard tabs (MD010)', () => {
      // Arrange
      const content = '# Title\n\n\tIndented with tab'

      // Act
      const { errors } = validateMarkdownlint('test.md', content)

      // Assert
      expect(errors.length).toBeGreaterThan(0)
      const md010Error = errors.find((e) => e.ruleId.includes('MD010'))
      expect(md010Error).toEqual(
        expect.objectContaining({
          ruleId: expect.stringContaining('MD010'),
          severity: 'warning',
        }),
      )
    })
  })

  describe('error format', () => {
    it('should return errors as warnings', () => {
      // Arrange
      const content = '#Missing space'

      // Act
      const { errors } = validateMarkdownlint('test.md', content)

      // Assert
      expect(errors.length).toBeGreaterThan(0)
      expect(errors.every((e) => e.severity === 'warning')).toBe(true)
    })

    it('should include file path', () => {
      // Arrange
      const content = '#Missing space'
      const filePath = 'custom/path/test.md'

      // Act
      const { errors } = validateMarkdownlint(filePath, content)

      // Assert
      expect(errors[0].file).toBe(filePath)
    })

    it('should include line numbers', () => {
      // Arrange
      const content = `# Title

#Missing space on line 3
`

      // Act
      const { errors } = validateMarkdownlint('test.md', content)

      // Assert
      expect(errors.length).toBeGreaterThan(0)
      const md018Error = errors.find((e) => e.ruleId.includes('MD018'))
      expect(md018Error?.line).toBe(3)
    })

    it('should include rule description', () => {
      // Arrange
      const content = '#Missing space'

      // Act
      const { errors } = validateMarkdownlint('test.md', content)

      // Assert
      expect(typeof errors[0].message).toBe('string')
      expect(errors[0].message.length).toBeGreaterThan(0)
    })

    it('should format ruleId from rule names', () => {
      // Arrange
      const content = '#Missing space'

      // Act
      const { errors } = validateMarkdownlint('test.md', content)

      // Assert
      expect(errors[0].ruleId).toContain('MD018')
      expect(errors[0].source).toBe('markdownlint')
    })
  })

  describe('multiple violations', () => {
    it('should return all violations from enabled rules', () => {
      // Arrange - Note: MD034 (bare URLs) and others are disabled
      const content = `#Missing space

### Skipped H2



Too many blank lines

\`\`\`
No language
\`\`\`
`

      // Act
      const { errors } = validateMarkdownlint('test.md', content)

      // Assert - Expects MD018, MD001, MD012, MD040 (4 errors from enabled rules)
      // Note: MD034 (bare URLs) is disabled, so bare URL wouldn't be counted
      expect(errors.length).toBeGreaterThanOrEqual(3)
    })
  })

  describe('edge cases', () => {
    it('should handle empty results for file', () => {
      // Arrange
      const content = '# Perfect Markdown\n\nNothing wrong here.\n'

      // Act
      const { errors } = validateMarkdownlint('empty-test.md', content)

      // Assert
      expect(errors).toHaveLength(0)
    })

    it('should handle rule configuration edge cases', () => {
      // Arrange
      const content = `# Title

---

Content after hr.
`

      // Act
      const { errors } = validateMarkdownlint('test.md', content)

      // Assert
      // Should pass with configured hr-style
      const hrError = errors.find((e) => e.ruleId.includes('MD035'))
      expect(hrError).toBe(undefined)
    })
  })

  describe('disabled rules', () => {
    it('should not check single-h1 (MD025) - disabled', () => {
      // Arrange
      const content = `# First H1

# Second H1
`

      // Act
      const { errors } = validateMarkdownlint('test.md', content)

      // Assert
      const md025Error = errors.find((e) => e.ruleId.includes('MD025'))
      expect(md025Error).toBe(undefined)
    })

    it('should not check first-line-h1 (MD041) - disabled', () => {
      // Arrange
      const content = `Some text before heading.

# Heading
`

      // Act
      const { errors } = validateMarkdownlint('test.md', content)

      // Assert
      const md041Error = errors.find((e) => e.ruleId.includes('MD041'))
      expect(md041Error).toBe(undefined)
    })

    it('should not check line-length (MD013) - disabled', () => {
      // Arrange
      const content = `# Title

${'a'.repeat(200)}
`

      // Act
      const { errors } = validateMarkdownlint('test.md', content)

      // Assert
      const md013Error = errors.find((e) => e.ruleId.includes('MD013'))
      expect(md013Error).toBe(undefined)
    })
  })
})
