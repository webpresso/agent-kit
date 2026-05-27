/**
 * package-import-rules tests
 *
 * Tests for the pure shared detection logic for duplicate shared-function imports.
 * No hook-specific types are referenced here.
 */

import { describe, expect, it } from 'vitest'

import {
  SHARED_FUNCTIONS,
  SHARED_FUNCTION_PROFILES,
  createBlockedResult,
  findDuplicateFunctions,
} from './package-import-rules'

describe('findDuplicateFunctions', () => {
  describe('generic default profile', () => {
    it('does not suggest Webpresso-only shared utilities by default', () => {
      const content = `
        export function capitalize(str: string): string {
          return str.charAt(0).toUpperCase() + str.slice(1)
        }
      `

      expect(SHARED_FUNCTIONS).toEqual([])
      expect(findDuplicateFunctions(content)).toHaveLength(0)
    })
  })

  describe('explicit webpresso profile', () => {
    it('detects a function declaration that duplicates a shared utility', () => {
      const content = `
        export function capitalize(str: string): string {
          return str.charAt(0).toUpperCase() + str.slice(1)
        }
      `
      const results = findDuplicateFunctions(content, { profile: 'webpresso' })
      expect(results).toHaveLength(1)
      expect(results[0]?.name).toBe('capitalize')
      expect(results[0]?.package).toBe('@webpresso/webpresso')
      expect(results[0]?.source).toBe('runtime/format/string')
    })

    it('detects a const arrow function that duplicates a shared utility', () => {
      const content = `
        const slugify = (str: string) => str.toLowerCase().replace(/s+/g, '-')
      `
      const results = findDuplicateFunctions(content, { profile: 'webpresso' })
      expect(results).toHaveLength(1)
      expect(results[0]?.name).toBe('slugify')
    })

    it('detects a const function expression that duplicates a shared utility', () => {
      const content = `
        const formatDate = function(date: Date): string {
          return date.toISOString()
        }
      `
      const results = findDuplicateFunctions(content, { profile: 'webpresso' })
      expect(results).toHaveLength(1)
      expect(results[0]?.name).toBe('formatDate')
    })

    it('detects multiple duplicate functions in a single file', () => {
      const content = `
        function capitalize(str: string) { return str }
        function slugify(str: string) { return str }
        function generateId() { return '123' }
      `
      const results = findDuplicateFunctions(content, { profile: 'webpresso' })
      expect(results.length).toBeGreaterThanOrEqual(3)
      const names = results.map((r) => r.name)
      expect(names).toContain('capitalize')
      expect(names).toContain('slugify')
      expect(names).toContain('generateId')
    })

    it('returns empty array when no shared functions are duplicated', () => {
      const content = `
        function myCustomHelper(x: string): string {
          return x + '_custom'
        }
        const localUtil = (n: number) => n * 2
      `
      const results = findDuplicateFunctions(content, { profile: 'webpresso' })
      expect(results).toHaveLength(0)
    })

    it('returns empty array for empty content', () => {
      const results = findDuplicateFunctions('', { profile: 'webpresso' })
      expect(results).toHaveLength(0)
    })

    it('detects exported function declarations', () => {
      const content = `export function formatBytes(bytes: number): string { return '' }`
      const results = findDuplicateFunctions(content, { profile: 'webpresso' })
      expect(results).toHaveLength(1)
      expect(results[0]?.name).toBe('formatBytes')
      expect(results[0]?.source).toBe('runtime/format/format')
    })

    it('detects error-response shared functions', () => {
      const content = `
        function badRequest(msg: string) { return new Response(msg, { status: 400 }) }
      `
      const results = findDuplicateFunctions(content, { profile: 'webpresso' })
      expect(results).toHaveLength(1)
      expect(results[0]?.name).toBe('badRequest')
      expect(results[0]?.package).toBe('@webpresso/hono-utils')
      expect(results[0]?.source).toBe('')
    })
  })

  describe('category metadata', () => {
    it('keeps the explicit webpresso profile available for opt-in use', () => {
      expect(SHARED_FUNCTION_PROFILES.webpresso.length).toBeGreaterThan(0)
      expect(
        SHARED_FUNCTION_PROFILES.webpresso.some((item) => item.package === '@webpresso/webpresso'),
      ).toBe(true)
    })

    it('returns correct category for string utilities', () => {
      const content = `function truncate(s: string) { return s }`
      const results = findDuplicateFunctions(content, { profile: 'webpresso' })
      expect(results[0]?.category).toBe('string')
    })

    it('returns correct category for date utilities', () => {
      const content = `function isToday(d: Date) { return true }`
      const results = findDuplicateFunctions(content, { profile: 'webpresso' })
      expect(results[0]?.category).toBe('date')
    })
  })
})

describe('createBlockedResult', () => {
  it('includes the violating function name', () => {
    const sharedFunc = {
      name: 'capitalize',
      package: '@webpresso/webpresso',
      source: 'runtime/format/string',
      category: 'string' as const,
    }
    const result = createBlockedResult(sharedFunc)
    expect(result.functionName).toBe('capitalize')
  })

  it('produces a correct import suggestion', () => {
    const sharedFunc = {
      name: 'capitalize',
      package: '@webpresso/webpresso',
      source: 'runtime/format/string',
      category: 'string' as const,
    }
    const result = createBlockedResult(sharedFunc)
    expect(result.suggestion).toBe(
      "import { capitalize } from '@webpresso/webpresso/runtime/format/string'",
    )
  })

  it('includes package and source in the result', () => {
    const sharedFunc = {
      name: 'formatBytes',
      package: '@webpresso/webpresso',
      source: 'runtime/format/format',
      category: 'format' as const,
    }
    const result = createBlockedResult(sharedFunc)
    expect(result.package).toBe('@webpresso/webpresso')
    expect(result.source).toBe('runtime/format/format')
  })

  it('includes a generic descriptive message', () => {
    const sharedFunc = {
      name: 'slugify',
      package: '@webpresso/webpresso',
      source: 'runtime/format/string',
      category: 'string' as const,
    }
    const result = createBlockedResult(sharedFunc)
    expect(result.message).toContain('slugify')
    expect(result.message).toContain('shared package')
    expect(result.message).not.toContain('monorepo')
  })

  it('produces suggestion for error-responses source', () => {
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
