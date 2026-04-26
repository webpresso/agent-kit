import { describe, expect, it } from 'vitest'

import { AK_ROUTING_BLOCK } from '#hooks/shared/routing-block'

describe('AK_ROUTING_BLOCK', () => {
  it('is a non-empty string', () => {
    expect(typeof AK_ROUTING_BLOCK).toBe('string')
    expect(AK_ROUTING_BLOCK.length).toBeGreaterThan(0)
  })

  it('has matching <ak_routing> open and close tags', () => {
    expect(AK_ROUTING_BLOCK).toContain('<ak_routing>')
    expect(AK_ROUTING_BLOCK).toContain('</ak_routing>')
  })

  it('mentions ak_test MCP tool', () => {
    expect(AK_ROUTING_BLOCK).toContain('ak_test')
  })

  it('mentions ak_lint MCP tool', () => {
    expect(AK_ROUTING_BLOCK).toContain('ak_lint')
  })

  it('mentions ak_typecheck MCP tool', () => {
    expect(AK_ROUTING_BLOCK).toContain('ak_typecheck')
  })

  it('mentions ak_qa MCP tool', () => {
    expect(AK_ROUTING_BLOCK).toContain('ak_qa')
  })

  it('mentions ak_audit MCP tool', () => {
    expect(AK_ROUTING_BLOCK).toContain('ak_audit')
  })

  it('lists forbidden alternatives', () => {
    expect(AK_ROUTING_BLOCK).toContain('just test')
    expect(AK_ROUTING_BLOCK).toContain('pnpm test')
    expect(AK_ROUTING_BLOCK).toContain('just lint')
    expect(AK_ROUTING_BLOCK).toContain('just qa')
    expect(AK_ROUTING_BLOCK).toContain('vitest')
    expect(AK_ROUTING_BLOCK).toContain('oxlint')
    expect(AK_ROUTING_BLOCK).toContain('tsc')
  })
})
