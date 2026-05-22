import { describe, expect, it } from 'vitest'

import { buildRedirectMessage } from './mcp-redirect.js'

describe('buildRedirectMessage', () => {
  it.each([
    ['test', 'mcp__agent-kit__ak_test(...)'],
    ['lint', 'mcp__agent-kit__ak_lint(...)'],
    ['typecheck', 'mcp__agent-kit__ak_typecheck(...)'],
    ['blueprint', 'mcp__agent-kit__ak_blueprint(...)'],
    ['unknown', 'mcp__agent-kit__ak_qa(...)'],
  ] as const)('uses MCP tool format for %s when MCP is ready', (category, matcher) => {
    const message = buildRedirectMessage({
      category,
      command: 'vp run test',
      fallbackHint: 'ak_test MCP tool with package/file scope',
      mcpReady: true,
    })

    expect(message).toContain('"vp run test" denied — use agent-kit MCP tool:')
    expect(message).toContain(matcher)
    expect(message).toContain('Fallback if MCP unavailable:')
  })

  it.each([
    ['test', 'ak_test MCP tool with package/file scope'],
    ['lint', 'ak_lint MCP tool with package/file scope'],
    ['typecheck', 'ak_typecheck MCP tool with package/file scope'],
    ['unknown', 'repo-approved MCP/tooling entrypoint'],
  ] as const)('falls back cleanly for %s when MCP is not ready', (category, fallbackHint) => {
    const message = buildRedirectMessage({
      category,
      command: 'vp run test',
      fallbackHint,
      mcpReady: false,
    })

    expect(message).toBe(`"vp run test" denied — MCP not ready. Use: ${fallbackHint}`)
  })

  it('uses config overrides for server name and tool prefix', () => {
    const message = buildRedirectMessage({
      category: 'test',
      command: 'vp run test',
      fallbackHint: 'ak_test MCP tool with package/file scope',
      mcpReady: true,
      mcp: { serverName: 'custom-server', toolPrefix: 'tool_' },
    })

    expect(message).toContain('mcp__custom-server__tool_test(...)')
  })
})
