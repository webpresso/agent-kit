import { describe, expect, it } from 'vitest'

import { buildRedirectMessage } from './mcp-redirect.js'

describe('buildRedirectMessage', () => {
  it.each([
    ['test', 'mcp__agent-kit__ak_test(...)'],
    ['lint', 'mcp__agent-kit__ak_lint(...)'],
    ['typecheck', 'mcp__agent-kit__ak_typecheck(...)'],
    ['unknown', 'mcp__agent-kit__ak_qa(...)'],
  ] as const)('uses MCP tool format for %s when MCP is ready', (category, matcher) => {
    const message = buildRedirectMessage({
      category,
      command: 'pnpm test',
      fallbackHint: 'just test --package <name> (or --file <path>)',
      mcpReady: true,
    })

    expect(message).toContain('"pnpm test" denied — use agent-kit MCP tool:')
    expect(message).toContain(matcher)
    expect(message).toContain('Fallback if MCP unavailable:')
  })

  it.each([
    ['test', 'just test --package <name>'],
    ['lint', 'just lint --package <name>'],
    ['typecheck', 'just typecheck --package <name>'],
    ['unknown', 'just <task> [target]'],
  ] as const)('falls back cleanly for %s when MCP is not ready', (category, fallbackHint) => {
    const message = buildRedirectMessage({
      category,
      command: 'pnpm test',
      fallbackHint,
      mcpReady: false,
    })

    expect(message).toBe(`"pnpm test" denied — MCP not ready. Use: ${fallbackHint}`)
  })

  it('uses config overrides for server name and tool prefix', () => {
    const message = buildRedirectMessage({
      category: 'test',
      command: 'pnpm test',
      fallbackHint: 'just test --package <name>',
      mcpReady: true,
      mcp: { serverName: 'custom-server', toolPrefix: 'tool_' },
    })

    expect(message).toContain('mcp__custom-server__tool_test(...)')
  })
})
