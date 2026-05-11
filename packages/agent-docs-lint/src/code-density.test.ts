import { describe, expect, it } from 'vitest'

import { detectCodeBlocks } from './validators/code-density'

describe('Code Density Validation', () => {
  describe('detectCodeBlocks', () => {
    it('should count fenced code blocks', () => {
      // Arrange
      const content = `
# Command

Some text here.

\`\`\`typescript
const foo = "bar";
\`\`\`

More text.

\`\`\`bash
echo "hello"
\`\`\`
`

      // Act
      const result = detectCodeBlocks(content)

      // Assert
      expect(result.count).toBe(2)
      expect(result.codeLines).toBeGreaterThan(0)
    })
  })
})
