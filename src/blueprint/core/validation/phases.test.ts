import { describe, expect, it } from 'vitest'

import { validateEmbeddedPhases } from './phases'

describe('validateEmbeddedPhases', () => {
  describe('no embedded phases', () => {
    it('should pass when no phase headers exist', () => {
      const markdown = `
# Plan Overview

## Implementation
Some content here
      `
      const result = validateEmbeddedPhases(markdown)
      expect(result.hasEmbedded).toBe(false)
      expect(result.phases).toHaveLength(0)
      expect(result.warning).toBe(undefined)
    })

    it('should pass with empty markdown', () => {
      const result = validateEmbeddedPhases('')
      expect(result.hasEmbedded).toBe(false)
      expect(result.phases).toHaveLength(0)
    })

    it('should pass when phases are referenced but not embedded', () => {
      const markdown = `
# Plan Overview

See phase-1-setup.md for Phase 1 details.
      `
      const result = validateEmbeddedPhases(markdown)
      expect(result.hasEmbedded).toBe(false)
      expect(result.phases).toHaveLength(0)
    })
  })

  describe('embedded phases detection', () => {
    it('should detect single embedded phase with ###', () => {
      const markdown = `
# Plan

### Phase 1
Details here
      `
      const result = validateEmbeddedPhases(markdown)
      expect(result.hasEmbedded).toBe(true)
      expect(result.phases).toHaveLength(1)
      expect(result.phases[0]).toBe('### Phase 1')
      expect(result.warning).toBe(
        'Plan has 1 embedded phase(s). Consider using separate phase-N-*.md files',
      )
    })

    it('should detect single embedded phase with ##', () => {
      const markdown = `
# Plan

## Phase 1
Details here
      `
      const result = validateEmbeddedPhases(markdown)
      expect(result.hasEmbedded).toBe(true)
      expect(result.phases).toHaveLength(1)
      expect(result.phases[0]).toBe('## Phase 1')
    })

    it('should detect multiple embedded phases', () => {
      const markdown = `
# Plan

## Phase 1
First phase details

## Phase 2
Second phase details

### Phase 3
Third phase details
      `
      const result = validateEmbeddedPhases(markdown)
      expect(result.hasEmbedded).toBe(true)
      expect(result.phases).toHaveLength(3)
      expect(result.phases).toContain('## Phase 1')
      expect(result.phases).toContain('## Phase 2')
      expect(result.phases).toContain('### Phase 3')
      expect(result.warning).toBe(
        'Plan has 3 embedded phase(s). Consider using separate phase-N-*.md files',
      )
    })

    it('should detect phases with different numbers', () => {
      const markdown = `
## Phase 1
## Phase 2
## Phase 10
### Phase 99
      `
      const result = validateEmbeddedPhases(markdown)
      expect(result.hasEmbedded).toBe(true)
      expect(result.phases).toHaveLength(4)
    })

    it('should capture multi-digit phase numbers completely', () => {
      // This tests that \d+ captures all digits, not just \d (one digit)
      const markdown = '## Phase 123'
      const result = validateEmbeddedPhases(markdown)
      expect(result.hasEmbedded).toBe(true)
      expect(result.phases).toHaveLength(1)
      // The full "## Phase 123" should be captured, not "## Phase 1"
      expect(result.phases[0]).toBe('## Phase 123')
    })
  })

  describe('phase header variations', () => {
    it('should detect phase with extra spaces', () => {
      const markdown = '##  Phase 1'
      const result = validateEmbeddedPhases(markdown)
      expect(result.hasEmbedded).toBe(false)
      // Extra space after ## means it won't match the pattern
    })

    it('should detect phase at start of line only', () => {
      const markdown = `
Some text ## Phase 1
Not at start

## Phase 2
This one counts
      `
      const result = validateEmbeddedPhases(markdown)
      expect(result.hasEmbedded).toBe(true)
      expect(result.phases).toHaveLength(1)
      expect(result.phases[0]).toBe('## Phase 2')
    })

    it('should handle phase with additional text after number', () => {
      const markdown = `
## Phase 1: Setup
## Phase 2 - Configuration
### Phase 3 (optional)
      `
      const result = validateEmbeddedPhases(markdown)
      expect(result.hasEmbedded).toBe(true)
      expect(result.phases).toHaveLength(3)
    })

    it('should not match phase without number', () => {
      const markdown = `
## Phase
## Phase Overview
### Phase Notes
      `
      const result = validateEmbeddedPhases(markdown)
      expect(result.hasEmbedded).toBe(false)
    })

    it('should not match phase with non-digit after space', () => {
      const markdown = '## Phase One'
      const result = validateEmbeddedPhases(markdown)
      expect(result.hasEmbedded).toBe(false)
    })
  })

  describe('warning messages', () => {
    it('should have correct warning for single phase', () => {
      const markdown = '## Phase 1'
      const result = validateEmbeddedPhases(markdown)
      expect(result.warning).toBe(
        'Plan has 1 embedded phase(s). Consider using separate phase-N-*.md files',
      )
    })

    it('should have correct warning for multiple phases', () => {
      const markdown = `
## Phase 1
## Phase 2
### Phase 3
      `
      const result = validateEmbeddedPhases(markdown)
      expect(result.warning).toBe(
        'Plan has 3 embedded phase(s). Consider using separate phase-N-*.md files',
      )
    })

    it('should have no warning when no phases', () => {
      const markdown = '# Just a plan'
      const result = validateEmbeddedPhases(markdown)
      expect(result.warning).toBe(undefined)
    })
  })

  describe('edge cases', () => {
    it('should handle markdown with code blocks containing phase headers', () => {
      const markdown = `
# Plan

\`\`\`markdown
## Phase 1
This is in a code block
\`\`\`

## Phase 1
This is real
      `
      const result = validateEmbeddedPhases(markdown)
      // Regex will match both (doesn't parse code blocks)
      expect(result.hasEmbedded).toBe(true)
      expect(result.phases.length).toBeGreaterThanOrEqual(1)
    })

    it('should handle phase headers with Windows line endings', () => {
      const markdown = '## Phase 1\r\n## Phase 2\r\n'
      const result = validateEmbeddedPhases(markdown)
      expect(result.hasEmbedded).toBe(true)
      expect(result.phases).toHaveLength(2)
    })

    it('should handle phase with zero', () => {
      const markdown = '## Phase 0'
      const result = validateEmbeddedPhases(markdown)
      expect(result.hasEmbedded).toBe(true)
      expect(result.phases).toHaveLength(1)
    })

    it('should not match #### (h4) headers', () => {
      const markdown = '#### Phase 1'
      const result = validateEmbeddedPhases(markdown)
      expect(result.hasEmbedded).toBe(false)
    })

    it('should not match # (h1) headers', () => {
      const markdown = '# Phase 1'
      const result = validateEmbeddedPhases(markdown)
      expect(result.hasEmbedded).toBe(false)
    })

    it('should handle mixed header levels', () => {
      const markdown = `
# Phase 1 (should not match)
## Phase 2 (should match)
### Phase 3 (should match)
#### Phase 4 (should not match)
      `
      const result = validateEmbeddedPhases(markdown)
      expect(result.hasEmbedded).toBe(true)
      expect(result.phases).toHaveLength(2)
    })
  })

  describe('return structure', () => {
    it('should return correct structure for embedded phases', () => {
      const markdown = '## Phase 1'
      const result = validateEmbeddedPhases(markdown)
      expect(result).toHaveProperty('hasEmbedded')
      expect(result).toHaveProperty('phases')
      expect(result).toHaveProperty('warning')
      expect(typeof result.hasEmbedded).toBe('boolean')
      expect(Array.isArray(result.phases)).toBe(true)
      expect(typeof result.warning).toBe('string')
    })

    it('should return correct structure for no embedded phases', () => {
      const markdown = '# Plan'
      const result = validateEmbeddedPhases(markdown)
      expect(result).toHaveProperty('hasEmbedded')
      expect(result).toHaveProperty('phases')
      expect(result.hasEmbedded).toBe(false)
      expect(result.phases).toEqual([])
      expect(result.warning).toBe(undefined)
    })
  })
})
