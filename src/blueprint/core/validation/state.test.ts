import { describe, expect, it } from 'vitest'

import { validatePlanState } from './state'

describe('validatePlanState', () => {
  describe('no status field', () => {
    it('should pass when no status is present', () => {
      const markdown = '# Plan without status'
      const result = validatePlanState(markdown)
      expect(result.valid).toBe(true)
      expect(result.error).toBe(undefined)
    })

    it('should pass with no status and path', () => {
      const markdown = '# Plan'
      const result = validatePlanState(markdown, '/some/path/plan.md')
      expect(result.valid).toBe(true)
    })
  })

  describe('completed status', () => {
    describe('without path', () => {
      it('should fail when completed but criteria not all checked', () => {
        const markdown = `
status: completed
- [x] Task 1
- [ ] Task 2
        `
        const result = validatePlanState(markdown)
        expect(result.valid).toBe(false)
        expect(result.error).toBe('Plan completed but criteria not met')
      })

      it('should pass when completed and all criteria checked', () => {
        const markdown = `
status: completed
- [x] Task 1
- [x] Task 2
        `
        const result = validatePlanState(markdown)
        expect(result.valid).toBe(true)
      })

      it('should pass when completed and no criteria', () => {
        const markdown = 'status: completed'
        const result = validatePlanState(markdown)
        expect(result.valid).toBe(true)
      })
    })

    describe('with completed folder path', () => {
      it('should pass when in completed folder with all criteria checked', () => {
        const markdown = `
status: completed
- [x] Task 1
- [x] Task 2
        `
        const result = validatePlanState(markdown, '/plans/completed/my-plan/plan.md')
        expect(result.valid).toBe(true)
      })

      it('should fail when completed but not in completed folder', () => {
        const markdown = `
status: completed
- [x] Task 1
- [x] Task 2
        `
        const result = validatePlanState(markdown, '/plans/in-progress/my-plan/plan.md')
        expect(result.valid).toBe(false)
        expect(result.error).toContain('not in completed/ folder')
        expect(result.error).toContain('git mv')
      })

      it('should fail when completed but criteria not all checked', () => {
        const markdown = `
status: completed
- [x] Task 1
- [ ] Task 2
        `
        const result = validatePlanState(markdown, '/plans/completed/my-plan/plan.md')
        expect(result.valid).toBe(false)
        expect(result.error).toContain('only 1/2 acceptance criteria are checked')
      })

      it('should fail when in completed folder but status not completed', () => {
        const markdown = `
status: in-progress
- [x] Task 1
- [ ] Task 2
        `
        const result = validatePlanState(markdown, '/plans/completed/my-plan/plan.md')
        expect(result.valid).toBe(false)
        expect(result.error).toContain('in completed/ folder but has status: in-progress')
      })

      it('should handle relative path with completed/', () => {
        const markdown = 'status: completed\n- [x] Done'
        const result = validatePlanState(markdown, 'completed/plan.md')
        expect(result.valid).toBe(true)
      })
    })
  })

  describe('draft status', () => {
    describe('without path', () => {
      it('should fail when draft but criteria are checked', () => {
        const markdown = `
status: draft
- [x] Task 1
- [ ] Task 2
        `
        const result = validatePlanState(markdown)
        expect(result.valid).toBe(false)
        expect(result.error).toBe('Plan draft but criteria checked')
      })

      it('should pass when draft and no criteria checked', () => {
        const markdown = `
status: draft
- [ ] Task 1
- [ ] Task 2
        `
        const result = validatePlanState(markdown)
        expect(result.valid).toBe(true)
      })

      it('should pass when draft and no criteria', () => {
        const markdown = 'status: draft'
        const result = validatePlanState(markdown)
        expect(result.valid).toBe(true)
      })
    })

    describe('with draft folder path', () => {
      it('should pass when draft in draft folder with no checked criteria', () => {
        const markdown = `
status: draft
- [ ] Task 1
- [ ] Task 2
        `
        const result = validatePlanState(markdown, '/plans/draft/my-plan/plan.md')
        expect(result.valid).toBe(true)
      })

      it('should fail when draft but not in draft folder', () => {
        const markdown = `
status: draft
- [ ] Task 1
        `
        const result = validatePlanState(markdown, '/plans/in-progress/my-plan/plan.md')
        expect(result.valid).toBe(false)
        expect(result.error).toContain('not in draft/ folder')
        expect(result.error).toContain('git mv')
      })

      it('should fail when draft in draft but criteria are checked', () => {
        const markdown = `
status: draft
- [x] Task 1
        `
        const result = validatePlanState(markdown, '/plans/draft/my-plan/plan.md')
        expect(result.valid).toBe(false)
        expect(result.error).toContain('1 acceptance criteria are checked (expected 0)')
      })

      it('should fail when in draft but status not draft', () => {
        const markdown = `
status: in-progress
- [ ] Task 1
        `
        const result = validatePlanState(markdown, '/plans/draft/my-plan/plan.md')
        expect(result.valid).toBe(false)
        expect(result.error).toContain('in draft/ folder but has status: in-progress')
      })

      it('should handle relative path with draft/', () => {
        const markdown = 'status: draft\n- [ ] Todo'
        const result = validatePlanState(markdown, 'draft/plan.md')
        expect(result.valid).toBe(true)
      })
    })
  })

  describe('other statuses', () => {
    it('should pass in-progress status without folder constraint', () => {
      const markdown = `
status: in-progress
- [x] Task 1
- [ ] Task 2
      `
      const result = validatePlanState(markdown, '/plans/in-progress/plan.md')
      expect(result.valid).toBe(true)
    })

    it('should pass parked status in parked folder', () => {
      const markdown = `
status: parked
- [ ] Task 1
      `
      const result = validatePlanState(markdown, '/plans/parked/plan.md')
      expect(result.valid).toBe(true)
    })

    it('should fail parked status outside parked folder', () => {
      const markdown = 'status: parked'
      const result = validatePlanState(markdown, '/plans/draft/plan.md')
      expect(result.valid).toBe(false)
      expect(result.error).toContain('in draft/ folder but has status: parked')
    })

    it('should reject invalid blueprint status blocked', () => {
      const markdown = 'status: blocked'
      const result = validatePlanState(markdown, '/plans/in-progress/plan.md')
      expect(result.valid).toBe(false)
      expect(result.error).toContain('invalid status')
    })
  })

  describe('invalid statuses', () => {
    it('should reject unknown status', () => {
      const markdown = 'status: review'
      const result = validatePlanState(markdown)
      expect(result.valid).toBe(false)
      expect(result.error).toContain('invalid status: review')
    })

    it('should reject unknown status even with path', () => {
      const markdown = 'status: deprioritized'
      const result = validatePlanState(markdown, '/plans/draft/plan.md')
      expect(result.valid).toBe(false)
      expect(result.error).toContain('invalid status: deprioritized')
    })
  })

  describe('status format variations', () => {
    it('should parse status with extra spaces', () => {
      const markdown = 'status:   completed'
      const result = validatePlanState(markdown)
      expect(result.valid).toBe(true)
    })

    it('should parse status at start of line', () => {
      const markdown = `
# Plan
status: draft
- [ ] Task
      `
      const result = validatePlanState(markdown)
      expect(result.valid).toBe(true)
    })

    it('should not parse status mid-line', () => {
      const markdown = 'The status: completed is here'
      const result = validatePlanState(markdown)
      expect(result.valid).toBe(true) // No status found
    })

    it('should not match status mid-line even with validation criteria', () => {
      // This tests that status regex anchor (^) is required
      // If "The status: completed" matches, it would try to validate completed status
      // without being in completed/ folder and would fail
      const markdown = `
The status: completed is here
- [x] Task 1
      `
      const result = validatePlanState(markdown, '/plans/in-progress/plan.md')
      // Should pass because no status at start of line is found
      expect(result.valid).toBe(true)
    })

    it('should require status at exact start of line', () => {
      // Status prefixed with space should not match
      const markdown = ' status: completed\n- [x] Done'
      const result = validatePlanState(markdown, '/plans/in-progress/plan.md')
      // Should pass because " status" doesn't match "^status"
      expect(result.valid).toBe(true)
    })

    it('should parse status with no space after colon', () => {
      const markdown = 'status:completed'
      const result = validatePlanState(markdown)
      expect(result.valid).toBe(true)
    })

    it('should validate status:completed (no space) triggers completed validation', () => {
      // This tests that \s* matches zero spaces - status:completed works
      // If mutated to \s (one space required), this would fail to parse status
      const markdown = 'status:completed\n- [x] Done'
      const result = validatePlanState(markdown, '/plans/in-progress/plan.md')
      // Should FAIL because status:completed is parsed and not in completed/ folder
      expect(result.valid).toBe(false)
      expect(result.error).toContain('not in completed/ folder')
    })

    it('should parse status case-sensitively', () => {
      const markdown = 'status: COMPLETED'
      const result = validatePlanState(markdown, '/plans/completed/plan.md')
      // Status is COMPLETED not completed, so different validation
      expect(result.valid).toBe(false)
      expect(result.error).toContain('status: COMPLETED')
    })
  })

  describe('criteria counting edge cases', () => {
    it('should count criteria correctly with 0 total', () => {
      const markdown = 'status: completed'
      const result = validatePlanState(markdown)
      expect(result.valid).toBe(true)
    })

    it('should count criteria correctly with multiple checked', () => {
      const markdown = `
status: completed
- [x] Task 1
- [x] Task 2
- [x] Task 3
      `
      const result = validatePlanState(markdown, '/plans/completed/plan.md')
      expect(result.valid).toBe(true)
    })

    it('should fail with partial completion', () => {
      const markdown = `
status: completed
- [x] Task 1
- [x] Task 2
- [ ] Task 3
      `
      const result = validatePlanState(markdown, '/plans/completed/plan.md')
      expect(result.valid).toBe(false)
      expect(result.error).toContain('2/3')
    })

    it('should count only 1 checked for draft error message', () => {
      const markdown = `
status: draft
- [x] Task 1
- [ ] Task 2
      `
      const result = validatePlanState(markdown, '/plans/draft/plan.md')
      expect(result.valid).toBe(false)
      expect(result.error).toContain('1 acceptance criteria')
    })
  })

  describe('folder path edge cases', () => {
    it('should handle path with /completed/ in middle', () => {
      const markdown = 'status: completed\n- [x] Done'
      const result = validatePlanState(markdown, '/docs/plans/completed/plan.md')
      expect(result.valid).toBe(true)
    })

    it('should handle path with /draft/ in middle', () => {
      const markdown = 'status: draft\n- [ ] Todo'
      const result = validatePlanState(markdown, '/docs/plans/draft/plan.md')
      expect(result.valid).toBe(true)
    })

    it('should handle path with /parked/ in middle', () => {
      const markdown = 'status: parked\n- [ ] Todo'
      const result = validatePlanState(markdown, '/docs/plans/parked/plan.md')
      expect(result.valid).toBe(true)
    })

    it('should not match "completed" in filename', () => {
      const markdown = 'status: in-progress'
      const result = validatePlanState(markdown, '/plans/completed-feature.md')
      // Should pass because completed is in filename not folder
      expect(result.valid).toBe(true)
    })

    it('should not match "draft" in filename', () => {
      const markdown = 'status: in-progress'
      const result = validatePlanState(markdown, '/plans/draft-items.md')
      expect(result.valid).toBe(true)
    })

    it('should not recognize Windows-style paths with backslashes', () => {
      const markdown = 'status: completed\n- [x] Done'
      const result = validatePlanState(markdown, 'C:\\plans\\completed\\plan.md')
      // Only checks for forward slashes, not backslashes
      expect(result.valid).toBe(false)
      expect(result.error).toContain('not in completed/ folder')
    })

    it('should handle empty path string', () => {
      const markdown = 'status: completed\n- [x] Done'
      const result = validatePlanState(markdown, '')
      expect(result.valid).toBe(true)
    })
  })

  describe('complex scenarios', () => {
    it('should validate completed plan in correct folder with all criteria', () => {
      const markdown = `
---
status: completed
---

## Acceptance Criteria
- [x] Feature implemented
- [x] Tests passing
- [x] Documentation updated
      `
      const result = validatePlanState(markdown, '/docs/plans/completed/feature-x/plan.md')
      expect(result.valid).toBe(true)
    })

    it('should catch completed plan in wrong folder', () => {
      const markdown = `
status: completed
- [x] Task
      `
      const result = validatePlanState(markdown, '/docs/plans/draft/plan.md')
      expect(result.valid).toBe(false)
    })

    it('should catch draft with checked items in correct folder', () => {
      const markdown = `
status: draft
- [x] Task
      `
      const result = validatePlanState(markdown, '/docs/plans/draft/plan.md')
      expect(result.valid).toBe(false)
    })

    it('should handle multiple validation failures (completed not in folder)', () => {
      const markdown = `
status: completed
- [x] Task 1
- [ ] Task 2
      `
      const result = validatePlanState(markdown, '/plans/in-progress/plan.md')
      expect(result.valid).toBe(false)
      // Should fail on folder location first
      expect(result.error).toContain('not in completed/ folder')
    })

    it('should validate both completed folder AND draft folder rules', () => {
      // This tests that draft validation runs after completed validation passes
      // The mutation changes `if (!draftResult.valid) return draftResult` to `if (true)`
      const markdown = `
status: in-progress
- [x] Task 1
- [ ] Task 2
      `
      // in-progress status in in-progress folder should be valid
      const result = validatePlanState(markdown, '/plans/in-progress/plan.md')
      expect(result.valid).toBe(true)
    })

    it('should return valid when validateStateWithPath passes all checks', () => {
      // This ensures the final return { valid: true } is reached
      const markdown = `
status: in-progress
- [x] Task 1
      `
      const result = validatePlanState(markdown, '/plans/in-progress/feature/plan.md')
      expect(result.valid).toBe(true)
      expect(result.error).toBe(undefined)
    })
  })

  describe('validateStateOnly branch', () => {
    it('should use state-only validation when no path provided', () => {
      // Tests that when filePath is undefined, we use validateStateOnly
      const markdown = `
status: in-progress
- [x] Task 1
      `
      const result = validatePlanState(markdown)
      expect(result.valid).toBe(true)
    })

    it('should fail completed status with unchecked criteria (no path)', () => {
      const markdown = `
status: completed
- [x] Task 1
- [ ] Task 2
      `
      const result = validatePlanState(markdown)
      expect(result.valid).toBe(false)
      expect(result.error).toBe('Plan completed but criteria not met')
    })

    it('should return valid true and undefined error when no status found', () => {
      // This kills the mutation that removes the early return when !status
      // If the return is removed, the code would try to validate with undefined status
      const markdown = '# Plan without status\n- [ ] Task 1'
      const result = validatePlanState(markdown)
      expect(result.valid).toBe(true)
      expect(result.error).toBe(undefined)
    })
  })
})
