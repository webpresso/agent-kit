import { readFileSync } from 'node:fs'
import path from 'node:path'

import { describe, expect, it } from 'vitest'

describe('Claude skill helper snippets', () => {
  const repoRoot = path.resolve(import.meta.dirname, '../../..')
  const skillPaths = [
    path.resolve(import.meta.dirname, '../skills/claude.md'),
    path.join(repoRoot, 'catalog/agent/skills/claude/SKILL.md'),
    path.join(repoRoot, 'skills/claude/SKILL.md'),
  ]
  const content = readFileSync(skillPaths[0]!, 'utf8')

  it('detects first-party auth before API key and credentials fallbacks', () => {
    expect(content.indexOf('claude auth status --output json')).toBeLessThan(content.indexOf('ANTHROPIC_API_KEY'))
    expect(content).not.toMatch(/grep -E .*claude\\.ai/)
    expect(content).toContain('AUTH_STATUS_FILE=$(mktemp -t wp-claude-auth.XXXXXX)')
    expect(content).toContain('rm -f "$AUTH_STATUS_FILE"')
    expect(content).not.toContain('/tmp/wp-claude-auth.json')
    expect(content).toContain('CLAUDE_AUTH=api-key')
    expect(content).toContain('CLAUDE_AUTH=credentials-file')
    expect(content).toContain('CLAUDE_AUTH=missing')
  })

  it('requires explicit logged-in booleans across all staged Claude skill surfaces', () => {
    for (const skillPath of skillPaths) {
      const skill = readFileSync(skillPath, 'utf8')
      expect(skill).toContain('"$AUTH_STATUS_FILE"')
      expect(skill).toMatch(/"\(authenticated\|loggedIn\|success\)"\\\[\\\[:space:\\\]\\\]\*:\\\[\\\[:space:\\\]\\\]\*true/)
      expect(skill).not.toMatch(/grep -E .*claude\\.ai/)
    }
  })

  it('uses a portable Darwin-safe mktemp pattern', () => {
    expect(content).toContain('mktemp -t wp-claude-review.XXXXXX')
    expect(content).not.toMatch(/XXXXXX\.[a-z]+/)
  })
})
