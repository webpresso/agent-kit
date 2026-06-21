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

  it('recognizes Claude first-party auth only from explicit truthy auth fields', () => {
    const claudeSkill = readFileSync(
      path.resolve(import.meta.dirname, '../skills/claude.md'),
      'utf8',
    )

    expect(claudeSkill).toContain('"(authenticated|loggedIn|success)"')
    expect(claudeSkill).not.toContain('|claude\\.ai')
    expect(claudeSkill).not.toMatch(/claude\\.ai'?[[:space:]]*\\|/)
  })


  it('ships Codex and all OpenCode Go model-family reviewer skills', () => {
    const skillsDir = path.resolve(import.meta.dirname, '../skills')
    const required = ['codex', 'opencode-go', 'deepseek', 'glm', 'kimi', 'minimax', 'mimo', 'qwen', 'hy3']
    for (const name of required) {
      const content = readFileSync(path.join(skillsDir, `${name}.md`), 'utf8')
      expect(content).toContain(`name: ${name}`)
    }

    const opencodeSkills = required.filter((name) => name !== 'codex')
    for (const name of opencodeSkills) {
      const content = readFileSync(path.join(skillsDir, `${name}.md`), 'utf8')
      expect(content).toContain('opencode run --model')
      expect(content).toContain('opencode models opencode-go')
      expect(content).toContain('opencode-go/deepseek-v4-pro')
      expect(content).toContain('opencode-go/glm-5.2')
      expect(content).toContain('opencode-go/kimi-k2.7-code')
      expect(content).toContain('opencode-go/minimax-m3')
      expect(content).toContain('opencode-go/mimo-v2.5-pro')
      expect(content).toContain('opencode-go/qwen3.7-max')
      expect(content).toContain('opencode-go/hy3-preview')
    }
  })

})
