import type { ConsumerContext } from './detect-consumer.js'

import { readFileSync } from 'node:fs'
import { join } from 'node:path'

import { describe, expect, it } from 'vitest'

import { defaultConfig } from './config.js'
import { renderAgentsMd, renderRepositoryMap, renderTechStack } from './scaffold-agents-md.js'

function makeConsumer(overrides: Partial<ConsumerContext> = {}): ConsumerContext {
  return {
    repoRoot: '/tmp/test-repo',
    packageJsonPath: null,
    packageJson: null,
    hasPnpmWorkspace: false,
    workspacePackages: [],
    ...overrides,
  }
}

describe('renderRepositoryMap', () => {
  it('renders single-package fallback with repo name', () => {
    const out = renderRepositoryMap(
      makeConsumer({
        packageJson: { name: '@acme/app', dependencies: {}, devDependencies: {} },
      }),
    )
    expect(out).toContain('Single-package project')
    expect(out).toContain('@acme/app')
  })

  it('renders a bulleted list for multi-package repos', () => {
    const out = renderRepositoryMap(
      makeConsumer({
        workspacePackages: [
          { name: '@acme/api', relativePath: 'apps/api', absolutePath: '/x', shortName: 'api' },
          { name: '@acme/web', relativePath: 'apps/web', absolutePath: '/x', shortName: 'web' },
        ],
      }),
    )
    expect(out).toContain('- `@acme/api` — `apps/api`')
    expect(out).toContain('- `@acme/web` — `apps/web`')
  })
})

describe('renderTechStack', () => {
  it('detects common frameworks', () => {
    const out = renderTechStack(
      makeConsumer({
        packageJson: {
          name: 'x',
          dependencies: { react: '^18.0.0', hono: '^4.0.0', 'drizzle-orm': '^0.30.0' },
          devDependencies: { vitest: '^2.0.0', typescript: '^5.0.0' },
        },
      }),
    )
    expect(out).toContain('React')
    expect(out).toContain('Hono')
    expect(out).toContain('Drizzle ORM')
    expect(out).toContain('Vitest')
    expect(out).toContain('TypeScript')
  })

  it('leaves a TODO when nothing matches', () => {
    const out = renderTechStack(
      makeConsumer({
        packageJson: { name: 'x', dependencies: { nonsense: '1' }, devDependencies: {} },
      }),
    )
    expect(out).toContain('{{TODO')
  })
})

describe('renderAgentsMd', () => {
  it('replaces all four placeholders', () => {
    const template =
      '## Map\n{{REPOSITORY_MAP}}\n## Stack\n{{TECH_STACK}}\n## Esc\n{{ESCALATION_MAP}}\n## Planning\n{{DURABLE_PLANNING_ROOT}}'
    const consumer = makeConsumer({
      packageJson: { name: '@acme/app', dependencies: { react: '^18' }, devDependencies: {} },
    })
    const config = defaultConfig()
    const rendered = renderAgentsMd(template, consumer, config)
    expect(rendered).toContain('Single-package project')
    expect(rendered).toContain('React')
    expect(rendered).toContain('{{TODO: populate escalation map')
    expect(rendered).toContain('.agent/planning/')
    expect(rendered).not.toContain('{{REPOSITORY_MAP}}')
    expect(rendered).not.toContain('{{TECH_STACK}}')
    expect(rendered).not.toContain('{{DURABLE_PLANNING_ROOT}}')
  })

  it('honours custom DURABLE_PLANNING_ROOT from config', () => {
    const template = '{{DURABLE_PLANNING_ROOT}}'
    const config = { ...defaultConfig(), durablePlanningRoot: 'custom/planning/' }
    const rendered = renderAgentsMd(template, makeConsumer(), config)
    expect(rendered).toBe('custom/planning/')
  })

  it('renders the catalog template with the single canonical bootstrap command', () => {
    const template = readFileSync(join(process.cwd(), 'catalog', 'AGENTS.md.tpl'), 'utf8')
    const rendered = renderAgentsMd(
      template,
      makeConsumer({
        packageJson: { name: '@acme/app', dependencies: { react: '^18' }, devDependencies: {} },
      }),
      defaultConfig(),
    )

    expect(rendered).toContain('pnpm install && pnpm setup:agent')
    expect(rendered).toContain(
      'pnpm setup:agent runs ak setup, which scaffolds .agent/, AGENTS.md, hooks, and runs ak sync',
    )
    expect(rendered).not.toContain('ak symlink sync')
    expect(rendered).not.toContain('omx setup --scope project')
  })
})
