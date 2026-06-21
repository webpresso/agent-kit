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

  it('uses Claude CLI login directly instead of API-key fallback auth', () => {
    expect(content).toContain('claude auth status')
    expect(content).toContain('CLAUDE_AUTH=cli-login')
    expect(content).toContain('run claude auth login with the intended Claude Max account')
    expect(content).not.toContain('ANTHROPIC_API_KEY')
    expect(content).not.toContain('CLAUDE_API_KEY')
    expect(content).not.toContain('CLAUDE_AUTH=api-key')
    expect(content).not.toContain('CLAUDE_AUTH=credentials-file')
    expect(content).not.toContain('$HOME/.claude/.credentials.json')
  })

  it('requires explicit logged-in booleans across all staged Claude skill surfaces', () => {
    for (const skillPath of skillPaths) {
      const skill = readFileSync(skillPath, 'utf8')
      expect(skill).toContain('"$AUTH_STATUS_FILE"')
      expect(skill).toContain('"(authenticated|loggedIn|success)"[[:space:]]*:[[:space:]]*true')
      expect(skill).not.toMatch(/grep -E .*claude\.ai/)
    }
  })

  it('uses portable Darwin-safe mktemp patterns', () => {
    expect(content).toContain('mktemp -t wp-claude-auth.XXXXXX')
    expect(content).toContain('mktemp -t wp-claude-review.XXXXXX')
    expect(content).not.toMatch(/XXXXXX\.[a-z]+/)
    expect(content).not.toContain('/tmp/wp-claude-auth.json')
  })
})
