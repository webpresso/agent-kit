import { describe, expect, it } from 'vitest'

import { generateFrontmatter, parseFrontmatter, updateFrontmatter } from './parsers/frontmatter'

describe('parseFrontmatter', () => {
  it('should parse valid frontmatter', () => {
    // Arrange
    const content = `---
type: blueprint
status: draft
complexity: M
---
# Content here`

    // Act
    const result = parseFrontmatter(content)

    // Assert
    expect(result.hasFrontmatter).toBe(true)
    expect(result.frontmatter).toEqual({
      type: 'blueprint',
      status: 'draft',
      complexity: 'M',
    })
    expect(result.content).toBe('# Content here')
  })

  it('should handle document without frontmatter', () => {
    // Arrange
    const content = '# Just a heading\n\nSome content'

    // Act
    const result = parseFrontmatter(content)

    // Assert
    expect(result.hasFrontmatter).toBe(false)
    expect(result.frontmatter).toEqual({})
    expect(result.content).toBe(content)
  })

  it('should handle empty frontmatter', () => {
    // Arrange
    const content = `---
---
# Content`

    // Act
    const result = parseFrontmatter(content)

    // Assert
    expect(result.hasFrontmatter).toBe(true)
    expect(result.frontmatter).toEqual({})
    expect(result.content).toBe('# Content')
  })

  it('should parse frontmatter with arrays', () => {
    // Arrange
    const content = `---
tags:
  - tag1
  - tag2
dependencies:
  - dep1
---
Content`

    // Act
    const result = parseFrontmatter(content)

    // Assert
    expect(result.hasFrontmatter).toBe(true)
    expect(result.frontmatter.tags).toEqual(['tag1', 'tag2'])
    expect(result.frontmatter.dependencies).toEqual(['dep1'])
  })

  it('should handle frontmatter with various data types', () => {
    // Arrange
    const content = `---
string: "value"
number: 42
boolean: true
date: 2026-01-01
---
Content`

    // Act
    const result = parseFrontmatter(content)

    // Assert
    expect(result.frontmatter.string).toBe('value')
    expect(result.frontmatter.number).toBe(42)
    expect(result.frontmatter.boolean).toBe(true)
  })

  it('should preserve content exactly as is', () => {
    // Arrange
    const content = `---
type: test
---
# Heading

Paragraph with **bold** and *italic*.

\`\`\`bash
code block
\`\`\``

    // Act
    const result = parseFrontmatter(content)

    // Assert
    expect(result.content).toContain('# Heading')
    expect(result.content).toContain('**bold**')
    expect(result.content).toContain('code block')
  })
})

describe('generateFrontmatter', () => {
  it('should generate simple frontmatter', () => {
    // Arrange
    const data = {
      type: 'blueprint',
      status: 'draft',
    }

    // Act
    const result = generateFrontmatter(data)

    // Assert
    expect(result).toBe(`---
type: blueprint
status: draft
---`)
  })

  it('should generate frontmatter with arrays', () => {
    // Arrange
    const data = {
      tags: ['tag1', 'tag2'],
    }

    // Act
    const result = generateFrontmatter(data)

    // Assert
    expect(result).toBe(`---
tags:
  - tag1
  - tag2
---`)
  })

  it('should filter out undefined values', () => {
    // Arrange
    const data = {
      type: 'test',
      optional: undefined,
    }

    // Act
    const result = generateFrontmatter(data)

    // Assert
    expect(result).toBe(`---
type: test
---`)
  })

  it('should return empty string for empty object', () => {
    // Arrange
    const data = {}

    // Act
    const result = generateFrontmatter(data)

    // Assert
    expect(result).toBe('')
  })

  it('should return empty string when all values are undefined', () => {
    // Arrange
    const data = {
      field1: undefined,
      field2: undefined,
    }

    // Act
    const result = generateFrontmatter(data)

    // Assert
    expect(result).toBe('')
  })

  it('should skip empty arrays', () => {
    // Arrange
    const data = {
      type: 'test',
      emptyArray: [],
    }

    // Act
    const result = generateFrontmatter(data)

    // Assert
    expect(result).toBe(`---
type: test
---`)
  })

  it('should handle mixed data types', () => {
    // Arrange
    const data = {
      string: 'value',
      number: 42,
      boolean: true,
    }

    // Act
    const result = generateFrontmatter(data)

    // Assert
    expect(result).toContain('string: value')
    expect(result).toContain('number: 42')
    expect(result).toContain('boolean: true')
  })

  it('should handle multiple arrays', () => {
    // Arrange
    const data = {
      tags: ['a', 'b'],
      deps: ['x', 'y', 'z'],
    }

    // Act
    const result = generateFrontmatter(data)

    // Assert
    expect(result).toContain('tags:')
    expect(result).toContain('  - a')
    expect(result).toContain('  - b')
    expect(result).toContain('deps:')
    expect(result).toContain('  - x')
    expect(result).toContain('  - y')
    expect(result).toContain('  - z')
  })
})

describe('updateFrontmatter', () => {
  it('should add frontmatter to document without it', () => {
    // Arrange
    const content = '# Heading\n\nContent'
    const newData = {
      type: 'test',
      status: 'draft',
    }

    // Act
    const result = updateFrontmatter(content, newData)

    // Assert
    expect(result).toContain('---')
    expect(result).toContain('type: test')
    expect(result).toContain('status: draft')
    expect(result).toContain('# Heading')
  })

  it('should update existing frontmatter', () => {
    // Arrange
    const content = `---
type: old-type
status: draft
---
# Content`
    const newData = {
      type: 'new-type',
    }

    // Act
    const result = updateFrontmatter(content, newData)

    // Assert
    expect(result).toContain('type: new-type')
    expect(result).toContain('status: draft')
    expect(result).toContain('# Content')
  })

  it('should merge new data with existing frontmatter', () => {
    // Arrange
    const content = `---
type: test
---
Content`
    const newData = {
      status: 'draft',
      complexity: 'M',
    }

    // Act
    const result = updateFrontmatter(content, newData)

    // Assert
    expect(result).toContain('type: test')
    expect(result).toContain('status: draft')
    expect(result).toContain('complexity: M')
  })

  it('should preserve content when updating frontmatter', () => {
    // Arrange
    const content = `---
type: test
---
# Heading

Paragraph 1

Paragraph 2`
    const newData = {
      status: 'updated',
    }

    // Act
    const result = updateFrontmatter(content, newData)

    // Assert
    expect(result).toContain('# Heading')
    expect(result).toContain('Paragraph 1')
    expect(result).toContain('Paragraph 2')
  })

  it('should handle empty new data', () => {
    // Arrange
    const content = `---
type: test
---
Content`
    const newData = {}

    // Act
    const result = updateFrontmatter(content, newData)

    // Assert
    expect(result).toContain('type: test')
  })

  it('should trim leading whitespace from content', () => {
    // Arrange
    const content = `


# Content with leading whitespace`
    const newData = {
      type: 'test',
    }

    // Act
    const result = updateFrontmatter(content, newData)

    // Assert
    expect(result).toContain('---')
    expect(result).toContain('type: test')
    expect(result).toContain('# Content with leading whitespace')
    expect(result).not.toMatch(/---\n\n\n/)
  })

  it('should filter out undefined values when updating', () => {
    // Arrange
    const content = `---
type: test
status: draft
---
Content`
    const newData = {
      status: undefined,
      complexity: 'M',
    }

    // Act
    const result = updateFrontmatter(content, newData)

    // Assert
    expect(result).toContain('complexity: M')
    expect(result).toContain('type: test')
    // Undefined values are filtered by generateFrontmatter after merge
    // So "status: undefined" gets merged, then filtered out
    expect(result).not.toContain('status:')
  })
})
