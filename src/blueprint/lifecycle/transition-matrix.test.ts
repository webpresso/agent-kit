import { describe, expect, it } from 'vitest'

import {
  getLegalLifecycleTargets,
  isLegalLifecycleTransition,
  parseLifecycleBlueprintStatus,
} from './transition-matrix.js'

describe('transition-matrix', () => {
  it('parses canonical lifecycle statuses', () => {
    expect(parseLifecycleBlueprintStatus('in-progress')).toBe('in-progress')
    expect(parseLifecycleBlueprintStatus('nope')).toBeNull()
  })

  it('returns the legal targets for each lifecycle state', () => {
    expect(getLegalLifecycleTargets('draft')).toStrictEqual(['planned', 'archived'])
    expect(getLegalLifecycleTargets('completed')).toStrictEqual(['in-progress', 'archived'])
    expect(getLegalLifecycleTargets('archived')).toStrictEqual([])
  })

  it('accepts only legal lifecycle transitions', () => {
    expect(isLegalLifecycleTransition('draft', 'planned')).toBe(true)
    expect(isLegalLifecycleTransition('completed', 'in-progress')).toBe(true)
    expect(isLegalLifecycleTransition('draft', 'completed')).toBe(false)
    expect(isLegalLifecycleTransition('archived', 'planned')).toBe(false)
  })
})
