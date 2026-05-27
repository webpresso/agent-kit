import { existsSync, mkdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'

import { resolveCatalogDir } from './index.js'
import { scaffoldBaseKit } from './scaffold-base-kit.js'

describe('scaffoldBaseKit', () => {
  let repoRoot: string

  beforeEach(() => {
    repoRoot = join(tmpdir(), `wp-base-kit-test-${Date.now()}`)
    mkdirSync(repoRoot, { recursive: true })
  })

  afterEach(() => {
    rmSync(repoRoot, { recursive: true, force: true })
  })

  it('writes all expected template files', () => {
    const catalogDir = resolveCatalogDir()
    const results = scaffoldBaseKit({ catalogDir, repoRoot, options: {} })

    const actions = results.map((r) => r.action)
    expect(actions).not.toContain('skipped-dry')

    expect(existsSync(join(repoRoot, '.gitignore'))).toBe(true)
    expect(existsSync(join(repoRoot, '.actrc'))).toBe(true)
    expect(existsSync(join(repoRoot, '.editorconfig'))).toBe(true)
    expect(existsSync(join(repoRoot, 'pnpm-workspace.yaml'))).toBe(true)
    expect(existsSync(join(repoRoot, '.secretlintrc.json'))).toBe(true)
    expect(existsSync(join(repoRoot, 'commitlint.config.ts'))).toBe(true)
    expect(existsSync(join(repoRoot, '.husky', 'pre-commit'))).toBe(true)
    expect(existsSync(join(repoRoot, '.husky', 'commit-msg'))).toBe(true)
    expect(existsSync(join(repoRoot, '.github', 'workflows', 'ci.webpresso.yml'))).toBe(true)
    expect(existsSync(join(repoRoot, 'scripts', 'check-no-dev-vars.ts'))).toBe(true)
    expect(existsSync(join(repoRoot, 'scripts', 'audit-secret-provider-quarantine.ts'))).toBe(true)
    expect(existsSync(join(repoRoot, 'test', '.gitkeep'))).toBe(true)
    expect(existsSync(join(repoRoot, 'e2e', '.gitkeep'))).toBe(true)
  })

  it('dry-run does not write files', () => {
    const catalogDir = resolveCatalogDir()
    const results = scaffoldBaseKit({ catalogDir, repoRoot, options: { dryRun: true } })

    const actions = results.map((r) => r.action)
    expect(actions.every((a) => a === 'skipped-dry')).toBe(true)
    expect(existsSync(join(repoRoot, '.gitignore'))).toBe(false)
  })

  it('merges engines and packageManager into package.json', () => {
    const catalogDir = resolveCatalogDir()
    scaffoldBaseKit({ catalogDir, repoRoot, options: {} })

    const pkg = JSON.parse(readFileSync(join(repoRoot, 'package.json'), 'utf8')) as Record<
      string,
      unknown
    >
    expect((pkg['engines'] as Record<string, string>)['node']).toBe('>=24')
    expect(pkg['packageManager']).toBe('pnpm@11.1.1')
    expect((pkg['devDependencies'] as Record<string, string>)['webpresso']).toBe('latest')
    expect((pkg['scripts'] as Record<string, string>)['setup:agent']).toBe('wp setup')
    expect((pkg['scripts'] as Record<string, string>)['verify:secrets']).toBe(
      'bun scripts/check-no-dev-vars.ts',
    )
    expect((pkg['scripts'] as Record<string, string>)['audit:secret-provider-quarantine']).toBe(
      'bun scripts/audit-secret-provider-quarantine.ts',
    )
    expect((pkg['scripts'] as Record<string, string>)['prepare']).toBe('husky')
  })

  it('adds only missing bootstrap fields for consumers', () => {
    const pkgPath = join(repoRoot, 'package.json')
    const initial = {
      name: 'consumer-app',
      scripts: { test: 'vitest' },
      devDependencies: { webpresso: '^0.2.0' },
    }
    writeFileSync(pkgPath, JSON.stringify(initial, null, 2))

    const catalogDir = resolveCatalogDir()
    scaffoldBaseKit({ catalogDir, repoRoot, options: {} })

    const pkg = JSON.parse(readFileSync(pkgPath, 'utf8')) as Record<string, unknown>
    expect((pkg['devDependencies'] as Record<string, string>)['webpresso']).toBe('^0.2.0')
    expect((pkg['scripts'] as Record<string, string>)['setup:agent']).toBe('wp setup')
    expect((pkg['scripts'] as Record<string, string>)['verify:secrets']).toBe(
      'bun scripts/check-no-dev-vars.ts',
    )
    expect((pkg['scripts'] as Record<string, string>)['audit:secret-provider-quarantine']).toBe(
      'bun scripts/audit-secret-provider-quarantine.ts',
    )
    expect((pkg['scripts'] as Record<string, string>)['prepare']).toBe('husky')
    expect((pkg['scripts'] as Record<string, string>)['test']).toBe('vitest')
  })

  it('preserves consumer-owned setup:agent and existing webpresso devDependency', () => {
    const pkgPath = join(repoRoot, 'package.json')
    mkdirSync(repoRoot, { recursive: true })
    const initial = {
      name: 'consumer-app',
      scripts: { 'setup:agent': 'vp exec wp setup' },
      devDependencies: { webpresso: '^0.2.0' },
    }
    writeFileSync(pkgPath, JSON.stringify(initial, null, 2))

    const catalogDir = resolveCatalogDir()
    scaffoldBaseKit({ catalogDir, repoRoot, options: {} })

    const pkg = JSON.parse(readFileSync(pkgPath, 'utf8')) as Record<string, unknown>
    expect((pkg['scripts'] as Record<string, string>)['setup:agent']).toBe('vp exec wp setup')
    expect((pkg['scripts'] as Record<string, string>)['verify:secrets']).toBe(
      'bun scripts/check-no-dev-vars.ts',
    )
    expect((pkg['scripts'] as Record<string, string>)['audit:secret-provider-quarantine']).toBe(
      'bun scripts/audit-secret-provider-quarantine.ts',
    )
    expect((pkg['scripts'] as Record<string, string>)['prepare']).toBe('husky')
    expect((pkg['devDependencies'] as Record<string, string>)['webpresso']).toBe('^0.2.0')
  })

  it('preserves a consumer-provided verify:secrets script', () => {
    const pkgPath = join(repoRoot, 'package.json')
    const initial = {
      name: 'consumer-app',
      scripts: {
        'setup:agent': 'wp setup',
        'verify:secrets': 'echo custom secret check',
        prepare: 'pnpm -C packages prebuild',
      },
      devDependencies: { webpresso: '^0.2.0' },
    }
    writeFileSync(pkgPath, JSON.stringify(initial, null, 2))

    const catalogDir = resolveCatalogDir()
    scaffoldBaseKit({ catalogDir, repoRoot, options: {} })

    const pkg = JSON.parse(readFileSync(pkgPath, 'utf8')) as Record<string, unknown>
    expect((pkg['scripts'] as Record<string, string>)['prepare']).toBe('pnpm -C packages prebuild')
    expect((pkg['scripts'] as Record<string, string>)['verify:secrets']).toBe(
      'echo custom secret check',
    )
    expect((pkg['scripts'] as Record<string, string>)['audit:secret-provider-quarantine']).toBe(
      'bun scripts/audit-secret-provider-quarantine.ts',
    )
  })

  it('does not inject a local webpresso devDependency when the repo opts into globalInstall', () => {
    const pkgPath = join(repoRoot, 'package.json')
    writeFileSync(
      join(repoRoot, '.webpressorc.json'),
      JSON.stringify({
        version: '1',
        installed: { tier3Skills: [] },
        rules: { overrides: [] },
        scripts: {},
        durablePlanningRoot: '.agent/planning/',
        globalInstall: true,
      }),
    )
    writeFileSync(pkgPath, JSON.stringify({ name: 'consumer-app', private: true }, null, 2))

    const catalogDir = resolveCatalogDir()
    scaffoldBaseKit({ catalogDir, repoRoot, options: {}, globalInstall: true })

    const pkg = JSON.parse(readFileSync(pkgPath, 'utf8')) as Record<string, unknown>
    expect(
      (pkg['devDependencies'] as Record<string, string> | undefined)?.['webpresso'],
    ).toBeUndefined()
    expect((pkg['scripts'] as Record<string, string>)['setup:agent']).toBe('wp setup')
    expect((pkg['scripts'] as Record<string, string>)['verify:secrets']).toBe(
      'bun scripts/check-no-dev-vars.ts',
    )
    expect((pkg['scripts'] as Record<string, string>)['audit:secret-provider-quarantine']).toBe(
      'bun scripts/audit-secret-provider-quarantine.ts',
    )
    expect((pkg['scripts'] as Record<string, string>)['prepare']).toBe('husky')
  })

  it('does not downgrade packageManager when repo already has pnpm@11+', () => {
    const pkgPath = join(repoRoot, 'package.json')
    mkdirSync(repoRoot, { recursive: true })
    const initial = {
      name: 'consumer-app',
      packageManager: 'pnpm@11.5.0',
      engines: { node: '>=24' },
      scripts: { 'setup:agent': 'wp setup' },
      devDependencies: { webpresso: '^0.18.0' },
    }
    writeFileSync(pkgPath, JSON.stringify(initial, null, 2))

    const catalogDir = resolveCatalogDir()
    scaffoldBaseKit({ catalogDir, repoRoot, options: {} })

    const pkg = JSON.parse(readFileSync(pkgPath, 'utf8')) as Record<string, unknown>
    expect(pkg['packageManager']).toBe('pnpm@11.5.0')
  })

  it('does NOT overwrite an existing .gitignore even with --overwrite', () => {
    const gitignorePath = join(repoRoot, '.gitignore')
    const consumerOwned = '# consumer rules\n.test-reports/\n.webpresso/generated/\n**/.wrangler/\n'
    writeFileSync(gitignorePath, consumerOwned)

    const catalogDir = resolveCatalogDir()
    scaffoldBaseKit({ catalogDir, repoRoot, options: { overwrite: true } })

    expect(readFileSync(gitignorePath, 'utf8')).toBe(consumerOwned)
  })

  it('does NOT overwrite an existing pnpm-workspace.yaml even with --overwrite', () => {
    const wsPath = join(repoRoot, 'pnpm-workspace.yaml')
    const consumerOwned =
      "packages:\n  - packages/*\ncatalog:\n  '@neondatabase/serverless': ^1.0.2\n"
    writeFileSync(wsPath, consumerOwned)

    const catalogDir = resolveCatalogDir()
    scaffoldBaseKit({ catalogDir, repoRoot, options: { overwrite: true } })

    expect(readFileSync(wsPath, 'utf8')).toBe(consumerOwned)
  })

  it('skips self-install fields in the webpresso repo itself', () => {
    const pkgPath = join(repoRoot, 'package.json')
    writeFileSync(pkgPath, JSON.stringify({ name: 'webpresso', private: true }, null, 2))

    const catalogDir = resolveCatalogDir()
    scaffoldBaseKit({ catalogDir, repoRoot, options: {} })

    const pkg = JSON.parse(readFileSync(pkgPath, 'utf8')) as Record<string, unknown>
    expect((pkg['devDependencies'] as Record<string, string>)['webpresso']).toBeUndefined()
    expect(pkg['scripts']).toBeUndefined()
  })

  it('identical run produces only identical/skipped results', () => {
    const catalogDir = resolveCatalogDir()
    scaffoldBaseKit({ catalogDir, repoRoot, options: {} })
    const results2 = scaffoldBaseKit({ catalogDir, repoRoot, options: {} })

    const nonIdentical = results2.filter((r) => r.action !== 'identical')
    expect(nonIdentical).toHaveLength(0)
  })
})
