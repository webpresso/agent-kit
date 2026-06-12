import { describe, expect, it } from 'vitest'
import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'

import { WP_ROUTING_BLOCK } from '#hooks/shared/routing-block'

const repoRoot = resolve(import.meta.dirname, '../../..')

describe('WP_ROUTING_BLOCK', () => {
  it('is a non-empty string', () => {
    expect(typeof WP_ROUTING_BLOCK).toBe('string')
    expect(WP_ROUTING_BLOCK.length).toBeGreaterThan(0)
  })

  it('has matching <wp_routing> open and close tags', () => {
    expect(WP_ROUTING_BLOCK).toContain('<wp_routing>')
    expect(WP_ROUTING_BLOCK).toContain('</wp_routing>')
  })

  it('mentions wp_test MCP tool', () => {
    expect(WP_ROUTING_BLOCK).toContain('wp_test')
  })

  it('mentions wp_e2e MCP tool', () => {
    expect(WP_ROUTING_BLOCK).toContain('wp_e2e')
  })

  it('distinguishes e2e execution from the tph-e2e audit', () => {
    expect(WP_ROUTING_BLOCK).toContain('running e2e test files')
    expect(WP_ROUTING_BLOCK).toContain('wp_e2e')
    expect(WP_ROUTING_BLOCK).toContain('E2E testing-philosophy audit')
  })

  it('mentions wp_lint MCP tool', () => {
    expect(WP_ROUTING_BLOCK).toContain('wp_lint')
  })

  it('mentions wp_typecheck MCP tool', () => {
    expect(WP_ROUTING_BLOCK).toContain('wp_typecheck')
  })

  it('mentions wp_qa MCP tool', () => {
    expect(WP_ROUTING_BLOCK).toContain('wp_qa')
  })

  it('mentions wp_audit MCP tool', () => {
    expect(WP_ROUTING_BLOCK).toContain('wp_audit')
  })

  it('routes local act and Worker tail commands to shipped MCP tool names', () => {
    expect(WP_ROUTING_BLOCK).toContain('wp_ci_act')
    expect(WP_ROUTING_BLOCK).toContain('wp_worker_tail')
    expect(WP_ROUTING_BLOCK).toContain('with-secrets -- act')
    expect(WP_ROUTING_BLOCK).toContain('with-secrets -- wrangler tail')
    expect(WP_ROUTING_BLOCK).not.toContain('ak_ci_act')
    expect(WP_ROUTING_BLOCK).not.toContain('ak_worker_tail')
  })

  it('mentions tph-e2e as an wp_audit usage', () => {
    expect(WP_ROUTING_BLOCK).toContain('tph-e2e')
    expect(WP_ROUTING_BLOCK).toContain('wp_audit(kind="tph-e2e")')
  })

  it('lists forbidden alternatives', () => {
    expect(WP_ROUTING_BLOCK).toContain('just test')
    expect(WP_ROUTING_BLOCK).toContain('bun run test')
    expect(WP_ROUTING_BLOCK).toContain('pnpm test')
    expect(WP_ROUTING_BLOCK).toContain('bun run wp')
    expect(WP_ROUTING_BLOCK).toContain('pnpm run wp')
    expect(WP_ROUTING_BLOCK).toContain('npm run wp')
    expect(WP_ROUTING_BLOCK).toContain('yarn wp')
    expect(WP_ROUTING_BLOCK).toContain('vp run wp')
    expect(WP_ROUTING_BLOCK).toContain('just lint')
    expect(WP_ROUTING_BLOCK).toContain('bun run lint')
    expect(WP_ROUTING_BLOCK).toContain('just qa')
    expect(WP_ROUTING_BLOCK).toContain('bun run qa')
    expect(WP_ROUTING_BLOCK).toContain('bun run lint-md')
    expect(WP_ROUTING_BLOCK).toContain('just lint-md')
    expect(WP_ROUTING_BLOCK).toContain('vitest')
    expect(WP_ROUTING_BLOCK).toContain('npx vitest')
    expect(WP_ROUTING_BLOCK).toContain('npm exec -- vitest')
    expect(WP_ROUTING_BLOCK).toContain('yarn vitest')
    expect(WP_ROUTING_BLOCK).toContain('bunx vitest')
    expect(WP_ROUTING_BLOCK).toContain('node ./node_modules/vitest/vitest.mjs')
    expect(WP_ROUTING_BLOCK).toContain('oxlint')
    expect(WP_ROUTING_BLOCK).toContain('node ./node_modules/oxlint/bin/oxlint')
    expect(WP_ROUTING_BLOCK).toContain('markdownlint-cli2')
    expect(WP_ROUTING_BLOCK).toContain('tsc')
    expect(WP_ROUTING_BLOCK).toContain('bun run typecheck')
    expect(WP_ROUTING_BLOCK).toContain('node ./node_modules/typescript/bin/tsc')
    expect(WP_ROUTING_BLOCK).toContain('bun run e2e')
  })

  it('routes markdown lint commands through wp_qa', () => {
    expect(WP_ROUTING_BLOCK).toContain('markdown lint')
    expect(WP_ROUTING_BLOCK).toContain('lint-md')
    expect(WP_ROUTING_BLOCK).toContain('markdownlint')
    expect(WP_ROUTING_BLOCK).toContain('just lint-md, markdownlint-cli2')
  })

  it('includes a decision table for wp_* dev-workflow tools', () => {
    expect(WP_ROUTING_BLOCK).toContain('<decision_table>')
    expect(WP_ROUTING_BLOCK).toContain('</decision_table>')
  })

  it('defines a single routing ownership boundary for ctx_* nudges', () => {
    expect(WP_ROUTING_BLOCK).toContain('<ownership_boundary>')
    expect(WP_ROUTING_BLOCK).toContain('Agent-kit owns wp_* dev-workflow routing here.')
    expect(WP_ROUTING_BLOCK).not.toContain('<tool name="ctx_execute">')
  })

  it('defines wp CLI fallback and hook diagnostic guidance', () => {
    expect(WP_ROUTING_BLOCK).toContain('matching direct wp CLI command')
    expect(WP_ROUTING_BLOCK).toContain('Never invoke wp through package-manager wrappers')
    expect(WP_ROUTING_BLOCK).toContain('Do not fall through to raw tool bins under node_modules')
    expect(WP_ROUTING_BLOCK).toContain('<hook_diagnostics>')
    expect(WP_ROUTING_BLOCK).toContain('Prefer wp hook &lt;name&gt;')
    expect(WP_ROUTING_BLOCK).toContain(
      'Direct wp-* hook bins remain generated-hook runtime internals',
    )
    expect(WP_ROUTING_BLOCK).toContain('Direct wp is the only public CLI fallback')
    expect(WP_ROUTING_BLOCK).not.toContain('use just recipes directly')
  })

  it('routes folded agent config helpers through @webpresso/agent-kit subpath exports', () => {
    expect(WP_ROUTING_BLOCK).toContain('@webpresso/agent-kit/* subpath exports')
    expect(WP_ROUTING_BLOCK).toContain('@webpresso/agent-kit/oxlint')
    expect(WP_ROUTING_BLOCK).toContain('@webpresso/agent-kit/workers-test')
    expect(WP_ROUTING_BLOCK).toContain('wp_* MCP tool names')
    expect(WP_ROUTING_BLOCK).toContain('wp-* hook bin names unchanged')
  })

  it('does not recommend retired @webpresso/agent-* config packages in routing or rule surfaces', () => {
    const surfaces = [
      'src/hooks/shared/routing-block.ts',
      'catalog/agent/rules/package-conventions.md',
      'catalog/agent/rules/changeset-release.md',
    ]
    const retiredPackages = [
      'docs-lint',
      'e2e-preset',
      'launch',
      'oxlint',
      'stryker',
      'test-preset',
      'tsconfig',
      'vitest',
      'workers-test',
    ].map((name) => `@webpresso/${'agent-'}${name}`)

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
    expect(WP_ROUTING_BLOCK).toContain('<output_format>')
    expect(WP_ROUTING_BLOCK).toContain('summary-first')
    expect(WP_ROUTING_BLOCK).toContain('raw output is clipped and secondary')
  })
})
