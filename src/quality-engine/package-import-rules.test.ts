/**
 * package-import-rules tests
 *
 * Tests for the pure shared detection logic for duplicate shared-function imports.
 * No hook-specific types are referenced here.
 */

import { describe, expect, it } from 'vitest'

import { createBlockedResult, findDuplicateFunctions } from './package-import-rules'

describe('findDuplicateFunctions', () => {
  describe('detects duplicate shared functions', () => {
    it('should detect a function declaration that duplicates a shared utility', () => {
      const content = `
        export function capitalize(str: string): string {
          return str.charAt(0).toUpperCase() + str.slice(1)
        }
      `
      const results = findDuplicateFunctions(content)
      expect(results).toHaveLength(1)
      expect(results[0]?.name).toBe('capitalize')
      expect(results[0]?.package).toBe('@webpresso/utils')
      expect(results[0]?.source).toBe('string')
    })

    it('should detect a const arrow function that duplicates a shared utility', () => {
      const content = `
        const slugify = (str: string) => str.toLowerCase().replace(/s+/g, '-')
      `
      const results = findDuplicateFunctions(content)
      expect(results).toHaveLength(1)
      expect(results[0]?.name).toBe('slugify')
    })

    it('should detect a const function expression that duplicates a shared utility', () => {
      const content = `
        const formatDate = function(date: Date): string {
          return date.toISOString()
        }
      `
      const results = findDuplicateFunctions(content)
      expect(results).toHaveLength(1)
      expect(results[0]?.name).toBe('formatDate')
    })

    it('should detect multiple duplicate functions in a single file', () => {
      const content = `
        function capitalize(str: string) { return str }
        function slugify(str: string) { return str }
        function generateId() { return '123' }
      `
      const results = findDuplicateFunctions(content)
      expect(results.length).toBeGreaterThanOrEqual(3)
      const names = results.map((r) => r.name)
      expect(names).toContain('capitalize')
      expect(names).toContain('slugify')
      expect(names).toContain('generateId')
    })

    it('should return empty array when no shared functions are duplicated', () => {
      const content = `
        function myCustomHelper(x: string): string {
          return x + '_custom'
        }
        const localUtil = (n: number) => n * 2
      `
      const results = findDuplicateFunctions(content)
      expect(results).toHaveLength(0)
    })

    it('should return empty array for empty content', () => {
      const results = findDuplicateFunctions('')
      expect(results).toHaveLength(0)
    })

    it('should detect exported function declarations', () => {
      const content = `export function formatBytes(bytes: number): string { return '' }`
      const results = findDuplicateFunctions(content)
      expect(results).toHaveLength(1)
      expect(results[0]?.name).toBe('formatBytes')
      expect(results[0]?.source).toBe('format')
    })

    it('should detect error-response shared functions', () => {
      const content = `
        function badRequest(msg: string) { return new Response(msg, { status: 400 }) }
      `
      const results = findDuplicateFunctions(content)
      expect(results).toHaveLength(1)
      expect(results[0]?.name).toBe('badRequest')
      expect(results[0]?.package).toBe('@webpresso/hono-utils')
      expect(results[0]?.source).toBe('')
    })
  })

  describe('category metadata', () => {
    it('should return correct category for string utilities', () => {
      const content = `function truncate(s: string) { return s }`
      const results = findDuplicateFunctions(content)
      expect(results[0]?.category).toBe('string')
    })

    it('should return correct category for date utilities', () => {
      const content = `function isToday(d: Date) { return true }`
      const results = findDuplicateFunctions(content)
      expect(results[0]?.category).toBe('date')
    })
  })
})

describe('createBlockedResult', () => {
  it('should include the violating function name', () => {
    const sharedFunc = {
      name: 'capitalize',
      package: '@webpresso/utils',
      source: 'string',
      category: 'string' as const,
    }
    const result = createBlockedResult(sharedFunc)
    expect(result.functionName).toBe('capitalize')
  })

  it('should produce a correct import suggestion', () => {
    const sharedFunc = {
      name: 'capitalize',
      package: '@webpresso/utils',
      source: 'string',
      category: 'string' as const,
    }
    const result = createBlockedResult(sharedFunc)
    expect(result.suggestion).toBe("import { capitalize } from '@webpresso/utils/string'")
  })

  it('should include package and source in the result', () => {
    const sharedFunc = {
      name: 'formatBytes',
      package: '@webpresso/utils',
      source: 'format',
      category: 'format' as const,
    }
    const result = createBlockedResult(sharedFunc)
    expect(result.package).toBe('@webpresso/utils')
    expect(result.source).toBe('format')
  })

  it('should include a descriptive message', () => {
    const sharedFunc = {
      name: 'slugify',
      package: '@webpresso/utils',
      source: 'string',
      category: 'string' as const,
    }
    const result = createBlockedResult(sharedFunc)
    expect(result.message).toContain('slugify')
    expect(result.message).toContain('@webpresso/utils')
  })

  it('should produce suggestion for error-responses source', () => {
    const sharedFunc = {
      name: 'notFound',
      package: '@webpresso/hono-utils',
      source: '',
      category: 'error' as const,
    }
    const result = createBlockedResult(sharedFunc)
    expect(result.suggestion).toBe("import { notFound } from '@webpresso/hono-utils'")
  })
})
