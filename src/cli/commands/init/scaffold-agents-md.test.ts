import type { ConsumerContext } from './detect-consumer.js'

import { readFileSync } from 'node:fs'
import { join } from 'node:path'

import { describe, expect, it } from 'vitest'

import { defaultConfig } from './config.js'
import { resolveCatalogDir } from './index.js'
import {
  AGENTS_MD_MAX_BYTES,
  mergeRenderedAgentsMd,
  renderAgentsMd,
  renderRepositoryMap,
  renderTechStack,
} from './scaffold-agents-md.js'

// Resolve the real catalog template via the package-anchored resolver
// (walks from import.meta, the same path production uses) rather than
// `process.cwd()`. This keeps the assertion pinned to the live template
// while staying independent of the test runner's working directory.
const AGENTS_MD_TEMPLATE_PATH = join(resolveCatalogDir(), 'AGENTS.md.tpl')

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
  it('replaces all five placeholders', () => {
    const template =
      '## Map\n{{REPOSITORY_MAP}}\n## Stack\n{{TECH_STACK}}\n## Esc\n{{ESCALATION_MAP}}\n## Planning\n{{DURABLE_PLANNING_ROOT}}\n## Blueprints\n{{BLUEPRINTS_DIR}}'
    const consumer = makeConsumer({
      packageJson: { name: '@acme/app', dependencies: { react: '^18' }, devDependencies: {} },
    })
    const config = defaultConfig()
    const rendered = renderAgentsMd(template, consumer, config)
    expect(rendered).toContain('Single-package project')
    expect(rendered).toContain('React')
    expect(rendered).toContain('{{TODO: populate escalation map')
    expect(rendered).toContain('.agent/planning/')
    expect(rendered).toContain('blueprints')
    expect(rendered).not.toContain('{{REPOSITORY_MAP}}')
    expect(rendered).not.toContain('{{TECH_STACK}}')
    expect(rendered).not.toContain('{{DURABLE_PLANNING_ROOT}}')
    expect(rendered).not.toContain('{{BLUEPRINTS_DIR}}')
    expect(rendered).not.toContain('{{CODEX_ROUTING_INSTRUCTION_SURFACE}}')
  })

  it('honours custom DURABLE_PLANNING_ROOT from config', () => {
    const template = '{{DURABLE_PLANNING_ROOT}}'
    const config = { ...defaultConfig(), durablePlanningRoot: 'custom/planning/' }
    const rendered = renderAgentsMd(template, makeConsumer(), config)
    expect(rendered).toBe('custom/planning/')
  })

  it('renders the catalog template with precise agent-kit ownership and future Webpresso CLI replacements', () => {
    const template = readFileSync(AGENTS_MD_TEMPLATE_PATH, 'utf8')
    const rendered = renderAgentsMd(
      template,
      makeConsumer({
        packageJson: { name: '@acme/app', dependencies: { react: '^18' }, devDependencies: {} },
      }),
      defaultConfig(),
    )

    expect(rendered).toContain('vp install && vp run setup:agent')
    expect(rendered).toContain(
      'setup:agent runs wp setup, which scaffolds .agent/, AGENTS.md, hooks, and runs wp sync',
    )
    expect(rendered).toContain("agent-kit's catalog is the single source of truth")
    expect(rendered).toContain(
      'Agent-kit owns the generated agent surfaces in this file; the Webpresso CLI host owns the end-user command surface.',
    )
    expect(rendered).toContain('Current-state bootstrap commands remain `wp setup` / `wp sync`')
    expect(rendered).toContain('future unified CLI replacements are `webpresso agent setup`')
    expect(rendered).toContain('`webpresso agent sync`')
    expect(rendered).not.toContain('webpresso is the single source of truth.')
    expect(rendered).toContain('<!-- >>> managed by webpresso (operating-contract) -->')
    expect(rendered).toContain('<!-- >>> user-owned (repo-customizations) -->')
    expect(rendered).not.toContain('wp symlink sync')
    expect(rendered).toContain(
      '- Repository map: bulleted list of workspace packages inferred from',
    )
    expect(rendered).not.toContain('- - `')
    expect(rendered).toContain(
      'External tools such as `omx`, `omc`, and `gstack` are self-installed',
    )
    expect(rendered).not.toContain('wp setup --with omx')
    expect(rendered).not.toContain('omx setup --yes --scope user')
    expect(rendered).not.toContain('default workstation presets: `omx`')
  })

  it('keeps the generated default template under the prompt budget', () => {
    const template = readFileSync(AGENTS_MD_TEMPLATE_PATH, 'utf8')
    const rendered = renderAgentsMd(
      template,
      makeConsumer({
        packageJson: { name: '@acme/app', dependencies: { react: '^18' }, devDependencies: {} },
      }),
      defaultConfig(),
    )

    expect(Buffer.byteLength(rendered, 'utf8')).toBeLessThanOrEqual(AGENTS_MD_MAX_BYTES)
    expect(rendered).toContain('Keep the generated default `AGENTS.md` under 8 KB.')
    expect(rendered).toContain('Codex routing instruction surface')
    expect(rendered).toContain(
      '<wp_instruction_surface host="codex" artifact="AGENTS.md" source="wp_routing">',
    )
    expect(rendered).toContain('wp_session_retrieve')
    expect(rendered).toContain(
      'wp_test, wp_e2e, wp_lint, wp_typecheck, wp_qa, wp_audit, wp_ci_act, wp_worker_tail',
    )
  })

  it('renders the configured blueprint directory in the catalog template', () => {
    const template = readFileSync(AGENTS_MD_TEMPLATE_PATH, 'utf8')
    const rendered = renderAgentsMd(
      template,
      makeConsumer({
        packageJson: { name: '@acme/app', dependencies: { react: '^18' }, devDependencies: {} },
      }),
      { ...defaultConfig(), blueprintsDir: 'webpresso/blueprints' },
    )

    expect(rendered).toContain('webpresso/blueprints/')
    expect(rendered).not.toContain('(./blueprints/)')
    expect(rendered).toContain('Materialized by setup: blueprint lifecycle directories')
    expect(rendered).toContain('Generated on demand (not created by setup): boundary contracts')
    expect(rendered).not.toContain('{{BLUEPRINTS_DIR}}')
    expect(rendered).not.toContain('{{CODEX_ROUTING_INSTRUCTION_SURFACE}}')
  })

  it('preserves user-owned blocks while refreshing managed content', () => {
    const rendered = [
      '<!-- >>> managed by webpresso (operating-contract) -->',
      '# Managed',
      '<!-- <<< managed by webpresso (operating-contract) -->',
      '<!-- >>> user-owned (repo-customizations) -->',
      'default custom text',
      '<!-- <<< user-owned (repo-customizations) -->',
      '<!-- >>> user-owned (escalation-map) -->',
      'default escalation text',
      '<!-- <<< user-owned (escalation-map) -->',
      '',
    ].join('\n')
    const existing = [
      '<!-- >>> managed by webpresso (operating-contract) -->',
      '# Old managed',
      '<!-- <<< managed by webpresso (operating-contract) -->',
      '<!-- >>> user-owned (repo-customizations) -->',
      'keep my repo customizations',
      '<!-- <<< user-owned (repo-customizations) -->',
      '<!-- >>> user-owned (escalation-map) -->',
      'keep my escalation map',
      '<!-- <<< user-owned (escalation-map) -->',
      '',
    ].join('\n')

    const merged = mergeRenderedAgentsMd(rendered, existing)
    expect(merged).not.toBeNull()
    expect(merged).toContain('# Managed')
    expect(merged).not.toContain('# Old managed')
    expect(merged).toContain('keep my repo customizations')
    expect(merged).toContain('keep my escalation map')
    expect(merged).not.toContain('default custom text')
    expect(merged).not.toContain('default escalation text')
  })
})
