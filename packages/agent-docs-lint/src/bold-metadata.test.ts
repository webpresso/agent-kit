import { describe, expect, it } from 'vitest'

import { hasBoldMetadata, normalizeBoldMetadata, parseBoldMetadata } from './parsers/bold-metadata'

describe('hasBoldMetadata', () => {
  it('should detect bold metadata with 2+ lines', () => {
    // Arrange
    const content = `# Title

**Status**: Draft
**Complexity**: M`

    // Act
    const result = hasBoldMetadata(content)

    // Assert
    expect(result).toBe(true)
  })

  it('should return true with only 1 bold metadata line', () => {
    // Arrange
    const content = `# Title

**Status**: Draft`

    // Act
    const result = hasBoldMetadata(content)

    // Assert
    expect(result).toBe(true)
  })

  it('should return false with no bold metadata', () => {
    // Arrange
    const content = `# Title

Regular content here.`

    // Act
    const result = hasBoldMetadata(content)

    // Assert
    expect(result).toBe(false)
  })

  it('should check only first 20 lines', () => {
    // Arrange
    const content = `# Title\n\n${'Regular content\n'.repeat(20)}**Status**: Draft\n**Complexity**: M`

    // Act
    const result = hasBoldMetadata(content)

    // Assert
    expect(result).toBe(false) // Metadata is beyond first 20 lines
  })

  it('should handle whitespace around bold metadata', () => {
    // Arrange
    const content = `# Title

  **Status**: Draft
  **Complexity**: M  `

    // Act
    const result = hasBoldMetadata(content)

    // Assert
    expect(result).toBe(true)
  })

  it('should require colon after bold key', () => {
    // Arrange
    const content = `# Title

**Status** Draft
**Complexity** M`

    // Act
    const result = hasBoldMetadata(content)

    // Assert
    expect(result).toBe(false)
  })
})

describe('parseBoldMetadata', () => {
  it('should parse basic bold metadata', () => {
    // Arrange
    const content = `# Title

**Status**: Draft
**Complexity**: M

Content here.`

    // Act
    const result = parseBoldMetadata(content)

    // Assert
    expect(result.metadata.status).toBe('Draft')
    expect(result.metadata.complexity).toBe('M')
  })

  it('should remove metadata lines from content', () => {
    // Arrange
    const content = `# Title

**Status**: Draft
**Complexity**: M

Content here.`

    // Act
    const result = parseBoldMetadata(content)

    // Assert
    expect(result.contentWithoutMetadata).not.toContain('**Status**')
    expect(result.contentWithoutMetadata).not.toContain('**Complexity**')
    expect(result.contentWithoutMetadata).toContain('Content here')
  })

  it('should normalize known keys', () => {
    // Arrange
    const content = `# Title

**Status**: Draft
**Last Updated**: 2026-01-01`

    // Act
    const result = parseBoldMetadata(content)

    // Assert
    expect(result.metadata.status).toBe('Draft')
    expect(result.metadata.last_updated).toBe('2026-01-01')
  })

  it('should handle unknown keys by converting to snake_case', () => {
    // Arrange
    const content = `# Title

**Custom Key**: value
**Another Key**: value2`

    // Act
    const result = parseBoldMetadata(content)

    // Assert
    expect(result.metadata.custom_key).toBe('value')
    expect(result.metadata.another_key).toBe('value2')
  })

  it('should stop parsing at first non-metadata line', () => {
    // Arrange
    const content = `# Title

**Status**: Draft
**Complexity**: M

Regular text starts here.

**Should Not Parse**: This`

    // Act
    const result = parseBoldMetadata(content)

    // Assert
    expect(result.metadata.status).toBe('Draft')
    expect(result.metadata.complexity).toBe('M')
    expect(result.metadata.should_not_parse).toBe(undefined)
  })

  it('should handle content without H1 title', () => {
    // Arrange
    const content = `**Status**: Draft
**Complexity**: M

Content without title.`

    // Act
    const result = parseBoldMetadata(content)

    // Assert
    expect(result.metadata.status).toBe('Draft')
    expect(result.metadata.complexity).toBe('M')
  })

  it('should preserve title in cleaned content', () => {
    // Arrange
    const content = `# My Plan

**Status**: Draft

Content.`

    // Act
    const result = parseBoldMetadata(content)

    // Assert
    expect(result.contentWithoutMetadata).toContain('# My Plan')
  })

  it('should clean up excessive blank lines after title', () => {
    // Arrange
    const content = `# Title



**Status**: Draft

Content.`

    // Act
    const result = parseBoldMetadata(content)

    // Assert
    // Should reduce multiple blank lines to 2 max
    expect(result.contentWithoutMetadata).not.toMatch(/\n{4,}/)
  })

  it('should handle blockquote lines (skip them)', () => {
    // Arrange
    const content = `# Title

**Status**: Draft
> Some blockquote
**Complexity**: M

Content.`

    // Act
    const result = parseBoldMetadata(content)

    // Assert
    expect(result.metadata.status).toBe('Draft')
    expect(result.metadata.complexity).toBe('M')
  })

  it('should trim whitespace from values', () => {
    // Arrange
    const content = `# Title

**Status**:   Draft
**Complexity**:  M  `

    // Act
    const result = parseBoldMetadata(content)

    // Assert
    expect(result.metadata.status).toBe('Draft')
    expect(result.metadata.complexity).toBe('M')
  })

  it('should handle all known keys', () => {
    // Arrange
    const content = `# Title

**Status**: Draft
**Complexity**: M
**Last Updated**: 2026-01-01
**Epic**: Phase 1
**Priority**: P0
**Owner**: Alice`

    // Act
    const result = parseBoldMetadata(content)

    // Assert
    expect(result.metadata.status).toBe('Draft')
    expect(result.metadata.complexity).toBe('M')
    expect(result.metadata.last_updated).toBe('2026-01-01')
    expect(result.metadata.epic).toBe('Phase 1')
    expect(result.metadata.priority).toBe('P0')
    expect(result.metadata.owner).toBe('Alice')
  })
})

describe('normalizeBoldMetadata', () => {
  it('should normalize status to lowercase with hyphens', () => {
    // Arrange
    const metadata = { status: 'In Progress' }

    // Act
    const result = normalizeBoldMetadata(metadata)

    // Assert
    expect(result.status).toBe('in-progress')
  })

  it('should normalize complexity to uppercase', () => {
    // Arrange
    const metadata = { complexity: 'm' }

    // Act
    const result = normalizeBoldMetadata(metadata)

    // Assert
    expect(result.complexity).toBe('M')
  })

  it('should parse date in YYYY-MM-DD format (keep as-is)', () => {
    // Arrange
    const metadata = { last_updated: '2026-01-01' }

    // Act
    const result = normalizeBoldMetadata(metadata)

    // Assert
    expect(result.last_updated).toBe('2026-01-01')
  })

  it('should parse various date formats', () => {
    // Arrange
    const metadata = { last_updated: 'January 1, 2026' }

    // Act
    const result = normalizeBoldMetadata(metadata)

    // Assert
    expect(result.last_updated).toMatch(/^\d{4}-\d{2}-\d{2}$/)
  })

  it('should keep unknown fields as-is', () => {
    // Arrange
    const metadata = { custom_field: 'value' }

    // Act
    const result = normalizeBoldMetadata(metadata)

    // Assert
    expect(result.custom_field).toBe('value')
  })

  it('should skip undefined values', () => {
    // Arrange
    const metadata = { status: 'Draft', undefined_field: undefined }

    // Act
    const result = normalizeBoldMetadata(metadata)

    // Assert
    expect(result.status).toBe('draft')
    expect(result.undefined_field).toBe(undefined)
  })

  it('should handle multiple status word variations', () => {
    // Arrange
    const testCases = [
      { input: 'In Progress', expected: 'in-progress' },
      { input: 'Draft', expected: 'draft' },
      { input: 'ACTIVE', expected: 'active' },
      { input: 'Not Started', expected: 'not-started' },
    ]

    // Act & Assert
    for (const { input, expected } of testCases) {
      const result = normalizeBoldMetadata({ status: input })
      expect(result.status).toBe(expected)
    }
  })

  it('should handle all complexity values', () => {
    // Arrange
    const testCases = ['xs', 's', 'm', 'l', 'xl']

    // Act & Assert
    for (const complexity of testCases) {
      const result = normalizeBoldMetadata({ complexity })
      expect(result.complexity).toBe(complexity.toUpperCase())
    }
  })

  it('should preserve empty object', () => {
    // Arrange
    const metadata = {}

    // Act
    const result = normalizeBoldMetadata(metadata)

    // Assert
    expect(result).toEqual({})
  })

  it('should handle mixed metadata types', () => {
    // Arrange
    const metadata = {
      status: 'In Progress',
      complexity: 'm',
      last_updated: '2026-01-01',
      epic: 'Phase 1',
      custom: 'value',
    }

    // Act
    const result = normalizeBoldMetadata(metadata)

    // Assert
    expect(result.status).toBe('in-progress')
    expect(result.complexity).toBe('M')
    expect(result.last_updated).toBe('2026-01-01')
    expect(result.epic).toBe('Phase 1')
    expect(result.custom).toBe('value')
  })
})
