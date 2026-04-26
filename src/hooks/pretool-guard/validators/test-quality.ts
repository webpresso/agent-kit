import type { ToolInput, ValidationResult } from '#hooks/shared/types'

import { getContent, getFilePath } from '#hooks/shared/types'

export const MUTATION_GAMING_PATTERNS: Array<{ pattern: RegExp; description: string; fileLevel?: boolean }> = [
  { pattern: /mutation[_-]kill/i, description: 'File name suggests mutation gaming', fileLevel: true },
  { pattern: /kill[_-]mutant/i, description: 'File name suggests mutation gaming', fileLevel: true },
  { pattern: /for[_-]coverage/i, description: 'File name suggests coverage gaming', fileLevel: true },
  { pattern: /increase[_-]mutation/i, description: 'File name suggests mutation gaming', fileLevel: true },
  { pattern: /describe\s*\(\s*['"`].*mutation[_-]kill/i, description: 'Test suite name suggests mutation gaming' },
  { pattern: /describe\s*\(\s*['"`].*kill[_-]mutant/i, description: 'Test suite name suggests mutation gaming' },
  { pattern: /it\s*\(\s*['"`].*kill\s+(the\s+)?mutant/i, description: 'Test name suggests mutation gaming' },
  { pattern: /it\s*\(\s*['"`].*for\s+mutation\s+score/i, description: 'Test name suggests mutation gaming' },
  { pattern: /it\s*\(\s*['"`].*increase\s+(mutation|coverage)/i, description: 'Test name suggests coverage gaming' },
]

export const TAUTOLOGICAL_PATTERNS: Array<{ pattern: RegExp; description: string }> = [
  { pattern: /expect\s*\(\s*true\s*\)\s*\.toBe\s*\(\s*true\s*\)/, description: 'expect(true).toBe(true)' },
  { pattern: /expect\s*\(\s*false\s*\)\s*\.toBe\s*\(\s*false\s*\)/, description: 'expect(false).toBe(false)' },
  { pattern: /expect\s*\(\s*true\s*\)\s*\.toEqual\s*\(\s*true\s*\)/, description: 'expect(true).toEqual(true)' },
  { pattern: /expect\s*\(\s*false\s*\)\s*\.toEqual\s*\(\s*false\s*\)/, description: 'expect(false).toEqual(false)' },
  { pattern: /expect\s*\(\s*null\s*\)\s*\.toBe\s*\(\s*null\s*\)/, description: 'expect(null).toBe(null)' },
  { pattern: /expect\s*\(\s*undefined\s*\)\s*\.toBe\s*\(\s*undefined\s*\)/, description: 'expect(undefined).toBe(undefined)' },
  { pattern: /expect\s*\(\s*null\s*\)\s*\.toEqual\s*\(\s*null\s*\)/, description: 'expect(null).toEqual(null)' },
  { pattern: /expect\s*\(\s*undefined\s*\)\s*\.toEqual\s*\(\s*undefined\s*\)/, description: 'expect(undefined).toEqual(undefined)' },
  { pattern: /expect\s*\(\s*\[\s*\]\s*\)\s*\.toEqual\s*\(\s*\[\s*\]\s*\)/, description: 'expect([]).toEqual([])' },
  { pattern: /expect\s*\(\s*\{\s*\}\s*\)\s*\.toEqual\s*\(\s*\{\s*\}\s*\)/, description: 'expect({}).toEqual({})' },
  { pattern: /expect\s*\(\s*true\s*\)\s*\.toBeTruthy\s*\(\s*\)/, description: 'expect(true).toBeTruthy()' },
  { pattern: /expect\s*\(\s*false\s*\)\s*\.toBeFalsy\s*\(\s*\)/, description: 'expect(false).toBeFalsy()' },
  { pattern: /expect\s*\(\s*1\s*\)\s*\.toBeTruthy\s*\(\s*\)/, description: 'expect(1).toBeTruthy()' },
  { pattern: /expect\s*\(\s*0\s*\)\s*\.toBeFalsy\s*\(\s*\)/, description: 'expect(0).toBeFalsy()' },
  { pattern: /expect\s*\(\s*["'][^"']+["']\s*\)\s*\.toBeTruthy\s*\(\s*\)/, description: 'expect("string").toBeTruthy()' },
  { pattern: /expect\s*\(\s*["']["']\s*\)\s*\.toBeFalsy\s*\(\s*\)/, description: 'expect("").toBeFalsy()' },
  { pattern: /expect\s*\(\s*true\s*\)\s*\.toBeDefined\s*\(\s*\)/, description: 'expect(true).toBeDefined()' },
  { pattern: /expect\s*\(\s*false\s*\)\s*\.toBeDefined\s*\(\s*\)/, description: 'expect(false).toBeDefined()' },
  { pattern: /expect\s*\(\s*\d+\s*\)\s*\.toBeDefined\s*\(\s*\)/, description: 'expect(number).toBeDefined()' },
  { pattern: /expect\s*\(\s*["'][^"']*["']\s*\)\s*\.toBeDefined\s*\(\s*\)/, description: 'expect("string").toBeDefined()' },
  { pattern: /expect\s*\(\s*true\s*\)\s*\.toBeInstanceOf\s*\(\s*Object\s*\)/, description: 'expect(true).toBeInstanceOf(Object)' },
  { pattern: /expect\s*\(\s*false\s*\)\s*\.toBeInstanceOf\s*\(\s*Object\s*\)/, description: 'expect(false).toBeInstanceOf(Object)' },
  { pattern: /expect\s*\(\s*\d+\s*\)\s*\.toBeInstanceOf\s*\(\s*Object\s*\)/, description: 'expect(number).toBeInstanceOf(Object)' },
  { pattern: /expect\s*\(\s*["'][^"']*["']\s*\)\s*\.toBeInstanceOf\s*\(\s*Object\s*\)/, description: 'expect("string").toBeInstanceOf(Object)' },
]

export function findTautologicalAssertions(content: string): Array<{ line: number; pattern: string; match: string }> {
  const lines = content.split('\n')
  const matches: Array<{ line: number; pattern: string; match: string }> = []
  for (let i = 0; i < lines.length; i++) {
    const line = lines[i]
    if (!line) continue
    for (const { pattern, description } of TAUTOLOGICAL_PATTERNS) {
      const match = line.match(pattern)
      if (match) matches.push({ line: i + 1, pattern: description, match: match[0] })
    }
  }
  return matches
}

export function findMutationGamingPatterns(content: string, filePath?: string): Array<{ line: number; pattern: string; match: string }> {
  const matches: Array<{ line: number; pattern: string; match: string }> = []
  if (filePath) {
    for (const { pattern, description, fileLevel } of MUTATION_GAMING_PATTERNS) {
      if (!fileLevel) continue
      const match = filePath.match(pattern)
      if (match) matches.push({ line: 0, pattern: description, match: match[0] })
    }
  }
  const lines = content.split('\n')
  for (let i = 0; i < lines.length; i++) {
    const line = lines[i]
    if (!line) continue
    for (const { pattern, description, fileLevel } of MUTATION_GAMING_PATTERNS) {
      if (fileLevel) continue
      const match = line.match(pattern)
      if (match) matches.push({ line: i + 1, pattern: description, match: match[0] })
    }
  }
  return matches
}

export function validateTestQuality(input: ToolInput): ValidationResult {
  const filePath = getFilePath(input)
  const content = getContent(input)

  if (!content || !filePath) return { validator: 'test-quality', passed: true }
  if (!/\.test\.(ts|tsx|js|jsx)$/.test(filePath)) {
    return { validator: 'test-quality', passed: true, skipped: true, skipReason: 'Not a test file' }
  }
  if (filePath.includes('test-quality.test.ts')) {
    return { validator: 'test-quality', passed: true, skipped: true, skipReason: 'Validator self-test' }
  }

  const gamingMatches = findMutationGamingPatterns(content, filePath)
  if (gamingMatches.length > 0) {
    const examples = gamingMatches.slice(0, 3).map((m) => (m.line === 0 ? `  File path: ${m.pattern}` : `  Line ${m.line}: ${m.pattern}`))
    return {
      validator: 'test-quality',
      passed: false,
      message: `Mutation gaming detected:\n${examples.join('\n')}${gamingMatches.length > 3 ? `\n  ...and ${gamingMatches.length - 3} more` : ''}`,
    }
  }

  const matches = findTautologicalAssertions(content)
  if (matches.length > 0) {
    const examples = matches.slice(0, 3).map((m) => `  Line ${m.line}: ${m.pattern}`)
    return {
      validator: 'test-quality',
      passed: false,
      message: `Tautological assertions detected:\n${examples.join('\n')}${matches.length > 3 ? `\n  ...and ${matches.length - 3} more` : ''}`,
    }
  }

  return { validator: 'test-quality', passed: true }
}
