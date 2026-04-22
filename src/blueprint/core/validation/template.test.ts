import { describe, expect, it } from 'vitest'

import { validatePlanTemplate } from './template.js'

describe('validatePlanTemplate', () => {
  describe('valid complete plans', () => {
    it('should validate plan with all required sections (Overview variant)', () => {
      const markdown = `
# My Plan

## Overview
This is the overview

## Acceptance Criteria
- [ ] Task 1
- [ ] Task 2

## Phases
Phase details here
      `
      const result = validatePlanTemplate(markdown)
      expect(result.valid).toBe(true)
      expect(result.error).toBe(undefined)
    })

    it('should validate plan with Problem Statement instead of Overview', () => {
      const markdown = `
# My Plan

## Problem Statement
The problem we're solving

## Acceptance Criteria
- [ ] Task 1

## Tasks
Task details
      `
      const result = validatePlanTemplate(markdown)
      expect(result.valid).toBe(true)
    })

    it('should validate plan with Problem & Goal instead of Overview', () => {
      const markdown = `
# My Plan

## Problem & Goal
Problem and goal description

## Acceptance Criteria
- [ ] Task 1

## Implementation
Implementation details
      `
      const result = validatePlanTemplate(markdown)
      expect(result.valid).toBe(true)
    })

    it('should validate plan with embedded phases', () => {
      const markdown = `
# My Plan

## Overview
Overview content

## Acceptance Criteria
- [ ] Task 1

### Phase 1
Phase 1 details

### Phase 2
Phase 2 details
      `
      const result = validatePlanTemplate(markdown)
      expect(result.valid).toBe(true)
    })

    it('should validate plan with Tasks section', () => {
      const markdown = `
# Plan

## Overview
Content

## Acceptance Criteria
- [ ] Task

## Tasks
- Task 1
- Task 2
      `
      const result = validatePlanTemplate(markdown)
      expect(result.valid).toBe(true)
    })

    it('should validate plan with Implementation section', () => {
      const markdown = `
# Plan

## Overview
Content

## Acceptance Criteria
- [ ] Task

## Implementation
Implementation steps
      `
      const result = validatePlanTemplate(markdown)
      expect(result.valid).toBe(true)
    })
  })

  describe('missing Overview section', () => {
    it('should fail when Overview missing', () => {
      const markdown = `
# Plan

## Acceptance Criteria
- [ ] Task

## Phases
Details
      `
      const result = validatePlanTemplate(markdown)
      expect(result.valid).toBe(false)
      expect(result.error).toContain('missing required section: ## Overview')
    })

    it('should fail with no overview variant', () => {
      const markdown = `
# Plan

## Some Other Section
Content

## Acceptance Criteria
- [ ] Task

## Phases
Details
      `
      const result = validatePlanTemplate(markdown)
      expect(result.valid).toBe(false)
      expect(result.error).toContain('## Overview')
    })

    it('should suggest Problem Statement in error', () => {
      const markdown = `
## Acceptance Criteria
- [ ] Task
## Phases
Details
      `
      const result = validatePlanTemplate(markdown)
      expect(result.valid).toBe(false)
      expect(result.error).toContain('## Problem Statement')
    })
  })

  describe('missing Acceptance Criteria section', () => {
    it('should fail when Acceptance Criteria header missing and no checkboxes', () => {
      const markdown = `
# Plan

## Overview
Content

## Phases
Details
      `
      const result = validatePlanTemplate(markdown)
      expect(result.valid).toBe(false)
      expect(result.error).toContain('missing required section: ## Acceptance Criteria')
    })

    it('should pass when no header but checkboxes exist', () => {
      const markdown = `
# Plan

## Overview
Content

- [ ] Task 1
- [ ] Task 2

## Phases
Details
      `
      const result = validatePlanTemplate(markdown)
      expect(result.valid).toBe(true)
    })

    it('should pass when header exists even without checkboxes', () => {
      const markdown = `
## Overview
Content

## Acceptance Criteria
No checkboxes here

## Phases
Details
      `
      const result = validatePlanTemplate(markdown)
      // Header presence is sufficient - checkboxes not strictly required
      expect(result.valid).toBe(true)
    })

    it('should pass with header and checkboxes', () => {
      const markdown = `
## Overview
Content

## Acceptance Criteria
- [ ] Task

## Phases
Details
      `
      const result = validatePlanTemplate(markdown)
      expect(result.valid).toBe(true)
    })
  })

  describe('missing Implementation section', () => {
    it('should fail when no Phases, Tasks, or Implementation section', () => {
      const markdown = `
## Overview
Content

## Acceptance Criteria
- [ ] Task

## Other Section
Details
      `
      const result = validatePlanTemplate(markdown)
      expect(result.valid).toBe(false)
      expect(result.error).toContain('missing required section: ## Phases')
      expect(result.error).toContain('or ## Tasks or ## Implementation')
    })

    it('should pass with Phases section', () => {
      const markdown = `
## Overview
Content
## Acceptance Criteria
- [ ] Task
## Phases
Details
      `
      const result = validatePlanTemplate(markdown)
      expect(result.valid).toBe(true)
    })

    it('should pass with Tasks section', () => {
      const markdown = `
## Overview
Content
## Acceptance Criteria
- [ ] Task
## Tasks
Details
      `
      const result = validatePlanTemplate(markdown)
      expect(result.valid).toBe(true)
    })

    it('should pass with Implementation section', () => {
      const markdown = `
## Overview
Content
## Acceptance Criteria
- [ ] Task
## Implementation
Details
      `
      const result = validatePlanTemplate(markdown)
      expect(result.valid).toBe(true)
    })

    it('should pass with embedded phase headers', () => {
      const markdown = `
## Overview
Content
## Acceptance Criteria
- [ ] Task
### Phase 1
Details
      `
      const result = validatePlanTemplate(markdown)
      expect(result.valid).toBe(true)
    })
  })

  describe('section header variations', () => {
    it('should match case-sensitive headers', () => {
      const markdown = `
## overview
## acceptance criteria
- [ ] Task
## phases
      `
      const result = validatePlanTemplate(markdown)
      // Should fail because lowercase headers don't match
      expect(result.valid).toBe(false)
    })

    it('should match headers at start of line only', () => {
      const markdown = `
Some text ## Overview

## Acceptance Criteria
- [ ] Task

## Phases
Details
      `
      const result = validatePlanTemplate(markdown)
      // First line doesn't match because ## not at start
      expect(result.valid).toBe(false)
    })

    it('should handle headers with extra content', () => {
      const markdown = `
## Overview: The Big Picture

## Acceptance Criteria (Must Have)
- [ ] Task

## Phases and Milestones
Details
      `
      const result = validatePlanTemplate(markdown)
      expect(result.valid).toBe(true)
    })

    it('should handle ### for Phase headers', () => {
      const markdown = `
## Overview
Content

## Acceptance Criteria
- [ ] Task

### Phase 1
Details
      `
      const result = validatePlanTemplate(markdown)
      expect(result.valid).toBe(true)
    })

    it('should require ## Phases not ## Phase N', () => {
      const markdown = `
## Overview
Content

## Acceptance Criteria
- [ ] Task

## Phase 2
Details
      `
      const result = validatePlanTemplate(markdown)
      // Only matches "## Phases" not "## Phase 2"
      expect(result.valid).toBe(false)
    })

    it('should require Problem Statement at start of line', () => {
      // Tests regex anchor for Problem Statement
      const markdown = `
text ## Problem Statement

## Acceptance Criteria
- [ ] Task

## Phases
Details
      `
      const result = validatePlanTemplate(markdown)
      expect(result.valid).toBe(false)
      expect(result.error).toContain('## Overview')
    })

    it('should require Problem & Goal at start of line', () => {
      // Tests regex anchor for Problem & Goal
      const markdown = `
text ## Problem & Goal

## Acceptance Criteria
- [ ] Task

## Phases
Details
      `
      const result = validatePlanTemplate(markdown)
      expect(result.valid).toBe(false)
      expect(result.error).toContain('## Overview')
    })

    it('should require Acceptance Criteria at start of line', () => {
      // Tests regex anchor for Acceptance Criteria
      // The markdown has "text ## Acceptance Criteria" mid-line with no checkboxes
      const markdown = `
## Overview
Content

text ## Acceptance Criteria
No checkboxes here

## Phases
Details
      `
      const result = validatePlanTemplate(markdown)
      // Should fail because header not at start of line and no checkboxes
      expect(result.valid).toBe(false)
      expect(result.error).toContain('Acceptance Criteria')
    })

    it('should require Phases at start of line', () => {
      // Tests regex anchor for Phases
      const markdown = `
## Overview
Content

## Acceptance Criteria
- [ ] Task

text ## Phases
Details
      `
      const result = validatePlanTemplate(markdown)
      expect(result.valid).toBe(false)
      expect(result.error).toContain('## Phases')
    })

    it('should require Tasks at start of line', () => {
      // Tests regex anchor for Tasks
      const markdown = `
## Overview
Content

## Acceptance Criteria
- [ ] Task

text ## Tasks
Details
      `
      const result = validatePlanTemplate(markdown)
      expect(result.valid).toBe(false)
      expect(result.error).toContain('## Phases')
    })

    it('should require Implementation at start of line', () => {
      // Tests regex anchor for Implementation
      const markdown = `
## Overview
Content

## Acceptance Criteria
- [ ] Task

text ## Implementation
Details
      `
      const result = validatePlanTemplate(markdown)
      expect(result.valid).toBe(false)
      expect(result.error).toContain('## Phases')
    })

    it('should require ### Phase N at start of line', () => {
      // Tests regex anchor for ### Phase N
      const markdown = `
## Overview
Content

## Acceptance Criteria
- [ ] Task

text ### Phase 1
Details
      `
      const result = validatePlanTemplate(markdown)
      expect(result.valid).toBe(false)
      expect(result.error).toContain('## Phases')
    })
  })

  describe('edge cases', () => {
    it('should handle empty markdown', () => {
      const result = validatePlanTemplate('')
      expect(result.valid).toBe(false)
    })

    it('should handle markdown with only whitespace', () => {
      const result = validatePlanTemplate('   \n\n  \n')
      expect(result.valid).toBe(false)
    })

    it('should validate minimal valid plan', () => {
      const markdown = `
## Overview
x
## Acceptance Criteria
- [ ] x
## Phases
x
      `
      const result = validatePlanTemplate(markdown)
      expect(result.valid).toBe(true)
    })

    it('should handle plans with frontmatter', () => {
      const markdown = `
---
status: draft
---

## Overview
Content

## Acceptance Criteria
- [ ] Task

## Phases
Details
      `
      const result = validatePlanTemplate(markdown)
      expect(result.valid).toBe(true)
    })

    it('should handle plans with code blocks', () => {
      const markdown = `
## Overview
Content

\`\`\`markdown
## This is in a code block
\`\`\`

## Acceptance Criteria
- [ ] Task

## Phases
Details
      `
      const result = validatePlanTemplate(markdown)
      expect(result.valid).toBe(true)
    })

    it('should handle Windows line endings', () => {
      const markdown =
        '## Overview\r\nContent\r\n## Acceptance Criteria\r\n- [ ] Task\r\n## Phases\r\nDetails\r\n'
      const result = validatePlanTemplate(markdown)
      expect(result.valid).toBe(true)
    })
  })

  describe('multiple sections', () => {
    it('should allow multiple Overview variants in same document', () => {
      const markdown = `
## Overview
First overview

## Problem Statement
Also has problem statement

## Acceptance Criteria
- [ ] Task

## Phases
Details
      `
      const result = validatePlanTemplate(markdown)
      expect(result.valid).toBe(true)
    })

    it('should allow multiple implementation variants', () => {
      const markdown = `
## Overview
Content

## Acceptance Criteria
- [ ] Task

## Phases
Phase content

## Tasks
Task content

## Implementation
Implementation content
      `
      const result = validatePlanTemplate(markdown)
      expect(result.valid).toBe(true)
    })
  })

  describe('validation order', () => {
    it('should fail on first missing section (Overview)', () => {
      const markdown = `
## Something Else
Content
      `
      const result = validatePlanTemplate(markdown)
      expect(result.valid).toBe(false)
      expect(result.error).toContain('Overview')
    })

    it('should fail on Acceptance Criteria if Overview exists', () => {
      const markdown = `
## Overview
Content

## Something Else
Content
      `
      const result = validatePlanTemplate(markdown)
      expect(result.valid).toBe(false)
      expect(result.error).toContain('Acceptance Criteria')
    })

    it('should fail on Implementation if others exist', () => {
      const markdown = `
## Overview
Content

## Acceptance Criteria
- [ ] Task

## Something Else
Content
      `
      const result = validatePlanTemplate(markdown)
      expect(result.valid).toBe(false)
      expect(result.error).toContain('Phases')
    })

    it('should return simple valid object when all sections pass', () => {
      // This kills the mutation that always returns hasImplementation
      // When implementation is valid, we should get { valid: true } without error property
      const markdown = `
## Overview
Content

## Acceptance Criteria
- [ ] Task

## Phases
Details
      `
      const result = validatePlanTemplate(markdown)
      expect(result.valid).toBe(true)
      expect(result.error).toBe(undefined)
      // hasImplementation would have valid: true but could have other properties
      // the final return is just { valid: true }
      expect(Object.keys(result)).toEqual(['valid'])
    })
  })
})
