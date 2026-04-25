import { describe, expect, it } from 'vitest'

import { validateHeadingHierarchy, validateStructure } from './validators/structure'

describe('validateStructure', () => {
  it('should pass when all required sections are present', () => {
    // Arrange
    const content = `# Test Document

## Problem

Some problem

## Goal

Some goal

## Solution

Some solution`
    const requiredSections = ['Problem', 'Goal', 'Solution']

    // Act
    const errors = validateStructure(content, requiredSections, 'test.md')

    // Assert
    expect(errors).toHaveLength(0)
  })

  it('should warn when a required section is missing', () => {
    // Arrange
    const content = `# Test Document

## Problem

Some problem

## Solution

Some solution`
    const requiredSections = ['Problem', 'Goal', 'Solution']

    // Act
    const errors = validateStructure(content, requiredSections, 'test.md')

    // Assert
    expect(errors).toHaveLength(1)
    expect(errors[0].message).toContain('Goal')
    expect(errors[0].severity).toBe('warning')
    expect(errors[0].source).toBe('structure')
    expect(errors[0].ruleId).toBe('required-section')
  })

  it('should warn for multiple missing sections', () => {
    // Arrange
    const content = `# Test Document

## Problem

Some problem`
    const requiredSections = ['Problem', 'Goal', 'Solution']

    // Act
    const errors = validateStructure(content, requiredSections, 'test.md')

    // Assert
    expect(errors).toHaveLength(2)
    expect(errors[0].message).toContain('Goal')
    expect(errors[1].message).toContain('Solution')
  })

  it('should match sections case-insensitively', () => {
    // Arrange
    const content = `# Test Document

## problem

Some problem

## GOAL

Some goal

## SoLuTiOn

Some solution`
    const requiredSections = ['Problem', 'Goal', 'Solution']

    // Act
    const errors = validateStructure(content, requiredSections, 'test.md')

    // Assert
    expect(errors).toHaveLength(0)
  })

  it('should handle partial matches (heading contains required section)', () => {
    // Arrange
    const content = `# Test Document

## Problem Statement

Some problem

## Goal Description

Some goal

## Solution Approach

Some solution`
    const requiredSections = ['Problem', 'Goal', 'Solution']

    // Act
    const errors = validateStructure(content, requiredSections, 'test.md')

    // Assert
    expect(errors).toHaveLength(0)
  })

  it('should handle partial matches (required section contains heading)', () => {
    // Arrange
    const content = `# Test Document

## Prob

Some problem

## Go

Some goal

## Sol

Some solution`
    const requiredSections = ['Problem', 'Goal', 'Solution']

    // Act
    const errors = validateStructure(content, requiredSections, 'test.md')

    // Assert
    expect(errors).toHaveLength(0)
  })

  it('should handle empty content', () => {
    // Arrange
    const content = ''
    const requiredSections = ['Problem', 'Goal']

    // Act
    const errors = validateStructure(content, requiredSections, 'test.md')

    // Assert
    expect(errors).toHaveLength(2)
  })

  it('should handle content with no headings', () => {
    // Arrange
    const content = 'Just some text without any headings.'
    const requiredSections = ['Problem']

    // Act
    const errors = validateStructure(content, requiredSections, 'test.md')

    // Assert
    expect(errors).toHaveLength(1)
  })

  it('should work with different heading levels', () => {
    // Arrange
    const content = `# Problem

## Goal

### Solution`
    const requiredSections = ['Problem', 'Goal', 'Solution']

    // Act
    const errors = validateStructure(content, requiredSections, 'test.md')

    // Assert
    expect(errors).toHaveLength(0)
  })
})

describe('validateHeadingHierarchy', () => {
  it('should pass for valid heading hierarchy', () => {
    // Arrange
    const content = `# Title

## Section 1

### Subsection 1.1

### Subsection 1.2

## Section 2

### Subsection 2.1`

    // Act
    const errors = validateHeadingHierarchy(content, 'test.md')

    // Assert
    expect(errors).toHaveLength(0)
  })

  it('should warn when skipping heading levels', () => {
    // Arrange
    const content = `# Title

### Subsection`

    // Act
    const errors = validateHeadingHierarchy(content, 'test.md')

    // Assert
    expect(errors).toHaveLength(1)
    expect(errors[0].message).toContain('Skipped heading level: H1 to H3')
    expect(errors[0].line).toBe(3)
    expect(errors[0].severity).toBe('warning')
    expect(errors[0].source).toBe('structure')
    expect(errors[0].ruleId).toBe('heading-hierarchy')
  })

  it('should allow going up levels', () => {
    // Arrange
    const content = `# Title

## Section

### Subsection

## Another Section

# Another Title`

    // Act
    const errors = validateHeadingHierarchy(content, 'test.md')

    // Assert
    expect(errors).toHaveLength(0)
  })

  it('should allow first heading to be any level', () => {
    // Arrange
    const content = `### Starting with H3

#### Then H4`

    // Act
    const errors = validateHeadingHierarchy(content, 'test.md')

    // Assert
    expect(errors).toHaveLength(0)
  })

  it('should handle multiple skipped levels', () => {
    // Arrange
    const content = `# Title

#### Skipping to H4

###### Then to H6`

    // Act
    const errors = validateHeadingHierarchy(content, 'test.md')

    // Assert
    expect(errors).toHaveLength(2)
    expect(errors[0].message).toContain('H1 to H4')
    expect(errors[1].message).toContain('H4 to H6')
  })

  it('should handle empty content', () => {
    // Arrange
    const content = ''

    // Act
    const errors = validateHeadingHierarchy(content, 'test.md')

    // Assert
    expect(errors).toHaveLength(0)
  })

  it('should handle content with no headings', () => {
    // Arrange
    const content = 'Just some text without any headings.'

    // Act
    const errors = validateHeadingHierarchy(content, 'test.md')

    // Assert
    expect(errors).toHaveLength(0)
  })

  it('should allow incrementing by one level', () => {
    // Arrange
    const content = `# H1

## H2

### H3

#### H4

##### H5

###### H6`

    // Act
    const errors = validateHeadingHierarchy(content, 'test.md')

    // Assert
    expect(errors).toHaveLength(0)
  })
})
