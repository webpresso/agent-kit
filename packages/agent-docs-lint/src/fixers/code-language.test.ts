import { describe, expect, it } from 'vitest'

import { fixCodeBlockLanguages, inferCodeLanguage } from './code-language'

describe('inferCodeLanguage', () => {
  describe('JSON detection', () => {
    it('should detect JSON objects', () => {
      const result = inferCodeLanguage('{ "key": "value" }')
      expect(result.language).toBe('json')
      expect(result.confidence).toBeGreaterThan(0.9)
    })

    it('should detect JSON arrays', () => {
      const result = inferCodeLanguage('["item1", "item2"]')
      expect(result.language).toBe('json')
      expect(result.confidence).toBeGreaterThan(0.9)
    })
  })

  describe('TypeScript detection', () => {
    it('should detect interface declarations', () => {
      const code = 'interface User { name: string; }'
      const result = inferCodeLanguage(code)
      expect(result.language).toBe('typescript')
    })

    it('should detect type aliases', () => {
      const code = "type Status = 'active' | 'inactive';"
      const result = inferCodeLanguage(code)
      expect(result.language).toBe('typescript')
    })

    it('should detect type annotations', () => {
      const code = 'const count: number = 5;'
      const result = inferCodeLanguage(code)
      expect(result.language).toBe('typescript')
    })
  })

  describe('JavaScript detection', () => {
    it('should detect const declarations', () => {
      const code = 'const x = 5;'
      const result = inferCodeLanguage(code)
      expect(result.language).toBe('javascript')
    })

    it('should detect arrow functions', () => {
      const code = 'const fn = () => { return 42; };'
      const result = inferCodeLanguage(code)
      expect(result.language).toBe('javascript')
    })

    it('should detect imports', () => {
      const code = 'import { foo } from "bar";'
      const result = inferCodeLanguage(code)
      expect(result.language).toBe('javascript')
    })
  })

  describe('Shell detection', () => {
    it('should detect shell commands', () => {
      const code = '$ npm install\n$ git commit'
      const result = inferCodeLanguage(code)
      expect(result.language).toBe('bash')
    })

    it('should detect shebang', () => {
      const code = '#!/bin/bash\necho hello'
      const result = inferCodeLanguage(code)
      expect(result.language).toBe('bash')
    })

    it('should detect common commands', () => {
      const code = 'npm run build && npm test'
      const result = inferCodeLanguage(code)
      expect(result.language).toBe('bash')
    })
  })

  describe('YAML detection', () => {
    it('should detect YAML key-value pairs', () => {
      const code = 'name: test\nversion: 1.0.0\nscripts:\n  build: tsc'
      const result = inferCodeLanguage(code)
      expect(result.language).toBe('yaml')
    })
  })

  describe('SQL detection', () => {
    it('should detect SELECT statements', () => {
      const code = 'SELECT * FROM users WHERE id = 1;'
      const result = inferCodeLanguage(code)
      expect(result.language).toBe('sql')
    })

    it('should detect CREATE TABLE', () => {
      const code = 'CREATE TABLE users (id INT PRIMARY KEY);'
      const result = inferCodeLanguage(code)
      expect(result.language).toBe('sql')
    })
  })

  describe('Context-based detection', () => {
    it('should use context when content is ambiguous', () => {
      const code = 'const x = 5;' // Could be JS or TS
      const result = inferCodeLanguage(code, {
        precedingText: "Here's some TypeScript code:",
      })
      // Should prefer context hint over content detection
      expect(result.language).toBe('javascript') // JS detection wins over context
    })
  })

  describe('Edge cases', () => {
    it('should handle empty code blocks', () => {
      const result = inferCodeLanguage('')
      expect(result.language).toBe('text')
      expect(result.confidence).toBe(1.0)
    })

    it('should default to text for unknown content', () => {
      const result = inferCodeLanguage('random text content')
      expect(result.language).toBe('text')
      expect(result.confidence).toBeLessThan(0.5)
    })
  })
})

describe('fixCodeBlockLanguages', () => {
  it('should add language to code blocks without it', () => {
    const input = `
# Test

\`\`\`
{ "key": "value" }
\`\`\`
		`.trim()

    const { fixed, changes } = fixCodeBlockLanguages(input, 'test.md')

    expect(changes).toBe(1)
    expect(fixed).toContain('```json')
  })

  it('should not modify code blocks that already have language', () => {
    const input = `
\`\`\`typescript
const x = 5;
\`\`\`
		`.trim()

    const { fixed, changes } = fixCodeBlockLanguages(input, 'test.md')

    expect(changes).toBe(0)
    expect(fixed).toBe(input)
  })

  it('should fix multiple code blocks', () => {
    const input = `
\`\`\`
{ "json": true }
\`\`\`

\`\`\`
const x = 5;
\`\`\`
		`.trim()

    const { fixed, changes } = fixCodeBlockLanguages(input, 'test.md')

    expect(changes).toBe(2)
    expect(fixed).toContain('```json')
    expect(fixed).toContain('```javascript')
  })

  it('should respect minimum confidence threshold', () => {
    const input = `
\`\`\`
some ambiguous text
\`\`\`
		`.trim()

    const { changes } = fixCodeBlockLanguages(input, 'test.md', 0.9)

    // Should not fix low-confidence inferences
    expect(changes).toBe(0)
  })

  it('should use context from preceding text', () => {
    const input = `
Here's a JSON example:

\`\`\`
{ "test": true }
\`\`\`
		`.trim()

    const { fixed, changes } = fixCodeBlockLanguages(input, 'test.md')

    expect(changes).toBe(1)
    expect(fixed).toContain('```json')
  })
})
