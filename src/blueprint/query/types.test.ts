import { describe, expect, it } from 'vitest'

import { isBlueprintStatus, isComplexity, isTaskStatus } from './types.js'

describe('isBlueprintStatus', () => {
  describe('valid statuses', () => {
    it('returns true for "draft"', () => {
      expect(isBlueprintStatus('draft')).toBe(true)
    })

    it('returns true for "in-progress"', () => {
      expect(isBlueprintStatus('in-progress')).toBe(true)
    })

    it('returns true for "planned"', () => {
      expect(isBlueprintStatus('planned')).toBe(true)
    })

    it('returns true for "parked"', () => {
      expect(isBlueprintStatus('parked')).toBe(true)
    })

    it('returns false for blueprint status string "blocked"', () => {
      expect(isBlueprintStatus('blocked')).toBe(false)
    })

    it('returns false for blueprint status string "backlog"', () => {
      expect(isBlueprintStatus('backlog')).toBe(false)
    })

    it('returns true for "completed"', () => {
      expect(isBlueprintStatus('completed')).toBe(true)
    })

    it('returns true for "archived"', () => {
      expect(isBlueprintStatus('archived')).toBe(true)
    })
  })

  describe('invalid statuses', () => {
    it('returns false for old "complete" value', () => {
      expect(isBlueprintStatus('complete')).toBe(false)
    })

    it('returns false for "invalid"', () => {
      expect(isBlueprintStatus('invalid')).toBe(false)
    })

    it('returns false for empty string', () => {
      expect(isBlueprintStatus('')).toBe(false)
    })

    it('returns false for "done"', () => {
      expect(isBlueprintStatus('done')).toBe(false)
    })

    it('returns false for "pending"', () => {
      expect(isBlueprintStatus('pending')).toBe(false)
    })
  })

  describe('case sensitivity', () => {
    it('returns false for "DRAFT" (uppercase)', () => {
      expect(isBlueprintStatus('DRAFT')).toBe(false)
    })

    it('returns false for "Draft" (mixed case)', () => {
      expect(isBlueprintStatus('Draft')).toBe(false)
    })

    it('returns false for "In-Progress" (mixed case)', () => {
      expect(isBlueprintStatus('In-Progress')).toBe(false)
    })

    it('returns false for "COMPLETED" (uppercase)', () => {
      expect(isBlueprintStatus('COMPLETED')).toBe(false)
    })
  })

  describe('edge cases', () => {
    it('returns false for string with leading whitespace', () => {
      expect(isBlueprintStatus(' draft')).toBe(false)
    })

    it('returns false for string with trailing whitespace', () => {
      expect(isBlueprintStatus('draft ')).toBe(false)
    })

    it('returns false for string with surrounding whitespace', () => {
      expect(isBlueprintStatus(' draft ')).toBe(false)
    })

    it('returns false for special characters', () => {
      expect(isBlueprintStatus('draft!')).toBe(false)
    })

    it('returns false for hyphenated variation "in_progress"', () => {
      expect(isBlueprintStatus('in_progress')).toBe(false)
    })
  })
})

describe('isComplexity', () => {
  describe('valid complexity values', () => {
    it('returns true for "XS"', () => {
      expect(isComplexity('XS')).toBe(true)
    })

    it('returns true for "S"', () => {
      expect(isComplexity('S')).toBe(true)
    })

    it('returns true for "M"', () => {
      expect(isComplexity('M')).toBe(true)
    })

    it('returns true for "L"', () => {
      expect(isComplexity('L')).toBe(true)
    })

    it('returns true for "XL"', () => {
      expect(isComplexity('XL')).toBe(true)
    })
  })

  describe('invalid complexity values', () => {
    it('returns false for "xs" (lowercase)', () => {
      expect(isComplexity('xs')).toBe(false)
    })

    it('returns false for "s" (lowercase)', () => {
      expect(isComplexity('s')).toBe(false)
    })

    it('returns false for "XXL"', () => {
      expect(isComplexity('XXL')).toBe(false)
    })

    it('returns false for "invalid"', () => {
      expect(isComplexity('invalid')).toBe(false)
    })

    it('returns false for empty string', () => {
      expect(isComplexity('')).toBe(false)
    })

    it('returns false for "SMALL"', () => {
      expect(isComplexity('SMALL')).toBe(false)
    })

    it('returns false for "medium"', () => {
      expect(isComplexity('medium')).toBe(false)
    })
  })

  describe('case sensitivity', () => {
    it('returns false for "Xs" (mixed case)', () => {
      expect(isComplexity('Xs')).toBe(false)
    })

    it('returns false for "xS" (mixed case)', () => {
      expect(isComplexity('xS')).toBe(false)
    })

    it('returns false for "xl" (lowercase)', () => {
      expect(isComplexity('xl')).toBe(false)
    })

    it('returns false for "Xl" (mixed case)', () => {
      expect(isComplexity('Xl')).toBe(false)
    })
  })

  describe('edge cases', () => {
    it('returns false for string with leading whitespace', () => {
      expect(isComplexity(' M')).toBe(false)
    })

    it('returns false for string with trailing whitespace', () => {
      expect(isComplexity('M ')).toBe(false)
    })

    it('returns false for numbers', () => {
      expect(isComplexity('1')).toBe(false)
    })

    it('returns false for special characters', () => {
      expect(isComplexity('M!')).toBe(false)
    })
  })
})

describe('isTaskStatus', () => {
  describe('valid task statuses', () => {
    it('returns true for "todo"', () => {
      expect(isTaskStatus('todo')).toBe(true)
    })

    it('returns true for "in-progress"', () => {
      expect(isTaskStatus('in-progress')).toBe(true)
    })

    it('returns true for "done"', () => {
      expect(isTaskStatus('done')).toBe(true)
    })

    it('returns true for "blocked"', () => {
      expect(isTaskStatus('blocked')).toBe(true)
    })
  })

  describe('invalid task statuses', () => {
    it('returns false for task alias "pending"', () => {
      expect(isTaskStatus('pending')).toBe(false)
    })

    it('returns false for task alias "running"', () => {
      expect(isTaskStatus('running')).toBe(false)
    })

    it('returns false for task alias "completed"', () => {
      expect(isTaskStatus('completed')).toBe(false)
    })

    it('returns false for "in_progress" (underscored)', () => {
      expect(isTaskStatus('in_progress')).toBe(false)
    })

    it('returns false for "invalid"', () => {
      expect(isTaskStatus('invalid')).toBe(false)
    })

    it('returns false for empty string', () => {
      expect(isTaskStatus('')).toBe(false)
    })

    it('returns false for "draft"', () => {
      expect(isTaskStatus('draft')).toBe(false)
    })

    it('returns false for "complete"', () => {
      expect(isTaskStatus('complete')).toBe(false)
    })

    it('returns false for "archived"', () => {
      expect(isTaskStatus('archived')).toBe(false)
    })

    it('returns false for "review"', () => {
      expect(isTaskStatus('review')).toBe(false)
    })

    it('returns false for "failed"', () => {
      expect(isTaskStatus('failed')).toBe(false)
    })
  })

  describe('case sensitivity', () => {
    it('returns false for "Todo" (mixed case)', () => {
      expect(isTaskStatus('Todo')).toBe(false)
    })

    it('returns false for "In_Progress" (mixed case)', () => {
      expect(isTaskStatus('In_Progress')).toBe(false)
    })

    it('returns false for "DONE" (uppercase)', () => {
      expect(isTaskStatus('DONE')).toBe(false)
    })

    it('returns false for "Blocked" (mixed case)', () => {
      expect(isTaskStatus('Blocked')).toBe(false)
    })
  })

  describe('edge cases', () => {
    it('returns false for string with leading whitespace', () => {
      expect(isTaskStatus(' todo')).toBe(false)
    })

    it('returns false for string with trailing whitespace', () => {
      expect(isTaskStatus('todo ')).toBe(false)
    })

    it('returns false for special characters', () => {
      expect(isTaskStatus('todo!')).toBe(false)
    })

    it('returns false for numbers', () => {
      expect(isTaskStatus('1')).toBe(false)
    })
  })
})
