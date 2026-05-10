import { describe, expect, it } from 'vitest'

import { isValidRelativePath } from './validate-path'

describe('isValidRelativePath', () => {
  describe('valid relative paths', () => {
    it('accepts simple relative path', () => {
      expect(isValidRelativePath('src/index.ts')).toBe(true)
    })

    it('accepts nested relative path', () => {
      expect(isValidRelativePath('src/components/Button.tsx')).toBe(true)
    })

    it('accepts current directory reference', () => {
      expect(isValidRelativePath('.')).toBe(true)
    })

    it('accepts empty string', () => {
      expect(isValidRelativePath('')).toBe(true)
    })

    it('accepts filename only', () => {
      expect(isValidRelativePath('README.md')).toBe(true)
    })
  })

  describe('directory traversal', () => {
    it('rejects path starting with ..', () => {
      expect(isValidRelativePath('../etc/passwd')).toBe(false)
    })

    it('rejects path containing .. in the middle', () => {
      expect(isValidRelativePath('src/../../etc/passwd')).toBe(false)
    })

    it('rejects bare ..', () => {
      expect(isValidRelativePath('..')).toBe(false)
    })
  })

  describe('Unix absolute paths', () => {
    it('rejects absolute Unix path', () => {
      expect(isValidRelativePath('/absolute/path')).toBe(false)
    })

    it('rejects root slash', () => {
      expect(isValidRelativePath('/')).toBe(false)
    })
  })

  describe('Windows absolute paths', () => {
    it('rejects Windows drive path with backslash', () => {
      expect(isValidRelativePath('C:\\Windows\\System32')).toBe(false)
    })

    it('rejects Windows drive path with forward slash', () => {
      expect(isValidRelativePath('C:/Windows/System32')).toBe(false)
    })

    it('rejects lowercase drive letter', () => {
      expect(isValidRelativePath('d:\\data')).toBe(false)
    })
  })

  describe('Windows UNC paths', () => {
    it('rejects UNC path', () => {
      expect(isValidRelativePath('\\\\server\\share\\file.txt')).toBe(false)
    })
  })
})
