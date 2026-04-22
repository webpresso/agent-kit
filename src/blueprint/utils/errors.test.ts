import { describe, expect, it } from 'vitest'

import { BlueprintNotFoundError } from './errors.js'

describe('BlueprintNotFoundError', () => {
  describe('error properties', () => {
    it('should set all required properties correctly', () => {
      const slug = 'my-plan'
      const searchedPath = '/path/to/webpresso/blueprints/my-plan/_overview.md'
      const availableSlugs = ['plan-a', 'plan-b', 'plan-c']

      const error = new BlueprintNotFoundError(slug, searchedPath, availableSlugs)

      expect(error.name).toBe('BlueprintNotFoundError')
      expect(error.requestedSlug).toBe(slug)
      expect(error.searchedPath).toBe(searchedPath)
      expect(error.availableSlugs).toEqual(availableSlugs)
      expect(error).toBeInstanceOf(Error)
      expect(error).toBeInstanceOf(BlueprintNotFoundError)
    })

    it('should make availableSlugs readonly', () => {
      const availableSlugs = ['plan-a', 'plan-b']
      const error = new BlueprintNotFoundError('test', '/path', availableSlugs)

      // TypeScript should enforce readonly at compile time
      // At runtime, we verify the property exists
      expect(Array.isArray(error.availableSlugs)).toBe(true)
    })

    it('should have stack trace', () => {
      const error = new BlueprintNotFoundError('test', '/path', [])

      expect(typeof error.stack).toBe('string')
      expect(error.stack).toContain('BlueprintNotFoundError')
    })
  })

  describe('error message formatting', () => {
    it('should include plan name, searched path, and available slugs', () => {
      const error = new BlueprintNotFoundError(
        'missing-plan',
        '/path/to/missing-plan/_overview.md',
        ['feature-a', 'feature-b'],
      )

      expect(error.message).toContain('Plan missing-plan not found')
      expect(error.message).toContain('Searched: /path/to/missing-plan/_overview.md')
      expect(error.message).toContain('Available plans: feature-a, feature-b')
    })

    it('should show "No plans available" when availableSlugs is empty', () => {
      const error = new BlueprintNotFoundError('test-plan', '/path/to/test-plan/_overview.md', [])

      expect(error.message).toContain('Plan test-plan not found')
      expect(error.message).toContain('No plans available')
      expect(error.message).not.toContain('Available plans:')
    })

    it('should handle single available plan', () => {
      const error = new BlueprintNotFoundError('typo-plan', '/path/to/typo-plan/_overview.md', [
        'correct-plan',
      ])

      expect(error.message).toContain('Available plans: correct-plan')
    })

    it('should format multiple slugs with comma separation', () => {
      const error = new BlueprintNotFoundError('test', '/path', ['alpha', 'beta', 'gamma', 'delta'])

      expect(error.message).toContain('Available plans: alpha, beta, gamma, delta')
    })
  })

  describe('edge cases', () => {
    it('should handle empty slug', () => {
      const error = new BlueprintNotFoundError('', '/path', ['plan-a'])

      expect(error.requestedSlug).toBe('')
      expect(error.message).toContain('Plan  not found')
    })

    it('should handle very long available slugs list', () => {
      const longList = Array.from({ length: 50 }, (_, i) => `plan-${i}`)
      const error = new BlueprintNotFoundError('test', '/path', longList)

      expect(error.availableSlugs).toHaveLength(50)
      expect(error.message).toContain('Available plans:')
      expect(error.message).toContain('plan-0')
      expect(error.message).toContain('plan-49')
    })

    it('should handle special characters in slugs', () => {
      const error = new BlueprintNotFoundError('test@v2', '/path/to/test@v2/_overview.md', [
        'test@v1',
        'test@v2-beta',
      ])

      expect(error.requestedSlug).toBe('test@v2')
      expect(error.message).toContain('test@v1, test@v2-beta')
    })

    it('should handle paths with spaces', () => {
      const path = '/path/to/my plan/_overview.md'
      const error = new BlueprintNotFoundError('my plan', path, [])

      expect(error.searchedPath).toBe(path)
      expect(error.message).toContain(path)
    })
  })

  describe('error instance checks', () => {
    it('should be catchable as Error', () => {
      let caughtError: Error | undefined

      try {
        throw new BlueprintNotFoundError('test', '/path', [])
      } catch (error) {
        caughtError = error as Error
      }

      expect(caughtError).toBeInstanceOf(Error)
      expect(caughtError?.message).toContain('Plan test not found')
    })

    it('should be distinguishable from generic Error', () => {
      const planError = new BlueprintNotFoundError('test', '/path', [])
      const genericError = new Error('Plan test not found')

      expect(planError).toBeInstanceOf(BlueprintNotFoundError)
      expect(genericError).not.toBeInstanceOf(BlueprintNotFoundError)
    })

    it('should allow type-safe error handling', () => {
      let availableSlugs: readonly string[] | undefined

      try {
        throw new BlueprintNotFoundError('test', '/path', ['plan-a', 'plan-b'])
      } catch (error) {
        if (error instanceof BlueprintNotFoundError) {
          availableSlugs = error.availableSlugs
        }
      }

      expect(availableSlugs).toEqual(['plan-a', 'plan-b'])
    })
  })
})
