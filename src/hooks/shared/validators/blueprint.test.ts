import { describe, expect, it } from 'vitest'

import { shouldSkipFile, validateBlueprint } from './blueprint.js'

describe('shared blueprint validator', () => {
  it('does not skip blueprint markdown under blueprints roots', () => {
    expect(shouldSkipFile('blueprints/planned/my-feature.md')).toBe(false)
    expect(shouldSkipFile('webpresso/blueprints/planned/my-feature/_overview.md')).toBe(false)
    expect(shouldSkipFile('docs/my-feature.md')).toBe(true)
  })

  it('treats blueprint markdown as actionable rather than generic docs', () => {
    const result = validateBlueprint('blueprints/planned/my-feature.md')
    expect(result.valid).toBe(true)
    expect(result.details?.skipReason).toBeUndefined()
  })
})
