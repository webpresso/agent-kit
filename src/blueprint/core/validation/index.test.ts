import type { CriteriaResult, ValidationResult } from './index'

import { describe, expect, it } from 'vitest'

import {
  checkAcceptanceCriteria,
  checkChangelog,
  validateEmbeddedPhases,
  validatePlanLinks,
  validatePlanState,
  validatePlanTemplate,
} from './index'

describe('plan-validation package exports', () => {
  describe('function exports', () => {
    it('should export checkAcceptanceCriteria', () => {
      expect(typeof checkAcceptanceCriteria).toBe('function')
    })

    it('should export checkChangelog', () => {
      expect(typeof checkChangelog).toBe('function')
    })

    it('should export validatePlanLinks', () => {
      expect(typeof validatePlanLinks).toBe('function')
    })

    it('should export validateEmbeddedPhases', () => {
      expect(typeof validateEmbeddedPhases).toBe('function')
    })

    it('should export validatePlanState', () => {
      expect(typeof validatePlanState).toBe('function')
    })

    it('should export validatePlanTemplate', () => {
      expect(typeof validatePlanTemplate).toBe('function')
    })
  })

  describe('integration - full plan validation', () => {
    it('should validate a complete valid plan', () => {
      const markdown = `
---
status: draft
---

## Overview
This is a new feature plan

## Acceptance Criteria
- [ ] Implement feature
- [ ] Add tests
- [ ] Update docs

## Phases
### Phase 1: Setup
Initial setup tasks

### Phase 2: Implementation
Core implementation
      `

      const criteria = checkAcceptanceCriteria(markdown)
      expect(criteria.total).toBe(3)
      expect(criteria.checked).toBe(0)

      const template = validatePlanTemplate(markdown)
      expect(template.valid).toBe(true)

      const state = validatePlanState(markdown, 'draft/my-plan/plan.md')
      expect(state.valid).toBe(true)

      const phases = validateEmbeddedPhases(markdown)
      expect(phases.hasEmbedded).toBe(true)
      expect(phases.phases).toHaveLength(2)
    })

    it('should validate a completed plan', () => {
      const markdown = `
---
status: completed
---

## Problem Statement
We needed to improve performance

## Acceptance Criteria
- [x] Achieve 50ms response time
- [x] Add monitoring
- [x] Document changes

## Implementation
See phase files for details
      `

      const criteria = checkAcceptanceCriteria(markdown)
      expect(criteria.allChecked).toBe(true)

      const template = validatePlanTemplate(markdown)
      expect(template.valid).toBe(true)

      const state = validatePlanState(markdown, 'completed/perf-improvement/plan.md')
      expect(state.valid).toBe(true)

      const changelog = checkChangelog('/completed/perf-improvement/plan.md')
      expect(changelog.hasChangelog).toBe(false)
      expect(typeof changelog.warning).toBe('string')
    })

    it('should catch validation errors across validators', () => {
      const markdown = `
---
status: completed
---

## Overview
Invalid plan

## Acceptance Criteria
- [x] Task 1
- [ ] Task 2

## Phases
Details
      `

      const state = validatePlanState(markdown, 'in-progress/plan.md')
      expect(state.valid).toBe(false)
      expect(state.error).toContain('not in completed/ folder')

      const criteria = checkAcceptanceCriteria(markdown)
      expect(criteria.allChecked).toBe(false)
    })
  })

  describe('type exports', () => {
    it('should have CriteriaResult type', () => {
      const result: CriteriaResult = {
        total: 5,
        checked: 3,
        allChecked: false,
      }
      expect(result.total).toBe(5)
    })

    it('should have ValidationResult type', () => {
      const result: ValidationResult = {
        valid: false,
        error: 'Something went wrong',
      }
      expect(result.valid).toBe(false)
    })

    it('should allow ValidationResult without error', () => {
      const result: ValidationResult = {
        valid: true,
      }
      expect(result.error).toBe(undefined)
    })
  })

  describe('integration - realistic scenarios', () => {
    it('should validate plan moving from draft to in-progress', () => {
      const draftMarkdown = `
status: draft
## Overview
Feature plan
## Acceptance Criteria
- [ ] Task 1
- [ ] Task 2
## Phases
Details
      `

      const draftState = validatePlanState(draftMarkdown, 'draft/feature/plan.md')
      expect(draftState.valid).toBe(true)

      const inProgressMarkdown = `
status: in-progress
## Overview
Feature plan
## Acceptance Criteria
- [x] Task 1
- [ ] Task 2
## Phases
Details
      `

      const inProgressState = validatePlanState(inProgressMarkdown, 'in-progress/feature/plan.md')
      expect(inProgressState.valid).toBe(true)
    })

    it('should validate plan moving from in-progress to completed', () => {
      const completedMarkdown = `
status: completed
## Overview
Content
## Acceptance Criteria
- [x] Task 1
- [x] Task 2
## Phases
Details
      `

      const completedState = validatePlanState(completedMarkdown, 'completed/feature/plan.md')
      expect(completedState.valid).toBe(true)

      const criteria = checkAcceptanceCriteria(completedMarkdown)
      expect(criteria.allChecked).toBe(true)
    })

    it('should detect common mistakes', () => {
      const markdown = `
status: completed
## Overview
Content
## Acceptance Criteria
- [x] Task 1
- [ ] Task 2
## Phases
Details
      `

      // Completed but in wrong folder
      const state1 = validatePlanState(markdown, 'in-progress/plan.md')
      expect(state1.valid).toBe(false)

      // Completed but not all criteria checked
      const state2 = validatePlanState(markdown, 'completed/plan.md')
      expect(state2.valid).toBe(false)
    })
  })
})
