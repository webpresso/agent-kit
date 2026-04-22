import type { ConsumerContext } from './detect-consumer.js'

import { describe, expect, it } from 'vitest'

import {
  renderCrossPackageImports,
  renderKeyLocations,
  renderPackageNames,
  renderPackagesTable,
  renderTemplate,
} from './scaffold-monorepo-nav.js'

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

describe('renderPackagesTable', () => {
  it('returns single-package fallback when no packages', () => {
    expect(renderPackagesTable([])).toBe('This repo is a single-package project.')
  })

  it('renders a markdown table with TODO placeholders', () => {
    const table = renderPackagesTable([
      {
        name: '@acme/api',
        relativePath: 'apps/api',
        absolutePath: '/tmp/apps/api',
        shortName: 'api',
      },
    ])
    expect(table).toContain('| Package | Path | Purpose | Common Files |')
    expect(table).toContain(
      '| `@acme/api` | `apps/api` | {{TODO: describe}} | {{TODO: common files}} |',
    )
  })
})

describe('renderKeyLocations', () => {
  it('emits TODO when no packages', () => {
    expect(renderKeyLocations([])).toContain('{{TODO')
  })

  it('detects api suffix packages', () => {
    const out = renderKeyLocations([
      {
        name: '@acme/platform-api',
        relativePath: 'apps/api',
        absolutePath: '/x',
        shortName: 'platform-api',
      },
    ])
    expect(out).toContain('API routes')
    expect(out).toContain('apps/api/src/routes/')
  })

  it('detects UI packages', () => {
    const out = renderKeyLocations([
      { name: '@acme/ui', relativePath: 'packages/ui', absolutePath: '/x', shortName: 'ui' },
    ])
    expect(out).toContain('Components')
    expect(out).toContain('packages/ui/src/components/')
  })

  it('leaves TODO when no heuristic matches', () => {
    const out = renderKeyLocations([
      {
        name: '@acme/random',
        relativePath: 'packages/random',
        absolutePath: '/x',
        shortName: 'random',
      },
    ])
    expect(out).toContain('{{TODO')
  })
})

describe('renderCrossPackageImports', () => {
  it('emits TODO when no packages', () => {
    expect(renderCrossPackageImports([])).toContain('{{TODO')
  })

  it('lists import examples', () => {
    const out = renderCrossPackageImports([
      { name: '@acme/a', relativePath: 'a', absolutePath: '/a', shortName: 'a' },
    ])
    expect(out).toContain("from '@acme/a'")
  })
})

describe('renderPackageNames', () => {
  it('maps short → full names', () => {
    const out = renderPackageNames([
      { name: '@acme/api', relativePath: 'apps/api', absolutePath: '/x', shortName: 'api' },
    ])
    expect(out).toContain('`api` → `@acme/api`')
  })
})

describe('renderTemplate', () => {
  it('replaces PROJECT_NAME from package.json name', () => {
    const tpl = 'Hello {{PROJECT_NAME}}'
    const rendered = renderTemplate(
      tpl,
      makeConsumer({
        packageJson: {
          name: '@acme/app',
          dependencies: {},
          devDependencies: {},
        },
      }),
    )
    expect(rendered).toBe('Hello @acme/app')
  })

  it('falls back to basename when no package.json', () => {
    const rendered = renderTemplate(
      'Hello {{PROJECT_NAME}}',
      makeConsumer({ repoRoot: '/tmp/foo-proj' }),
    )
    expect(rendered).toBe('Hello foo-proj')
  })

  it('leaves unknown placeholders intact for humans', () => {
    const rendered = renderTemplate('see {{TODO: populate}}', makeConsumer())
    expect(rendered).toContain('{{TODO: populate}}')
  })

  it('fills all known placeholders', () => {
    const tpl =
      '{{PROJECT_NAME}}\n{{PACKAGES_TABLE}}\n{{KEY_LOCATIONS}}\n{{CROSS_PACKAGE_IMPORTS}}\n{{PACKAGE_NAMES}}'
    const rendered = renderTemplate(
      tpl,
      makeConsumer({
        packageJson: { name: '@acme/app', dependencies: {}, devDependencies: {} },
        workspacePackages: [
          { name: '@acme/api', relativePath: 'apps/api', absolutePath: '/x', shortName: 'api' },
        ],
      }),
    )
    expect(rendered).toContain('@acme/app')
    expect(rendered).toContain('| `@acme/api` |')
    expect(rendered).toContain('API routes')
    expect(rendered).toContain("from '@acme/api'")
    expect(rendered).toContain('`api` → `@acme/api`')
  })
})
