import { describe, expect, it } from 'vitest'
import {
  findMutationGamingPatterns,
  findTautologicalAssertions,
  validateTestQuality,
} from '#hooks/pretool-guard/validators/test-quality'
import type { ToolInput } from '#hooks/shared/types'

// ---------------------------------------------------------------------------
// findTautologicalAssertions
// ---------------------------------------------------------------------------
describe('findTautologicalAssertions', () => {
  it('returns empty array for empty content', () => {
    expect(findTautologicalAssertions('')).toEqual([])
  })

  it('returns empty array for content with no matches', () => {
    expect(findTautologicalAssertions('expect(result).toBe(42)')).toEqual([])
  })

  it('detects expect(true).toBe(true)', () => {
    const result = findTautologicalAssertions('expect(true).toBe(true)')
    expect(result).toHaveLength(1)
    expect(result[0]).toMatchObject({ line: 1, pattern: 'expect(true).toBe(true)' })
  })

  it('detects expect(false).toBe(false)', () => {
    const result = findTautologicalAssertions('expect(false).toBe(false)')
    expect(result).toHaveLength(1)
    expect(result[0]).toMatchObject({ line: 1, pattern: 'expect(false).toBe(false)' })
  })

  it('detects expect(true).toEqual(true)', () => {
    const result = findTautologicalAssertions('expect(true).toEqual(true)')
    expect(result).toHaveLength(1)
    expect(result[0]).toMatchObject({ line: 1, pattern: 'expect(true).toEqual(true)' })
  })

  it('detects expect(false).toEqual(false)', () => {
    const result = findTautologicalAssertions('expect(false).toEqual(false)')
    expect(result).toHaveLength(1)
  })

  it('detects expect(null).toBe(null)', () => {
    const result = findTautologicalAssertions('expect(null).toBe(null)')
    expect(result).toHaveLength(1)
    expect(result[0]).toMatchObject({ pattern: 'expect(null).toBe(null)' })
  })

  it('detects expect(undefined).toBe(undefined)', () => {
    const result = findTautologicalAssertions('expect(undefined).toBe(undefined)')
    expect(result).toHaveLength(1)
    expect(result[0]).toMatchObject({ pattern: 'expect(undefined).toBe(undefined)' })
  })

  it('detects expect(null).toEqual(null)', () => {
    const result = findTautologicalAssertions('expect(null).toEqual(null)')
    expect(result).toHaveLength(1)
  })

  it('detects expect([]).toEqual([])', () => {
    const result = findTautologicalAssertions('expect([]).toEqual([])')
    expect(result).toHaveLength(1)
  })

  it('detects expect({}).toEqual({})', () => {
    const result = findTautologicalAssertions('expect({}).toEqual({})')
    expect(result).toHaveLength(1)
  })

  it('detects expect(true).toBeTruthy()', () => {
    const result = findTautologicalAssertions('expect(true).toBeTruthy()')
    expect(result).toHaveLength(1)
    expect(result[0]).toMatchObject({ pattern: 'expect(true).toBeTruthy()' })
  })

  it('detects expect(false).toBeFalsy()', () => {
    const result = findTautologicalAssertions('expect(false).toBeFalsy()')
    expect(result).toHaveLength(1)
    expect(result[0]).toMatchObject({ pattern: 'expect(false).toBeFalsy()' })
  })

  it('detects expect(1).toBeTruthy()', () => {
    const result = findTautologicalAssertions('expect(1).toBeTruthy()')
    expect(result).toHaveLength(1)
    expect(result[0]).toMatchObject({ pattern: 'expect(1).toBeTruthy()' })
  })

  it('detects expect(0).toBeFalsy()', () => {
    const result = findTautologicalAssertions('expect(0).toBeFalsy()')
    expect(result).toHaveLength(1)
    expect(result[0]).toMatchObject({ pattern: 'expect(0).toBeFalsy()' })
  })

  it('detects expect("hello").toBeTruthy()', () => {
    const result = findTautologicalAssertions('expect("hello").toBeTruthy()')
    expect(result).toHaveLength(1)
    expect(result[0]).toMatchObject({ pattern: 'expect("string").toBeTruthy()' })
  })

  it('detects expect("").toBeFalsy()', () => {
    const result = findTautologicalAssertions('expect("").toBeFalsy()')
    expect(result).toHaveLength(1)
    expect(result[0]).toMatchObject({ pattern: 'expect("").toBeFalsy()' })
  })

  it('detects expect(true).toBeDefined()', () => {
    const result = findTautologicalAssertions('expect(true).toBeDefined()')
    expect(result).toHaveLength(1)
    expect(result[0]).toMatchObject({ pattern: 'expect(true).toBeDefined()' })
  })

  it('detects expect(false).toBeDefined()', () => {
    const result = findTautologicalAssertions('expect(false).toBeDefined()')
    expect(result).toHaveLength(1)
    expect(result[0]).toMatchObject({ pattern: 'expect(false).toBeDefined()' })
  })

  it('detects expect(42).toBeDefined()', () => {
    const result = findTautologicalAssertions('expect(42).toBeDefined()')
    expect(result).toHaveLength(1)
    expect(result[0]).toMatchObject({ pattern: 'expect(number).toBeDefined()' })
  })

  it('detects expect("x").toBeDefined()', () => {
    const result = findTautologicalAssertions('expect("x").toBeDefined()')
    expect(result).toHaveLength(1)
    expect(result[0]).toMatchObject({ pattern: 'expect("string").toBeDefined()' })
  })

  it('detects expect(true).toBeInstanceOf(Object)', () => {
    const result = findTautologicalAssertions('expect(true).toBeInstanceOf(Object)')
    expect(result).toHaveLength(1)
    expect(result[0]).toMatchObject({ pattern: 'expect(true).toBeInstanceOf(Object)' })
  })

  it('detects expect(42).toBeInstanceOf(Object)', () => {
    const result = findTautologicalAssertions('expect(42).toBeInstanceOf(Object)')
    expect(result).toHaveLength(1)
    expect(result[0]).toMatchObject({ pattern: 'expect(number).toBeInstanceOf(Object)' })
  })

  it('detects multiple tautological assertions in the same content', () => {
    const content = `
          expect(true).toBe(true)
          expect(false).toBe(false)
          expect(null).toBe(null)
        `
    const result = findTautologicalAssertions(content)
    expect(result).toHaveLength(3)
  })

  it('returns correct line numbers for multi-line content', () => {
    const content = `
          // some comment
          expect(true).toBe(true)
          // another comment
          expect(null).toBe(null)
        `
    const result = findTautologicalAssertions(content)
    expect(result).toHaveLength(2)
    expect(result[0]).toMatchObject({ line: 3 })
    expect(result[1]).toMatchObject({ line: 5 })
  })

  it('matches patterns regardless of string context (regex, not parser)', () => {
    const content = 'const msg = "this is expect(true).toBe(true) in a string"'
    const result = findTautologicalAssertions(content)
    expect(result).toHaveLength(1)
    expect(result[0]).toMatchObject({ line: 1, pattern: 'expect(true).toBe(true)' })
  })

  it('handles whitespace variations', () => {
    const result = findTautologicalAssertions('expect(  true   ).toBe(  true  )')
    expect(result).toHaveLength(1)
    expect(result[0]).toMatchObject({ pattern: 'expect(true).toBe(true)' })
  })
})

// ---------------------------------------------------------------------------
// findMutationGamingPatterns
// ---------------------------------------------------------------------------
describe('findMutationGamingPatterns', () => {
  describe('file-path-level patterns', () => {
    it('detects mutation_kill in file path', () => {
      const result = findMutationGamingPatterns('', 'src/mutation_kill.ts')
      expect(result).toHaveLength(1)
      expect(result[0]).toMatchObject({ line: 0, pattern: 'File name suggests mutation gaming' })
    })

    it('detects kill-mutant in file path', () => {
      const result = findMutationGamingPatterns('', 'tests/kill-mutant.test.ts')
      expect(result).toHaveLength(1)
      expect(result[0]).toMatchObject({ line: 0, pattern: 'File name suggests mutation gaming' })
    })

    it('detects for_coverage in file path', () => {
      const result = findMutationGamingPatterns('', 'src/for_coverage.test.ts')
      expect(result).toHaveLength(1)
      expect(result[0]).toMatchObject({ line: 0, pattern: 'File name suggests coverage gaming' })
    })

    it('detects increase_mutation in file path', () => {
      const result = findMutationGamingPatterns('', 'increase_mutation.test.ts')
      expect(result).toHaveLength(1)
      expect(result[0]).toMatchObject({ line: 0, pattern: 'File name suggests mutation gaming' })
    })

    it('returns empty array for valid file paths', () => {
      expect(findMutationGamingPatterns('', 'src/valid.test.ts')).toEqual([])
      expect(findMutationGamingPatterns('', 'utils/helpers.test.ts')).toEqual([])
    })
  })

  describe('content-level patterns', () => {
    it('detects mutation-kill in describe', () => {
      const result = findMutationGamingPatterns("describe('mutation-kill suite', () => {})")
      expect(result).toHaveLength(1)
      expect(result[0]).toMatchObject({ line: 1, pattern: 'Test suite name suggests mutation gaming' })
    })

    it('detects kill_mutant in describe', () => {
      const result = findMutationGamingPatterns("describe('kill_mutant suite', () => {})")
      expect(result).toHaveLength(1)
      expect(result[0]).toMatchObject({ line: 1, pattern: 'Test suite name suggests mutation gaming' })
    })

    it('detects "kill the mutant" in it()', () => {
      const result = findMutationGamingPatterns("it('should kill the mutant', () => {})")
      expect(result).toHaveLength(1)
      expect(result[0]).toMatchObject({ pattern: 'Test name suggests mutation gaming' })
    })

    it('detects "kill mutant" in it()', () => {
      const result = findMutationGamingPatterns("it('should kill mutant', () => {})")
      expect(result).toHaveLength(1)
      expect(result[0]).toMatchObject({ pattern: 'Test name suggests mutation gaming' })
    })

    it('detects "for mutation score" in it()', () => {
      const result = findMutationGamingPatterns("it('test for mutation score', () => {})")
      expect(result).toHaveLength(1)
      expect(result[0]).toMatchObject({ pattern: 'Test name suggests mutation gaming' })
    })

    it('detects "increase mutation" in it()', () => {
      const result = findMutationGamingPatterns("it('test to increase mutation', () => {})")
      expect(result).toHaveLength(1)
      expect(result[0]).toMatchObject({ pattern: 'Test name suggests coverage gaming' })
    })

    it('detects "increase coverage" in it()', () => {
      const result = findMutationGamingPatterns("it('test to increase coverage', () => {})")
      expect(result).toHaveLength(1)
      expect(result[0]).toMatchObject({ pattern: 'Test name suggests coverage gaming' })
    })

    it('detects both file-level and content-level patterns simultaneously', () => {
      const result = findMutationGamingPatterns(
        "it('should kill mutant', () => {})",
        'src/mutation_kill.ts',
      )
      expect(result).toHaveLength(2)
      expect(result[0]).toMatchObject({ line: 0 })
      expect(result[1]).toMatchObject({ line: 1 })
    })
  })

  describe('edge cases', () => {
    it('returns empty array for empty content and no filePath', () => {
      expect(findMutationGamingPatterns('')).toEqual([])
    })

    it('returns empty array for empty content with valid filePath', () => {
      expect(findMutationGamingPatterns('', 'src/valid.test.ts')).toEqual([])
    })

    it('returns empty array for undefined filePath', () => {
      expect(findMutationGamingPatterns('', undefined)).toEqual([])
    })

    it('returns empty array for null-like no filePath', () => {
      expect(findMutationGamingPatterns('')).toEqual([])
    })

    it('correct line numbers in multi-line content', () => {
      const content = `
          // header
          describe('mutation-kill suite', () => {})
          // some code
          it('should kill the mutant', () => {})
        `
      const result = findMutationGamingPatterns(content)
      expect(result).toHaveLength(2)
      expect(result[0]).toMatchObject({ line: 3 })
      expect(result[1]).toMatchObject({ line: 5 })
    })
  })
})

// ---------------------------------------------------------------------------
// validateTestQuality
// ---------------------------------------------------------------------------
describe('validateTestQuality', () => {
  describe('skipped / passthrough cases', () => {
    it('passes with no content and no filePath (malformed input)', () => {
      const input: ToolInput = { tool_input: {} }
      const result = validateTestQuality(input)
      expect(result).toEqual({ validator: 'test-quality', passed: true })
    })

    it('passes with null tool_input', () => {
      const input: ToolInput = {}
      const result = validateTestQuality(input)
      expect(result).toEqual({ validator: 'test-quality', passed: true })
    })

    it('passes with undefined tool_input', () => {
      const input = {} as ToolInput
      const result = validateTestQuality(input)
      expect(result).toEqual({ validator: 'test-quality', passed: true })
    })

    it('passes with empty string inputs', () => {
      const input: ToolInput = { tool_input: { file_path: '', content: '' } }
      const result = validateTestQuality(input)
      expect(result).toEqual({ validator: 'test-quality', passed: true })
    })

    it('skips for non-test file paths', () => {
      const input: ToolInput = {
        tool_input: { file_path: 'src/utils.ts', content: 'some content' },
      }
      const result = validateTestQuality(input)
      expect(result).toEqual({
        validator: 'test-quality',
        passed: true,
        skipped: true,
        skipReason: 'Not a test file',
      })
    })

    it('skips non-test files with .spec extension', () => {
      const input: ToolInput = {
        tool_input: {
          file_path: 'src/utils.spec.ts',
          content: 'expect(true).toBe(true)',
        },
      }
      const result = validateTestQuality(input)
      expect(result).toEqual({
        validator: 'test-quality',
        passed: true,
        skipped: true,
        skipReason: 'Not a test file',
      })
    })

    it('skips non-test files with .test suffix but no file extension', () => {
      const input: ToolInput = {
        tool_input: { file_path: 'test-utils', content: 'some content' },
      }
      const result = validateTestQuality(input)
      expect(result).toEqual({
        validator: 'test-quality',
        passed: true,
        skipped: true,
        skipReason: 'Not a test file',
      })
    })

    it('skips self-referencing test files (test-quality.test.ts)', () => {
      const input: ToolInput = {
        tool_input: {
          file_path: 'src/hooks/pretool-guard/validators/test-quality.test.ts',
          content: 'expect(true).toBe(true)',
        },
      }
      const result = validateTestQuality(input)
      expect(result).toEqual({
        validator: 'test-quality',
        passed: true,
        skipped: true,
        skipReason: 'Validator self-test',
      })
    })

    it('skips self-referencing test files with different path prefix', () => {
      const input: ToolInput = {
        tool_input: {
          file_path: '/foo/bar/test-quality.test.ts',
          content: 'expect(true).toBe(true)',
        },
      }
      const result = validateTestQuality(input)
      expect(result).toEqual({
        validator: 'test-quality',
        passed: true,
        skipped: true,
        skipReason: 'Validator self-test',
      })
    })
  })

  describe('test file path patterns accepted', () => {
    it('accepts .test.ts files', () => {
      const input: ToolInput = {
        tool_input: { file_path: 'src/foo.test.ts', content: 'expect(result).toBe(42)' },
      }
      const result = validateTestQuality(input)
      expect(result).toEqual({ validator: 'test-quality', passed: true })
    })

    it('accepts .test.tsx files', () => {
      const input: ToolInput = {
        tool_input: {
          file_path: 'src/foo.test.tsx',
          content: 'expect(result).toBe(42)',
        },
      }
      const result = validateTestQuality(input)
      expect(result).toEqual({ validator: 'test-quality', passed: true })
    })

    it('accepts .test.js files', () => {
      const input: ToolInput = {
        tool_input: {
          file_path: 'src/foo.test.js',
          content: 'expect(result).toBe(42)',
        },
      }
      const result = validateTestQuality(input)
      expect(result).toEqual({ validator: 'test-quality', passed: true })
    })

    it('accepts .test.jsx files', () => {
      const input: ToolInput = {
        tool_input: {
          file_path: 'src/foo.test.jsx',
          content: 'expect(result).toBe(42)',
        },
      }
      const result = validateTestQuality(input)
      expect(result).toEqual({ validator: 'test-quality', passed: true })
    })
  })

  describe('content detection (uses new_string when content is absent)', () => {
    it('uses new_string as content for file edits', () => {
      const input: ToolInput = {
        tool_input: {
          file_path: 'src/foo.test.ts',
          old_string: 'old',
          new_string: 'expect(true).toBe(true)',
        },
      }
      const result = validateTestQuality(input)
      expect(result.passed).toBe(false)
      expect(result.message).toContain('Tautological assertions detected')
    })

    it('prefers content over new_string when both present', () => {
      // getContent checks content first, so a clean content with a bad new_string
      // should pass since content takes priority
      const input: ToolInput = {
        tool_input: {
          file_path: 'src/foo.test.ts',
          content: 'expect(result).toBe(42)',
          new_string: 'expect(true).toBe(true)',
        },
      }
      const result = validateTestQuality(input)
      expect(result.passed).toBe(true)
    })
  })

  describe('tautological assertions detection via validateTestQuality', () => {
    it('fails when tautological assertions found in test file', () => {
      const input: ToolInput = {
        tool_input: {
          file_path: 'src/foo.test.ts',
          content: 'expect(true).toBe(true)',
        },
      }
      const result = validateTestQuality(input)
      expect(result.passed).toBe(false)
      expect(result.message).toContain('Tautological assertions detected')
      expect(result.message).toContain('Line 1: expect(true).toBe(true)')
    })

    it('fails with multiple tautological assertions in message', () => {
      const input: ToolInput = {
        tool_input: {
          file_path: 'src/foo.test.ts',
          content: `
              expect(true).toBe(true)
              expect(false).toBe(false)
              expect(null).toBe(null)
            `,
        },
      }
      const result = validateTestQuality(input)
      expect(result.passed).toBe(false)
      expect(result.message).toContain('Tautological assertions detected')
      expect(result.message).toContain('Line 2: expect(true).toBe(true)')
      expect(result.message).toContain('Line 3: expect(false).toBe(false)')
      expect(result.message).toContain('Line 4: expect(null).toBe(null)')
    })

    it('truncates long tautological assertion lists (shows first 3 + ...and N more)', () => {
      const input: ToolInput = {
        tool_input: {
          file_path: 'src/foo.test.ts',
          content: `
              expect(true).toBe(true)
              expect(false).toBe(false)
              expect(null).toBe(null)
              expect(undefined).toBe(undefined)
              expect([]).toEqual([])
            `,
        },
      }
      const result = validateTestQuality(input)
      expect(result.passed).toBe(false)
      expect(result.message).toContain('...and 2 more')
    })
  })

  describe('mutation gaming detection via validateTestQuality', () => {
    it('fails when mutation gaming patterns found in file path', () => {
      const input: ToolInput = {
        tool_input: {
          file_path: 'src/mutation_kill.test.ts',
          content: 'expect(result).toBe(42)',
        },
      }
      const result = validateTestQuality(input)
      expect(result.passed).toBe(false)
      expect(result.message).toContain('Mutation gaming detected')
      expect(result.message).toContain('File name suggests mutation gaming')
    })

    it('fails when mutation gaming patterns found in content', () => {
      const input: ToolInput = {
        tool_input: {
          file_path: 'src/foo.test.ts',
          content: "describe('mutation-kill suite', () => {})",
        },
      }
      const result = validateTestQuality(input)
      expect(result.passed).toBe(false)
      expect(result.message).toContain('Mutation gaming detected')
    })

    it('mutation gaming check takes priority over tautological check', () => {
      const input: ToolInput = {
        tool_input: {
          file_path: 'src/kill-mutant.test.ts',
          content: 'expect(true).toBe(true)',
        },
      }
      const result = validateTestQuality(input)
      expect(result.passed).toBe(false)
      expect(result.message).toContain('Mutation gaming detected')
      expect(result.message).not.toContain('Tautological')
    })

    it('truncates long mutation gaming lists', () => {
      const input: ToolInput = {
        tool_input: {
          file_path: 'src/for_coverage.test.ts',
          content: `
              it('should kill the mutant', () => {})
              it('test for mutation score', () => {})
              it('test to increase mutation', () => {})
              it('test to increase coverage', () => {})
            `,
        },
      }
      const result = validateTestQuality(input)
      expect(result.passed).toBe(false)
      expect(result.message).toContain('...and 2 more')
    })
  })

  describe('clean test files pass', () => {
    it('passes for clean test file with valid assertions', () => {
      const input: ToolInput = {
        tool_input: {
          file_path: 'src/foo.test.ts',
          content: `
              import { describe, expect, it } from 'vitest'
              describe('foo', () => {
                it('adds two numbers', () => {
                  expect(1 + 1).toBe(2)
                })
                it('returns array', () => {
                  expect([1, 2]).toEqual([1, 2])
                })
              })
            `,
        },
      }
      const result = validateTestQuality(input)
      expect(result).toEqual({ validator: 'test-quality', passed: true })
    })

    it('passes for test file with no problematic patterns', () => {
      const input: ToolInput = {
        tool_input: {
          file_path: 'src/helpers.test.ts',
          content: 'expect(add(1, 2)).toBe(3)',
        },
      }
      const result = validateTestQuality(input)
      expect(result).toEqual({ validator: 'test-quality', passed: true })
    })

    it('passes for .test.jsx test file', () => {
      const input: ToolInput = {
        tool_input: {
          file_path: 'src/Component.test.jsx',
          content: 'expect(wrapper.exists()).toBe(true)',
        },
      }
      const result = validateTestQuality(input)
      expect(result).toEqual({ validator: 'test-quality', passed: true })
    })
  })

  describe('edge cases and boundary values', () => {
    it('handles filePath that is not a string', () => {
      const input = { tool_input: { file_path: 123, content: 'test' } } as unknown as ToolInput
      expect(() => validateTestQuality(input)).not.toThrow()
      const result = validateTestQuality(input)
      expect(result.passed).toBe(true)
    })

    it('handles content that is not a string', () => {
      const input = {
        tool_input: { file_path: 'src/test.test.ts', content: 456 },
      } as unknown as ToolInput
      // getContent returns undefined for non-string, so no content = passed
      const result = validateTestQuality(input)
      expect(result).toEqual({ validator: 'test-quality', passed: true })
    })

    it('handles deeply nested filePath with multiple dot segments', () => {
      const input: ToolInput = {
        tool_input: {
          file_path: 'src/a/b/c/d/e/f/g/h/MyComponent.test.tsx',
          content: 'expect(result).toBe(42)',
        },
      }
      const result = validateTestQuality(input)
      expect(result).toEqual({ validator: 'test-quality', passed: true })
    })

    it('handles path with .test inside directory name (not file extension)', () => {
      // .test.ts pattern is a regex at end, so filename must END with .test.ts
      const input: ToolInput = {
        tool_input: {
          file_path: 'src/test.something/foo.ts',
          content: 'expect(true).toBe(true)',
        },
      }
      const result = validateTestQuality(input)
      expect(result).toEqual({
        validator: 'test-quality',
        passed: true,
        skipped: true,
        skipReason: 'Not a test file',
      })
    })

    it('handles filePath that exists only as a number-like string', () => {
      const input: ToolInput = {
        tool_input: {
          file_path: '123.test.ts',
          content: 'expect(result).toBe(42)',
        },
      }
      const result = validateTestQuality(input)
      expect(result).toEqual({ validator: 'test-quality', passed: true })
    })
  })
})
