import { describe, expect, it } from 'vitest'

import { validateDeprecatedCommands } from './deprecated-commands'

describe('validateDeprecatedCommands', () => {
  describe('just lint-file (deprecated)', () => {
    it('flags just lint-file in bash block', () => {
      const content = `# Doc\n\n\`\`\`bash\njust lint-file src/index.ts\n\`\`\``
      const errors = validateDeprecatedCommands('test.md', content)
      expect(errors).toHaveLength(1)
      expect(errors[0]?.ruleId).toBe('deprecated-commands')
      expect(errors[0]?.message).toContain('just lint-file')
      expect(errors[0]?.message).toContain('just lint --file')
      expect(errors[0]?.severity).toBe('warning')
    })

    it('flags just lint-file in sh block', () => {
      const content = `# Doc\n\n\`\`\`sh\njust lint-file src/a.ts\n\`\`\``
      const errors = validateDeprecatedCommands('test.md', content)
      expect(errors).toHaveLength(1)
    })

    it('flags just lint-file in unlabeled block', () => {
      const content = `# Doc\n\n\`\`\`\njust lint-file src/a.ts\n\`\`\``
      const errors = validateDeprecatedCommands('test.md', content)
      expect(errors).toHaveLength(1)
    })
  })

  describe('just test file (deprecated positional)', () => {
    it('flags just test file in bash block', () => {
      const content = `# Doc\n\n\`\`\`bash\njust test file src/c.test.ts\n\`\`\``
      const errors = validateDeprecatedCommands('test.md', content)
      // Matches both 'just test file' pattern AND 'just test <positional>' pattern
      expect(errors.length).toBeGreaterThanOrEqual(1)
      const hasTestFileError = errors.some(
        (e) => e.message.includes('just test file') || e.message.includes('positional'),
      )
      expect(hasTestFileError).toBe(true)
    })
  })

  describe('just typecheck with positional (deprecated)', () => {
    it('flags just typecheck <name> without flag', () => {
      const content = `# Doc\n\n\`\`\`bash\njust typecheck cli2\n\`\`\``
      const errors = validateDeprecatedCommands('test.md', content)
      expect(errors).toHaveLength(1)
      expect(errors[0]?.message).toContain('positional argument')
      expect(errors[0]?.message).toContain('just typecheck --package')
    })

    it('does NOT flag just typecheck --package <name>', () => {
      const content = `# Doc\n\n\`\`\`bash\njust typecheck --package cli2\n\`\`\``
      const errors = validateDeprecatedCommands('test.md', content)
      expect(errors).toHaveLength(0)
    })

    it('does NOT flag just typecheck --file <path>', () => {
      const content = `# Doc\n\n\`\`\`bash\njust typecheck --file src/index.ts\n\`\`\``
      const errors = validateDeprecatedCommands('test.md', content)
      expect(errors).toHaveLength(0)
    })

    it('does NOT flag bare just typecheck (no args)', () => {
      const content = `# Doc\n\n\`\`\`bash\njust typecheck\n\`\`\``
      const errors = validateDeprecatedCommands('test.md', content)
      expect(errors).toHaveLength(0)
    })
  })

  describe('just lint with positional (deprecated)', () => {
    it('flags just lint <name> without flag', () => {
      const content = `# Doc\n\n\`\`\`bash\njust lint cli2\n\`\`\``
      const errors = validateDeprecatedCommands('test.md', content)
      expect(errors).toHaveLength(1)
      expect(errors[0]?.message).toContain('just lint --package')
    })

    it('does NOT flag just lint --file <path>', () => {
      const content = `# Doc\n\n\`\`\`bash\njust lint --file src/index.ts\n\`\`\``
      const errors = validateDeprecatedCommands('test.md', content)
      expect(errors).toHaveLength(0)
    })

    it('does NOT flag just lint --fix', () => {
      const content = `# Doc\n\n\`\`\`bash\njust lint --fix\n\`\`\``
      const errors = validateDeprecatedCommands('test.md', content)
      expect(errors).toHaveLength(0)
    })
  })

  describe('just test with positional (deprecated)', () => {
    it('flags just test <name> without flag', () => {
      const content = `# Doc\n\n\`\`\`bash\njust test cli2\n\`\`\``
      const errors = validateDeprecatedCommands('test.md', content)
      expect(errors).toHaveLength(1)
      expect(errors[0]?.message).toContain('just test --package')
    })

    it('does NOT flag just test --package <name>', () => {
      const content = `# Doc\n\n\`\`\`bash\njust test --package cli2\n\`\`\``
      const errors = validateDeprecatedCommands('test.md', content)
      expect(errors).toHaveLength(0)
    })

    it('does NOT flag bare just test (no args)', () => {
      const content = `# Doc\n\n\`\`\`bash\njust test\n\`\`\``
      const errors = validateDeprecatedCommands('test.md', content)
      expect(errors).toHaveLength(0)
    })
  })

  describe('pnpm vitest (deprecated direct invocation)', () => {
    it('flags pnpm vitest in bash block', () => {
      const content = `# Doc\n\n\`\`\`bash\npnpm vitest src/b.test.ts\n\`\`\``
      const errors = validateDeprecatedCommands('test.md', content)
      expect(errors).toHaveLength(1)
      expect(errors[0]?.message).toContain('pnpm vitest')
      expect(errors[0]?.message).toContain('just test')
    })

    it('flags pnpm vitest in sh block', () => {
      const content = `# Doc\n\n\`\`\`sh\npnpm vitest\n\`\`\``
      const errors = validateDeprecatedCommands('test.md', content)
      expect(errors).toHaveLength(1)
    })
  })

  describe('non-bash code blocks are ignored', () => {
    it('does NOT flag deprecated commands in typescript blocks', () => {
      const content = `# Doc\n\n\`\`\`typescript\nconst cmd = 'just lint-file src/index.ts'\n\`\`\``
      const errors = validateDeprecatedCommands('test.md', content)
      expect(errors).toHaveLength(0)
    })

    it('does NOT flag deprecated commands in json blocks', () => {
      const content = `# Doc\n\n\`\`\`json\n{"test": "just typecheck cli2"}\n\`\`\``
      const errors = validateDeprecatedCommands('test.md', content)
      expect(errors).toHaveLength(0)
    })

    it('does NOT flag deprecated commands in yaml blocks', () => {
      const content = `# Doc\n\n\`\`\`yaml\ncommands:\n  - pnpm vitest\n\`\`\``
      const errors = validateDeprecatedCommands('test.md', content)
      expect(errors).toHaveLength(0)
    })
  })

  describe('inline code is ignored', () => {
    it('does NOT flag deprecated commands in inline code', () => {
      const content = `# Doc\n\nThe old command \`just lint-file src/index.ts\` is deprecated.\n`
      const errors = validateDeprecatedCommands('test.md', content)
      expect(errors).toHaveLength(0)
    })
  })

  describe('multiple violations in one block', () => {
    it('reports each deprecated pattern once per block', () => {
      const content = `# Doc\n\n\`\`\`bash\njust lint-file src/a.ts\npnpm vitest src/b.test.ts\njust typecheck cli2\n\`\`\``
      const errors = validateDeprecatedCommands('test.md', content)
      expect(errors.length).toBeGreaterThanOrEqual(3)
    })
  })

  describe('valid commands pass', () => {
    it('passes just lint --file', () => {
      const content = `# Doc\n\n\`\`\`bash\njust lint --file src/index.ts\n\`\`\``
      expect(validateDeprecatedCommands('test.md', content)).toHaveLength(0)
    })

    it('passes just test --package', () => {
      const content = `# Doc\n\n\`\`\`bash\njust test --package cli2\n\`\`\``
      expect(validateDeprecatedCommands('test.md', content)).toHaveLength(0)
    })

    it('passes just typecheck --package', () => {
      const content = `# Doc\n\n\`\`\`bash\njust typecheck --package schema-engine\n\`\`\``
      expect(validateDeprecatedCommands('test.md', content)).toHaveLength(0)
    })

    it('passes empty content', () => {
      expect(validateDeprecatedCommands('test.md', '')).toHaveLength(0)
    })
  })
})
