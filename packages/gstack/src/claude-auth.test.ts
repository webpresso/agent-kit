import { readFileSync } from 'node:fs'
import path from 'node:path'

import { describe, expect, it } from 'vitest'

describe('Claude skill helper snippets', () => {
  const content = readFileSync(path.resolve(import.meta.dirname, '../skills/claude.md'), 'utf8')

  it('detects first-party auth before API key and credentials fallbacks', () => {
    expect(content.indexOf('claude auth status --output json')).toBeLessThan(content.indexOf('ANTHROPIC_API_KEY'))
    expect(content).toMatch(/claude\.ai/)
    expect(content).toContain('CLAUDE_AUTH_STATUS_FILE=$(mktemp -t wp-claude-auth.XXXXXX)')
    expect(content).toContain('rm -f "$CLAUDE_AUTH_STATUS_FILE"')
    expect(content).not.toContain('/tmp/wp-claude-auth.json')
    expect(content).toContain('CLAUDE_AUTH=api-key')
    expect(content).toContain('CLAUDE_AUTH=credentials-file')
    expect(content).toContain('CLAUDE_AUTH=missing')
  })

  it('uses a portable Darwin-safe mktemp pattern', () => {
    expect(content).toContain('mktemp -t wp-claude-review.XXXXXX')
    expect(content).not.toMatch(/XXXXXX\.[a-z]+/)
  })
})
