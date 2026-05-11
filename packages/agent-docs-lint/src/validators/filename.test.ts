import { describe, expect, it } from 'vitest'

import { validateFilename } from './filename'

describe('validateFilename', () => {
  describe('valid filenames', () => {
    it('accepts lowercase kebab-case', () => {
      expect(validateFilename('docs/guides/my-guide.md')).toEqual([])
    })

    it('accepts single word lowercase', () => {
      expect(validateFilename('docs/readme.md')).toEqual([])
    })

    it('accepts numbers in filename', () => {
      expect(validateFilename('docs/guide-v2.md')).toEqual([])
    })

    it('accepts _overview.md special file', () => {
      expect(validateFilename('webpresso/blueprints/_overview.md')).toEqual([])
    })

    it('accepts date-prefixed files', () => {
      expect(validateFilename('docs/research/quality-audits/2026-01-07-audit.md')).toEqual([])
    })
  })

  describe('files outside docs/', () => {
    it('skips agent-guide.md', () => {
      expect(validateFilename('.agent/rules/agent-guide.md')).toEqual([])
    })

    it('skips root-level README.md', () => {
      expect(validateFilename('README.md')).toEqual([])
    })

    it('skips .claude directory files', () => {
      expect(validateFilename('.claude/commands/MY-COMMAND.md')).toEqual([])
    })
  })

  describe('invalid filenames in docs/', () => {
    it('rejects UPPERCASE filenames', () => {
      const errors = validateFilename('docs/guides/MY-GUIDE.md')
      expect(errors).toHaveLength(1)
      expect(errors[0].ruleId).toBe('filename-kebab-case')
      expect(errors[0].message).toContain('uppercase')
      expect(errors[0].message).toContain('Rename to: my-guide.md')
    })

    it('rejects underscores', () => {
      const errors = validateFilename('docs/guides/my_guide.md')
      expect(errors).toHaveLength(1)
      expect(errors[0].message).toContain('underscores')
      expect(errors[0].message).toContain('Rename to: my-guide.md')
    })

    it('rejects mixed violations', () => {
      const errors = validateFilename('docs/guides/MY_GUIDE.md')
      expect(errors).toHaveLength(1)
      expect(errors[0].message).toContain('uppercase')
      expect(errors[0].message).toContain('underscores')
    })
  })
})
