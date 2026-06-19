import { describe, expect, it } from 'vitest'
import { existsSync, readFileSync } from 'node:fs'
import { dirname, resolve } from 'node:path'

import { WP_ROUTING_BLOCK } from '#hooks/shared/routing-block'

function findRepoRoot(start: string): string {
  let current = start
  while (!existsSync(resolve(current, 'package.json'))) {
    const parent = dirname(current)
    if (parent === current) throw new Error('Unable to find repo root')
    current = parent
  }
  return current
}

const repoRoot = findRepoRoot(import.meta.dirname)

describe('WP_ROUTING_BLOCK', () => {
  it('is a non-empty string', () => {
    expect(typeof WP_ROUTING_BLOCK).toBe('string')
    expect(WP_ROUTING_BLOCK.length).toBeGreaterThan(0)
  })

  it('has matching <wp_routing> open and close tags', () => {
    expect(WP_ROUTING_BLOCK).toContain('<wp_routing>')
    expect(WP_ROUTING_BLOCK).toContain('</wp_routing>')
  })

  it('includes wp_session context-window protection guidance for every public session-memory tool', () => {
    expect(WP_ROUTING_BLOCK).toContain('<wp_session_context>')
    expect(WP_ROUTING_BLOCK).toContain('context-window protection')
    for (const tool of [
      'wp_session_batch_execute',
      'wp_session_capture',
      'wp_session_doctor',
      'wp_session_execute',
      'wp_session_execute_file',
      'wp_session_fetch_and_index',
      'wp_session_index',
      'wp_session_purge',
      'wp_session_restore',
      'wp_session_search',
      'wp_session_snapshot',
      'wp_session_stats',
    ]) {
      expect(WP_ROUTING_BLOCK).toContain(tool)
    }
  })

  it('maps large-context operations to concrete wp_session tools without public ctx_* guidance', () => {
    expect(WP_ROUTING_BLOCK).toContain('read-to-analyze')
    expect(WP_ROUTING_BLOCK).toContain('wp_session_execute_file')
    expect(WP_ROUTING_BLOCK).toContain('shell gathering')
    expect(WP_ROUTING_BLOCK).toContain('wp_session_batch_execute')
    expect(WP_ROUTING_BLOCK).toContain('network fetches')
    expect(WP_ROUTING_BLOCK).toContain('wp_session_fetch_and_index')
    expect(WP_ROUTING_BLOCK).toContain('restore/search first')
    expect(WP_ROUTING_BLOCK).toContain('wp_session_restore')
    expect(WP_ROUTING_BLOCK).toContain('wp_session_search')
    expect(WP_ROUTING_BLOCK).not.toMatch(/\bctx_(?:execute|batch_execute|search|restore)\b/u)
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
    expect(WP_ROUTING_BLOCK).toContain('wp secrets run --sink act')
    expect(WP_ROUTING_BLOCK).toContain('wp secrets run --sink deploy-wrangler')
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

  it('routes split agent config helpers through agent-kit and agent-config surfaces', () => {
    expect(WP_ROUTING_BLOCK).toContain('@webpresso/agent-kit/oxlint')
    expect(WP_ROUTING_BLOCK).toContain('@webpresso/agent-config/workers-test')
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
