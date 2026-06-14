import { mkdirSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'

import { auditToolchainIsolation } from './toolchain-isolation.js'

describe('auditToolchainIsolation', () => {
  let root: string

  beforeEach(() => {
    root = join(
      tmpdir(),
      `toolchain-isolation-${Date.now()}-${Math.random().toString(36).slice(2)}`,
    )
    mkdirSync(root, { recursive: true })
  })

  afterEach(() => {
    rmSync(root, { recursive: true, force: true })
  })

  it('rejects direct tool deps and direct binary scripts', () => {
    writePackage(root, {
      scripts: { test: 'vitest run', typecheck: 'wp typecheck' },
      devDependencies: { vitest: '^4.0.0', '@webpresso/agent-kit': 'latest' },
    })

    const result = auditToolchainIsolation(root)

    expect(result.ok).toBe(false)
    expect(result.violations.map((violation) => violation.message)).toEqual([
      expect.stringContaining('devDependencies.vitest'),
      expect.stringContaining('script "test"'),
    ])
  })

  it('allows wp and vp wrapper scripts without direct tool deps', () => {
    writePackage(root, {
      scripts: { test: 'wp test', qa: 'vp run qa' },
      devDependencies: { '@webpresso/agent-kit': 'latest' },
    })

    expect(auditToolchainIsolation(root)).toMatchObject({ ok: true, checked: 1 })
  })

  it('allows a local deploy adapter and EdgeMatte-style vp/wp split when generic tools stay upstream-owned', () => {
    writePackage(root, {
      scripts: {
        qa: 'vp run qa',
        typecheck: 'wp typecheck',
        'deploy:dry-run': 'wp deploy --lane prd --dry-run',
      },
      devDependencies: { '@webpresso/agent-kit': 'latest' },
    })
    writeFileSync(
      join(root, 'agent-kit.config.ts'),
      [
        'export const agentKitConfig = {',
        "  deploy: { adapterModule: './deploy-adapter.ts' },",
        '}',
        '',
      ].join('\n'),
    )
    writeFileSync(
      join(root, 'deploy-adapter.ts'),
      [
        'export const webpressoDeployAdapter = {',
        '  createPlan: (request) => ({',
        '    schemaVersion: 1,',
        '    lane: request.lane,',
        "    provider: 'cloudflare',",
        '    requiredCredentials: [],',
        "    steps: [{ kind: 'managed-tool', id: 'deploy', tool: 'wrangler', args: ['deploy', '--dry-run'] }],",
        '  }),',
        '}',
        '',
      ].join('\n'),
    )

    expect(auditToolchainIsolation(root)).toMatchObject({ ok: true, checked: 1 })
  })

  it('walks workspace package.json files while skipping node_modules', () => {
    mkdirSync(join(root, 'apps', 'client'), { recursive: true })
    mkdirSync(join(root, 'node_modules', 'vite'), { recursive: true })
    writePackage(root, { scripts: { lint: 'wp lint' } })
    writePackage(join(root, 'apps', 'client'), { devDependencies: { wrangler: '^4.0.0' } })
    writePackage(join(root, 'node_modules', 'vite'), { name: 'vite' })

    const result = auditToolchainIsolation(root)

    expect(result.checked).toBe(2)
    expect(result.violations).toHaveLength(1)
    expect(result.violations[0]?.message).toContain('devDependencies.wrangler')
  })

  it('exempts catalog template packages in packed release surfaces', () => {
    const templateRoot = join(
      root,
      '.webpresso-packed-surface',
      'catalog',
      'agent',
      'skills',
      'tanstack-query',
      'templates',
    )
    mkdirSync(templateRoot, { recursive: true })
    writePackage(templateRoot, {
      scripts: { build: 'vite build', lint: 'oxlint .' },
      devDependencies: { typescript: '^6.0.0', vite: '^8.0.0', oxlint: '^1.0.0' },
    })

    expect(auditToolchainIsolation(root)).toMatchObject({ ok: true, checked: 1 })
  })

  // Regression: the walk descended into the gitignored Claude Code agent
  // surface (.claude/worktrees/* agent scratch carries vendored package
  // manifests that are not the repo's own packages), producing false positives
  // on local dev machines and in consumer repos that run agent worktrees.
  it('skips the gitignored .claude agent worktree scratch', () => {
    writePackage(root, {
      scripts: { lint: 'wp lint' },
      devDependencies: { '@webpresso/agent-kit': 'latest' },
    })
    mkdirSync(join(root, '.claude', 'worktrees', 'agent-x', 'packages', 'foo'), {
      recursive: true,
    })
    writePackage(join(root, '.claude', 'worktrees', 'agent-x', 'packages', 'foo'), {
      scripts: { typecheck: 'tsc --noEmit' },
      devDependencies: { typescript: '^6.0.0' },
    })

    expect(auditToolchainIsolation(root)).toMatchObject({ ok: true, checked: 1 })
  })

  it('skips generated Windsurf and Gemini agent surfaces during the package walk', () => {
    writePackage(root, {
      scripts: { lint: 'wp lint' },
      devDependencies: { '@webpresso/agent-kit': 'latest' },
    })
    mkdirSync(join(root, '.windsurf', 'skills', 'tanstack-query', 'templates'), {
      recursive: true,
    })
    mkdirSync(join(root, '.gemini', 'commands', 'agent-kit'), { recursive: true })
    writePackage(join(root, '.windsurf', 'skills', 'tanstack-query', 'templates'), {
      scripts: { build: 'vite build' },
      devDependencies: { vite: '^8.0.0' },
    })
    writePackage(join(root, '.gemini', 'commands', 'agent-kit'), {
      scripts: { typecheck: 'tsc --noEmit' },
      devDependencies: { typescript: '^6.0.0' },
    })

    expect(auditToolchainIsolation(root)).toMatchObject({ ok: true, checked: 1 })
  })

  it('skips generated sibling _worktrees scratch during the package walk', () => {
    writePackage(root, {
      scripts: { lint: 'wp lint' },
      devDependencies: { '@webpresso/agent-kit': 'latest' },
    })
    mkdirSync(join(root, '_worktrees', 'agent-x', 'packages', 'foo'), {
      recursive: true,
    })
    writePackage(join(root, '_worktrees', 'agent-x', 'packages', 'foo'), {
      scripts: { build: 'vite build' },
      devDependencies: { vite: '^8.0.0' },
    })

    expect(auditToolchainIsolation(root)).toMatchObject({ ok: true, checked: 1 })
  })

  it('honors .webpressorc.json audit.toolchainIsolation.allowDependencies while still flagging unlisted tool deps', () => {
    writeFileSync(
      join(root, '.webpressorc.json'),
      `${JSON.stringify(
        {
          version: '1',
          installed: { tier3Skills: [] },
          audit: {
            toolchainIsolation: {
              allowDependencies: ['tsx'],
            },
          },
          rules: { overrides: [] },
          scripts: {},
          durablePlanningRoot: '.agent/planning/',
        },
        null,
        2,
      )}\n`,
    )
    mkdirSync(join(root, 'infra'), { recursive: true })
    writePackage(join(root, 'infra'), {
      devDependencies: {
        tsx: '^4.21.0',
        wrangler: '^4.0.0',
        '@webpresso/agent-kit': 'latest',
      },
      scripts: { check: 'wp typecheck' },
    })

    const result = auditToolchainIsolation(root)

    expect(result).toMatchObject({ ok: false, checked: 1 })
    expect(result.violations).toHaveLength(1)
    expect(result.violations[0]?.message).toContain('devDependencies.wrangler')
    expect(result.violations.map((violation) => violation.message).join()).not.toContain('tsx')
  })
})

function writePackage(dir: string, value: unknown): void {
  writeFileSync(join(dir, 'package.json'), `${JSON.stringify(value, null, 2)}\n`)
}
