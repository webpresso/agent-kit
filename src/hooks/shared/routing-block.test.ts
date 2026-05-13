import { describe, expect, it } from 'vitest'
import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'

import { AK_ROUTING_BLOCK } from '#hooks/shared/routing-block'

const repoRoot = resolve(import.meta.dirname, '../../..')

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

  it('mentions ak_e2e MCP tool', () => {
    expect(AK_ROUTING_BLOCK).toContain('ak_e2e')
  })

  it('distinguishes e2e execution from the tph-e2e audit', () => {
    expect(AK_ROUTING_BLOCK).toContain('running e2e test files')
    expect(AK_ROUTING_BLOCK).toContain('ak_e2e')
    expect(AK_ROUTING_BLOCK).toContain('E2E testing-philosophy audit')
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

  it('mentions tph-e2e as an ak_audit usage', () => {
    expect(AK_ROUTING_BLOCK).toContain('tph-e2e')
    expect(AK_ROUTING_BLOCK).toContain('ak_audit(kind="tph-e2e")')
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

  it('includes a decision table for ak_* dev-workflow tools', () => {
    expect(AK_ROUTING_BLOCK).toContain('<decision_table>')
    expect(AK_ROUTING_BLOCK).toContain('</decision_table>')
  })

  it('defines a single routing ownership boundary for ctx_* nudges', () => {
    expect(AK_ROUTING_BLOCK).toContain('<ownership_boundary>')
    expect(AK_ROUTING_BLOCK).toContain('Context-mode owns ctx_* routing')
    expect(AK_ROUTING_BLOCK).not.toContain('<tool name="ctx_execute">')
  })

  it('routes folded agent config helpers through webpresso subpath exports', () => {
    expect(AK_ROUTING_BLOCK).toContain('webpresso/* subpath exports')
    expect(AK_ROUTING_BLOCK).toContain('webpresso/oxlint')
    expect(AK_ROUTING_BLOCK).toContain('webpresso/workers-test')
    expect(AK_ROUTING_BLOCK).toContain('ak_* MCP tool names')
    expect(AK_ROUTING_BLOCK).toContain('ak-* hook bin names unchanged')
  })

  it('does not recommend retired @webpresso/agent-* config packages in routing or rule surfaces', () => {
    const surfaces = [
      'src/hooks/shared/routing-block.ts',
      'catalog/agent/rules/package-conventions.md',
      'catalog/agent/rules/changeset-release.md',
      'AGENTS.md',
    ]
    const retiredPackages = [
      '@webpresso/agent-docs-lint',
      '@webpresso/agent-e2e-preset',
      '@webpresso/agent-launch',
      '@webpresso/agent-oxlint',
      '@webpresso/agent-stryker',
      '@webpresso/agent-test-preset',
      '@webpresso/agent-tsconfig',
      '@webpresso/agent-vitest',
      '@webpresso/agent-workers-test',
    ]

    for (const surface of surfaces) {
      const content = readFileSync(resolve(repoRoot, surface), 'utf8')
      for (const retiredPackage of retiredPackages) {
        expect(content, `${surface} should not mention ${retiredPackage}`).not.toContain(
          retiredPackage,
        )
      }
    }
  })

  it('includes output format constraint', () => {
    expect(AK_ROUTING_BLOCK).toContain('<output_format>')
    expect(AK_ROUTING_BLOCK).toContain('summary-first')
    expect(AK_ROUTING_BLOCK).toContain('raw output is clipped and secondary')
  })
})
