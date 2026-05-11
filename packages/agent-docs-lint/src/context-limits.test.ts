import { describe, expect, it } from 'vitest'

import {
  CONTEXT_FILE_LIMITS,
  countLines,
  estimateTokens,
  getLimitsForFile,
  summarizeContextUsage,
  validateContextLimits,
} from './validators/context-limits'

describe('estimateTokens', () => {
  it('should estimate tokens using 4 chars per token', () => {
    // Arrange
    const content = '1234' // 4 chars = 1 token

    // Act
    const result = estimateTokens(content)

    // Assert
    expect(result).toBe(1)
  })

  it('should round up fractional tokens', () => {
    // Arrange
    const content = '12345' // 5 chars = 1.25 tokens → 2

    // Act
    const result = estimateTokens(content)

    // Assert
    expect(result).toBe(2)
  })

  it('should handle empty content', () => {
    // Arrange
    const content = ''

    // Act
    const result = estimateTokens(content)

    // Assert
    expect(result).toBe(0)
  })

  it('should handle large content', () => {
    // Arrange
    const content = 'a'.repeat(10000) // 10k chars = 2500 tokens

    // Act
    const result = estimateTokens(content)

    // Assert
    expect(result).toBe(2500)
  })
})

describe('countLines', () => {
  it('should count single line', () => {
    // Arrange
    const content = 'single line'

    // Act
    const result = countLines(content)

    // Assert
    expect(result).toBe(1)
  })

  it('should count multiple lines', () => {
    // Arrange
    const content = 'line 1\nline 2\nline 3'

    // Act
    const result = countLines(content)

    // Assert
    expect(result).toBe(3)
  })

  it('should handle empty content', () => {
    // Arrange
    const content = ''

    // Act
    const result = countLines(content)

    // Assert
    expect(result).toBe(1) // split("") returns [""]
  })

  it('should count trailing newlines', () => {
    // Arrange
    const content = 'line 1\nline 2\n'

    // Act
    const result = countLines(content)

    // Assert
    expect(result).toBe(3) // split includes empty string after final \n
  })
})

describe('getLimitsForFile', () => {
  it('should return limits for CLAUDE.md', () => {
    // Arrange
    const filePath = 'CLAUDE.md'

    // Act
    const result = getLimitsForFile(filePath)

    // Assert
    expect(result).toEqual(CONTEXT_FILE_LIMITS['CLAUDE.md'])
    expect(result?.maxLines).toBe(60)
  })

  it('should return limits for agent-guide.md', () => {
    // Arrange
    const filePath = '.agent/rules/agent-guide.md'

    // Act
    const result = getLimitsForFile(filePath)

    // Assert
    expect(result).toEqual(CONTEXT_FILE_LIMITS['agent-guide.md'])
    expect(result?.maxLines).toBe(500)
  })

  it('should return limits for skill files', () => {
    // Arrange
    const filePath = '.claude/skills/my-skill/SKILL.md'

    // Act
    const result = getLimitsForFile(filePath)

    // Assert
    expect(result).toEqual(CONTEXT_FILE_LIMITS['SKILL.md'])
    expect(result?.maxLines).toBe(150)
  })

  it('should return limits for agent files', () => {
    // Arrange
    const filePath = '.claude/agents/code-reviewer.md'

    // Act
    const result = getLimitsForFile(filePath)

    // Assert
    expect(result).toEqual(CONTEXT_FILE_LIMITS['agent.md'])
    expect(result?.maxLines).toBe(100)
  })

  it('should return limits for command files', () => {
    // Arrange
    const filePath = '.claude/commands/validate.md'

    // Act
    const result = getLimitsForFile(filePath)

    // Assert
    expect(result).toEqual(CONTEXT_FILE_LIMITS['command.md'])
    expect(result?.maxLines).toBe(200)
  })

  it('should handle Windows path separators', () => {
    // Arrange
    const filePath = '.claude\\skills\\my-skill\\SKILL.md'

    // Act
    const result = getLimitsForFile(filePath)

    // Assert
    expect(result).toEqual(CONTEXT_FILE_LIMITS['SKILL.md'])
  })

  it('should return undefined for non-context files', () => {
    // Arrange
    const filePath = 'README.md'

    // Act
    const result = getLimitsForFile(filePath)

    // Assert
    expect(result).toBe(undefined)
  })

  it('should return undefined for random markdown files', () => {
    // Arrange
    const filePath = 'docs/guide.md'

    // Act
    const result = getLimitsForFile(filePath)

    // Assert
    expect(result).toBe(undefined)
  })

  it('should prioritize exact filename match over pattern', () => {
    // Arrange
    const filePath = 'some/path/CLAUDE.md'

    // Act
    const result = getLimitsForFile(filePath)

    // Assert
    expect(result).toEqual(CONTEXT_FILE_LIMITS['CLAUDE.md'])
  })

  it('should handle boundary values for exact limits', () => {
    // Arrange
    const filePath = 'CLAUDE.md'
    // CLAUDE.md max is 60 lines, warn is 30
    const underWarn = Array.from({ length: 29 }, () => 'line').join('\n') // 29 lines (< 30 warn)
    const atWarn = Array.from({ length: 31 }, () => 'line').join('\n') // 31 lines (> 30 warn, < 60 max)
    const overMax = Array.from({ length: 61 }, () => 'line').join('\n') // 61 lines (> 60 max)

    // Act
    const underWarnErrors = validateContextLimits(filePath, underWarn)
    const atWarnErrors = validateContextLimits(filePath, atWarn)
    const overMaxErrors = validateContextLimits(filePath, overMax)

    // Assert
    expect(underWarnErrors).toHaveLength(0) // Under warning threshold
    expect(atWarnErrors).toHaveLength(1) // At warning threshold
    expect(atWarnErrors[0].severity).toBe('warning')
    expect(atWarnErrors[0].ruleId).toBe('context-warn-lines')
    expect(overMaxErrors.length).toBeGreaterThan(0) // Over max
    expect(
      overMaxErrors.some((e) => e.ruleId === 'context-max-lines' && e.severity === 'error'),
    ).toBe(true)
  })
})

describe('validateContextLimits', () => {
  describe('line count validation', () => {
    it('should error when exceeding max lines', () => {
      // Arrange
      const filePath = 'CLAUDE.md'
      const content = 'line\n'.repeat(70) // 70 repetitions = 71 lines (split includes final empty)

      // Act
      const errors = validateContextLimits(filePath, content)

      // Assert
      expect(errors).toHaveLength(1)
      expect(errors[0].severity).toBe('error')
      expect(errors[0].ruleId).toBe('context-max-lines')
      expect(errors[0].message).toContain('60 line limit')
      expect(errors[0].message).toContain('71 lines')
    })

    it('should warn when approaching max lines', () => {
      // Arrange
      const filePath = 'CLAUDE.md'
      const content = 'line\n'.repeat(40) // 40 lines > 30 warn, < 60 max

      // Act
      const errors = validateContextLimits(filePath, content)

      // Assert
      expect(errors).toHaveLength(1)
      expect(errors[0].severity).toBe('warning')
      expect(errors[0].ruleId).toBe('context-warn-lines')
      expect(errors[0].message).toContain('approaching limit')
    })

    it('should pass when under warning threshold', () => {
      // Arrange
      const filePath = 'CLAUDE.md'
      const content = 'line\n'.repeat(20) // 20 lines < 30 warn

      // Act
      const errors = validateContextLimits(filePath, content)

      // Assert
      expect(errors).toHaveLength(0)
    })
  })

  describe('token count validation', () => {
    it('should error when exceeding max tokens', () => {
      // Arrange
      const filePath = 'CLAUDE.md'
      const content = 'a'.repeat(9000) // ~2250 tokens > 2000 max

      // Act
      const errors = validateContextLimits(filePath, content)

      // Assert
      const tokenErrors = errors.filter((e) => e.ruleId === 'context-max-tokens')
      expect(tokenErrors).toHaveLength(1)
      expect(tokenErrors[0].severity).toBe('error')
      expect(tokenErrors[0].message).toContain('2000 token limit')
    })

    it('should warn when approaching max tokens', () => {
      // Arrange
      const filePath = 'CLAUDE.md'
      const content = 'a'.repeat(4500) // ~1125 tokens > 1000 warn, < 2000 max

      // Act
      const errors = validateContextLimits(filePath, content)

      // Assert
      const tokenWarnings = errors.filter((e) => e.ruleId === 'context-warn-tokens')
      expect(tokenWarnings).toHaveLength(1)
      expect(tokenWarnings[0].severity).toBe('warning')
      expect(tokenWarnings[0].message).toContain('approaching token limit')
    })
  })

  describe('combined validation', () => {
    it('should return multiple errors for both line and token violations', () => {
      // Arrange
      const filePath = 'CLAUDE.md'
      // Need >60 lines AND >2000 tokens (>8000 chars)
      // 70 lines of 150 chars each = ~10,500 chars = ~2625 tokens
      const content = `${'x'.repeat(150)}\n`.repeat(70)

      // Act
      const errors = validateContextLimits(filePath, content)

      // Assert
      expect(errors.length).toBeGreaterThanOrEqual(2)
      expect(errors.some((e) => e.ruleId === 'context-max-lines')).toBe(true)
      expect(errors.some((e) => e.ruleId === 'context-max-tokens')).toBe(true)
    })
  })

  describe('non-context files', () => {
    it('should return empty array for non-context files', () => {
      // Arrange
      const filePath = 'README.md'
      const content = 'line\n'.repeat(1000)

      // Act
      const errors = validateContextLimits(filePath, content)

      // Assert
      expect(errors).toHaveLength(0)
    })
  })

  describe('different file types', () => {
    it('should validate agent-guide.md with different limits', () => {
      // Arrange
      const filePath = '.agent/rules/agent-guide.md'
      const content = 'line\n'.repeat(550) // 550 > 500 max

      // Act
      const errors = validateContextLimits(filePath, content)

      // Assert
      expect(errors).toHaveLength(1)
      expect(errors[0].severity).toBe('error')
      expect(errors[0].message).toContain('500 line limit')
    })

    it('should validate skill files', () => {
      // Arrange
      const filePath = '.claude/skills/test/SKILL.md'
      const content = 'line\n'.repeat(160) // 160 > 150 max

      // Act
      const errors = validateContextLimits(filePath, content)

      // Assert
      expect(errors).toHaveLength(1)
      expect(errors[0].severity).toBe('error')
      expect(errors[0].message).toContain('150 line limit')
    })

    it('should validate agent files', () => {
      // Arrange
      const filePath = '.claude/agents/reviewer.md'
      const content = 'line\n'.repeat(110) // 110 > 100 max

      // Act
      const errors = validateContextLimits(filePath, content)

      // Assert
      expect(errors).toHaveLength(1)
      expect(errors[0].severity).toBe('error')
      expect(errors[0].message).toContain('100 line limit')
    })

    it('should validate command files', () => {
      // Arrange
      const filePath = '.claude/commands/audit.md'
      const content = 'line\n'.repeat(210) // 210 > 200 max

      // Act
      const errors = validateContextLimits(filePath, content)

      // Assert
      expect(errors).toHaveLength(1)
      expect(errors[0].severity).toBe('error')
      expect(errors[0].message).toContain('200 line limit')
    })
  })
})

describe('summarizeContextUsage', () => {
  it('should summarize single file', () => {
    // Arrange
    const files = [
      {
        path: 'CLAUDE.md',
        content: 'line\n'.repeat(30), // 30 lines, ~120 chars, ~30 tokens
      },
    ]

    // Act
    const result = summarizeContextUsage(files)

    // Assert
    expect(result.files).toHaveLength(1)
    expect(result.files[0].path).toBe('CLAUDE.md')
    expect(result.files[0].lines).toBe(31) // 30 * "line\n" = 31 splits
    expect(result.files[0].tokens).toBe(38) // 150 chars / 4 = 37.5 → 38
    expect(result.files[0].limits).toEqual(CONTEXT_FILE_LIMITS['CLAUDE.md'])
    expect(result.totalLines).toBe(31)
    expect(result.totalTokens).toBe(38)
  })

  it('should summarize multiple files', () => {
    // Arrange
    const files = [
      { path: 'CLAUDE.md', content: 'a'.repeat(100) },
      { path: '.agent/rules/agent-guide.md', content: 'b'.repeat(200) },
      { path: 'README.md', content: 'c'.repeat(300) },
    ]

    // Act
    const result = summarizeContextUsage(files)

    // Assert
    expect(result.files).toHaveLength(3)
    expect(result.totalLines).toBe(3) // All single-line
    expect(result.totalTokens).toBe(150) // (100 + 200 + 300) / 4 = 150
  })

  it('should include limits only for context files', () => {
    // Arrange
    const files = [
      { path: 'CLAUDE.md', content: 'test' },
      { path: 'README.md', content: 'test' },
    ]

    // Act
    const result = summarizeContextUsage(files)

    // Assert
    expect(result.files[0].limits).not.toBe(undefined)
    expect(result.files[1].limits).toBe(undefined)
  })

  it('should handle empty file list', () => {
    // Arrange
    const files: Array<{ path: string; content: string }> = []

    // Act
    const result = summarizeContextUsage(files)

    // Assert
    expect(result.files).toHaveLength(0)
    expect(result.totalLines).toBe(0)
    expect(result.totalTokens).toBe(0)
  })

  it('should handle empty file content', () => {
    // Arrange
    const files = [{ path: 'CLAUDE.md', content: '' }]

    // Act
    const result = summarizeContextUsage(files)

    // Assert
    expect(result.files[0].lines).toBe(1)
    expect(result.files[0].tokens).toBe(0)
  })
})
