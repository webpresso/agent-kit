import { readFileSync, readdirSync } from 'node:fs'
import path from 'node:path'

import { describe, expect, it } from 'vitest'

describe('@repo/gstack skill text contract', () => {
  it('uses unprefixed Webpresso-owned skill names without external checkout requirements', () => {
    const skillsDir = path.resolve(import.meta.dirname, '../skills')
    for (const file of readdirSync(skillsDir)) {
      const content = readFileSync(path.join(skillsDir, file), 'utf8')
      expect(content).not.toMatch(/gstack-/)
      expect(content).not.toContain('~/.claude/skills/gstack')
      expect(content).not.toContain('~/.codex/skills/gstack')
      expect(content).not.toContain('/tmp/wp-claude-auth')
      expect(content).not.toMatch(/browse\/dist|design\/dist|make-pdf\/dist|playwright|puppeteer|ngrok|html-to-docx/i)
    }
  })
})
