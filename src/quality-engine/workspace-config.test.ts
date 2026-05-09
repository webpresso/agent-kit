/**
 * Workspace Configuration Tests
 *
 * Tests for workspace path patterns and utilities.
 */

import { describe, expect, it } from 'vitest'

import {
  detectProjectRoot,
  extractPackagePath,
  getMatchedPathChecks,
  PACKAGE_PATTERNS,
  PATH_CHECKS,
  validateAllPathChecks,
  validatePathCheck,
  type PathCheck,
} from './workspace-config'

describe('PACKAGE_PATTERNS', () => {
  it('has the expected number of patterns', () => {
    expect(PACKAGE_PATTERNS.length).toBeGreaterThanOrEqual(6)
  })

  it('patterns are properly anchored with ^', () => {
    for (const pattern of PACKAGE_PATTERNS) {
      expect(pattern.source.startsWith('^')).toBe(true)
    }
  })
})

describe('extractPackagePath', () => {
  it('extracts package path from packages/ files', () => {
    expect(extractPackagePath('packages/sdk/config/src/index.ts')).toBe('packages/sdk/config')
  })

  it('extracts package path from apps/web/ files', () => {
    expect(extractPackagePath('apps/web/platform-web/app/routes/index.tsx')).toBe(
      'apps/web/platform-web',
    )
  })

  it('extracts package path from apps/workers/ files', () => {
    expect(extractPackagePath('apps/workers/chef/src/index.ts')).toBe('apps/workers/chef')
  })

  it('returns null for unknown paths', () => {
    expect(extractPackagePath('unknown/path/file.ts')).toBeNull()
    expect(extractPackagePath('src/index.ts')).toBeNull()
    expect(extractPackagePath('')).toBeNull()
  })

  it('normalizes paths with leading ./', () => {
    expect(extractPackagePath('./packages/sdk/config/src/index.ts')).toBe('packages/sdk/config')
  })
})

describe('detectProjectRoot', () => {
  it('detects platform-web project root', () => {
    expect(detectProjectRoot('apps/web/platform-web/app/routes/index.tsx')).toBe(
      'apps/web/platform-web',
    )
  })

  it('detects cli2 project root', () => {
    expect(detectProjectRoot('apps/cli2/src/commands/test.ts')).toBe('apps/cli2')
  })

  it('returns undefined for unknown paths', () => {
    expect(detectProjectRoot('unknown/path/file.ts')).toBe(undefined)
    expect(detectProjectRoot('src/index.ts')).toBe(undefined)
  })
})

describe('PATH_CHECKS', () => {
  it('has at least 4 checks defined', () => {
    expect(PATH_CHECKS.length).toBeGreaterThanOrEqual(4)
  })

  it('all checks have required fields', () => {
    for (const check of PATH_CHECKS) {
      expect(check.pattern).toBeInstanceOf(RegExp)
      expect(check.emoji.length).toBeGreaterThan(0)
      expect(check.name.length).toBeGreaterThan(0)
      expect(check.command.length).toBeGreaterThan(0)
    }
  })
})

describe('validatePathCheck', () => {
  it('returns undefined for valid check', () => {
    const validCheck: PathCheck = {
      pattern: /^test\//,
      emoji: '🧪',
      name: 'Test',
      command: 'just test',
    }
    expect(validatePathCheck(validCheck)).toBe(undefined)
  })

  it('returns error for missing pattern', () => {
    const check = {
      emoji: '🧪',
      name: 'Test',
      command: 'just test',
    } as PathCheck
    expect(validatePathCheck(check)).toBe('Missing pattern')
  })

  it('returns error for missing name', () => {
    const check = { pattern: /^test\//, emoji: '🧪', name: '', command: 'just test' } as PathCheck
    expect(validatePathCheck(check)).toBe('Missing name')
  })

  it('returns error for missing command', () => {
    const check = { pattern: /^test\//, emoji: '🧪', name: 'Test', command: '' } as PathCheck
    expect(validatePathCheck(check)).toBe('Missing command')
  })

  it('returns error for invalid health URL', () => {
    const check: PathCheck = {
      pattern: /^test\//,
      emoji: '🧪',
      name: 'Test',
      command: 'just test',
      healthUrl: 'not-a-valid-url',
    }
    expect(validatePathCheck(check)).toBe('Invalid health URL: not-a-valid-url')
  })

  it('returns undefined when healthUrl is valid http', () => {
    const check: PathCheck = {
      pattern: /^test\//,
      emoji: '🧪',
      name: 'Test',
      command: 'just test',
      healthUrl: 'http://localhost:3000',
    }
    expect(validatePathCheck(check)).toBe(undefined)
  })
})

describe('validating all path checks', () => {
  it('PATH_CHECKS all validate successfully', () => {
    expect(() => validateAllPathChecks()).not.toThrow()
  })
})

describe('getMatchedPathChecks', () => {
  it('returns empty array for no files', () => {
    expect(getMatchedPathChecks([])).toEqual([])
  })

  it('returns empty array for non-matching files', () => {
    expect(getMatchedPathChecks(['random/file.ts', 'another/file.ts'])).toEqual([])
  })

  it('returns matching checks for chef files', () => {
    const files = ['apps/workers/chef/src/index.ts']
    const matched = getMatchedPathChecks(files)
    expect(matched.length).toBe(1)
    expect(matched[0]!.name).toBe('Chef')
  })

  it('deduplicates checks', () => {
    const files = ['apps/workers/chef/src/index.ts', 'apps/workers/chef/src/other.ts']
    const matched = getMatchedPathChecks(files)
    expect(matched.length).toBe(1)
    expect(matched[0]!.name).toBe('Chef')
  })
})
