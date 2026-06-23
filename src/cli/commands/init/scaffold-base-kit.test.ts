import { existsSync, mkdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'

import { resolveCatalogDir } from './index.js'
import { collectRuntimeContractGuidance, scaffoldBaseKit } from './scaffold-base-kit.js'

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
    expect(existsSync(join(repoRoot, '.node-version'))).toBe(false)
    expect(existsSync(join(repoRoot, '.nvmrc'))).toBe(false)
    expect(existsSync(join(repoRoot, '.actrc'))).toBe(true)
    expect(existsSync(join(repoRoot, '.editorconfig'))).toBe(true)
    expect(existsSync(join(repoRoot, 'pnpm-workspace.yaml'))).toBe(true)
    expect(existsSync(join(repoRoot, '.secretlintrc.json'))).toBe(true)
    expect(existsSync(join(repoRoot, 'commitlint.config.ts'))).toBe(true)
    expect(existsSync(join(repoRoot, '.husky', 'pre-commit'))).toBe(true)
    expect(existsSync(join(repoRoot, '.husky', 'commit-msg'))).toBe(false)
    expect(existsSync(join(repoRoot, '.github', 'actions', 'setup-webpresso', 'action.yml'))).toBe(
      false,
    )
    expect(existsSync(join(repoRoot, '.github', 'workflows', 'ci.yml'))).toBe(true)
    expect(existsSync(join(repoRoot, '.github', 'workflows', 'release.yml'))).toBe(true)
    expect(existsSync(join(repoRoot, '.github', 'workflows', 'deploy-production.yml'))).toBe(false)
    expect(existsSync(join(repoRoot, '.changeset', 'config.json'))).toBe(true)
    expect(existsSync(join(repoRoot, '.changeset', 'README.md'))).toBe(true)
    expect(existsSync(join(repoRoot, 'scripts', 'check-no-dev-vars.ts'))).toBe(false)
    expect(existsSync(join(repoRoot, 'scripts', 'audit-secret-provider-quarantine.ts'))).toBe(false)
    expect(existsSync(join(repoRoot, 'scripts', 'sync-release-metadata-version.ts'))).toBe(true)
    expect(existsSync(join(repoRoot, 'scripts', 'release-publish.ts'))).toBe(true)
    expect(existsSync(join(repoRoot, 'tsconfig.json'))).toBe(true)
    expect(existsSync(join(repoRoot, 'vitest.config.ts'))).toBe(true)
    // Tier-1 DRY: no oxlint.config.ts is scaffolded — `wp lint` injects the
    // shared --config instead.
    expect(existsSync(join(repoRoot, 'oxlint.config.ts'))).toBe(false)
    expect(existsSync(join(repoRoot, 'stryker.config.ts'))).toBe(true)
    expect(readFileSync(join(repoRoot, 'stryker.config.ts'), 'utf8')).not.toContain('mutate:')
    const gitignore = readFileSync(join(repoRoot, '.gitignore'), 'utf8')
    expect(gitignore).toContain('.stryker-tmp/')
    expect(gitignore).toContain('reports/mutation/')
    expect(gitignore).toContain('reports/stryker-incremental.json')
    expect(gitignore).toContain('stryker-setup-*.js')
    expect(existsSync(join(repoRoot, 'playwright.config.ts'))).toBe(true)
    expect(existsSync(join(repoRoot, 'src', 'quality-sample.ts'))).toBe(true)
    expect(existsSync(join(repoRoot, 'src', 'quality-sample.test.ts'))).toBe(true)
    expect(existsSync(join(repoRoot, 'e2e', 'fixtures', 'smoke.html'))).toBe(true)
    expect(existsSync(join(repoRoot, 'e2e', 'smoke.spec.ts'))).toBe(true)
    expect(existsSync(join(repoRoot, 'test', '.gitkeep'))).toBe(true)
    expect(existsSync(join(repoRoot, 'e2e', '.gitkeep'))).toBe(true)

    const workflow = readFileSync(join(repoRoot, '.github', 'workflows', 'ci.yml'), 'utf8')
    const releaseWorkflow = readFileSync(
      join(repoRoot, '.github', 'workflows', 'release.yml'),
      'utf8',
    )
    expect(workflow).toContain('\n  quality:\n')
    expect(workflow).toContain('name: quality')
    expect(workflow).toContain('\n  wp-check:\n')
    expect(workflow).toContain('name: wp-check')
    expect(workflow).toContain('needs:\n      - quality')
    expect(workflow).toContain('\n  e2e:\n')
    expect(workflow).toContain('\n  architecture-drift:\n')
    expect(workflow).toContain('\n  deploy-verify:\n')
    expect(workflow).toContain('Skipping e2e: playwright.config.ts not present.')
    expect(workflow).toContain('vp install -g @webpresso/agent-kit')
    expect(workflow).not.toContain('./.github/actions/setup-webpresso')
    expect(workflow).not.toContain('\n  test:\n')
    expect(workflow).not.toContain('\n  wp-audits:\n')
    expect(workflow).not.toContain('\n  deploy-contract:\n')
    expect(releaseWorkflow).toContain(
      'changesets-release.yml@3f0136f88a488bc0894ab81ab3c8544b2e8dabf2',
    )
    expect(releaseWorkflow).toContain('version_command: pnpm run version')
    expect(releaseWorkflow).toContain('publish_command: pnpm run release:publish')
    expect(releaseWorkflow).not.toContain('workflow_dispatch:')
    expect(releaseWorkflow).not.toContain('release-preflight:')

    const preCommit = readFileSync(join(repoRoot, '.husky', 'pre-commit'), 'utf8')
    expect(preCommit).toContain('git diff --cached --name-only --diff-filter=ACMR')
    expect(preCommit).toContain('wp format || exit 1')
    expect(preCommit).toContain('git add -- "$file"')
    expect(preCommit).toContain('md|mdx')
    expect(preCommit).toContain('|| exit 1')
    expect(preCommit).toContain("grep -Eq '^blueprints/(README\\.md|[^/]+/.*\\.md)$'")
    expect(preCommit).toContain('wp audit blueprint-readme-drift')
    // The whole-repo guardrails suite is CI-owned, never run per-commit.
    expect(preCommit).not.toContain('wp audit guardrails')
    // Fast audits are gated on staged source/config — not run whole-repo every commit.
    expect(preCommit).toContain('wp audit no-dev-vars')
    expect(preCommit).toContain('(ts|tsx|js|jsx')
  })

  it('dry-run does not write files', () => {
    const catalogDir = resolveCatalogDir()
    const results = scaffoldBaseKit({ catalogDir, repoRoot, options: { dryRun: true } })

    const actions = results.map((r) => r.action)
    expect(actions.every((a) => a === 'skipped-dry')).toBe(true)
    expect(existsSync(join(repoRoot, '.gitignore'))).toBe(false)
  })

  // Dogfooding boundary: agent-kit ships base-kit, so its own repo gets the
  // script lane (proven by "skips self-install fields…") but NOT the starter
  // quality SAMPLES — teaching artifacts for fresh consumer repos that would
  // pollute agent-kit's source tree. Skipped for both self identities.
  it('skips starter quality samples on the @webpresso/agent-kit repo while keeping the script lane', () => {
    writeFileSync(join(repoRoot, 'package.json'), JSON.stringify({ name: '@webpresso/agent-kit' }))
    const catalogDir = resolveCatalogDir()

    scaffoldBaseKit({ catalogDir, repoRoot, options: {} })

    // Starter samples are NOT scaffolded into the tool's own source tree…
    expect(existsSync(join(repoRoot, 'src', 'quality-sample.ts'))).toBe(false)
    expect(existsSync(join(repoRoot, 'src', 'quality-sample.test.ts'))).toBe(false)
    expect(existsSync(join(repoRoot, 'e2e', 'smoke.spec.ts'))).toBe(false)
    expect(existsSync(join(repoRoot, 'oxlint.config.ts'))).toBe(false)
    // …but the dogfooded script lane is still merged.
    const pkg = JSON.parse(readFileSync(join(repoRoot, 'package.json'), 'utf8')) as {
      scripts?: Record<string, string>
    }
    expect(pkg.scripts?.['test']).toBe('wp test --file vitest.config.ts')
  })

  it('merges engines and packageManager into package.json', () => {
    const catalogDir = resolveCatalogDir()
    scaffoldBaseKit({ catalogDir, repoRoot, options: {} })

    const pkg = JSON.parse(readFileSync(join(repoRoot, 'package.json'), 'utf8')) as Record<
      string,
      unknown
    >
    expect((pkg['engines'] as Record<string, string>)['node']).toBe('>=24')
    expect(pkg['type']).toBe('module')
    expect(pkg['packageManager']).toBe('pnpm@11.1.1')
    expect(
      (pkg['devDependencies'] as Record<string, string>)['@webpresso/agent-kit'],
    ).toBeUndefined()
    expect((pkg['devDependencies'] as Record<string, string>)['@webpresso/agent-config']).toMatch(
      /^\^\d+\.\d+\.\d+/u,
    )
    expect((pkg['devDependencies'] as Record<string, string>)['@changesets/cli']).toBe('latest')
    expect((pkg['devDependencies'] as Record<string, string>)['typescript']).toBe('latest')
    expect((pkg['devDependencies'] as Record<string, string>)['vitest']).toBe('latest')
    expect((pkg['devDependencies'] as Record<string, string>)['@playwright/test']).toBe('latest')
    expect((pkg['devDependencies'] as Record<string, string>)['@stryker-mutator/core']).toBe(
      'latest',
    )
    expect(
      (pkg['devDependencies'] as Record<string, string>)['@stryker-mutator/typescript-checker'],
    ).toBe('latest')
    expect(pkg['version']).toBe('0.0.0')
    expect((pkg['scripts'] as Record<string, string>)['setup:agent']).toBe('wp setup')
    expect((pkg['scripts'] as Record<string, string>)['changeset']).toBe('changeset')
    expect((pkg['scripts'] as Record<string, string>)['changeset:status']).toBe('changeset status')
    expect((pkg['scripts'] as Record<string, string>)['version']).toBe(
      'changeset version && bun scripts/sync-release-metadata-version.ts',
    )
    expect((pkg['scripts'] as Record<string, string>)['release:publish']).toBe(
      'bun scripts/release-publish.ts',
    )
    expect((pkg['scripts'] as Record<string, string>)['lint']).toBe(
      'wp lint --file src --file e2e --file *.config.ts',
    )
    expect((pkg['scripts'] as Record<string, string>)['typecheck']).toBe('wp typecheck')
    expect((pkg['scripts'] as Record<string, string>)['test']).toBe(
      'wp test --file vitest.config.ts',
    )
    expect((pkg['scripts'] as Record<string, string>)['mutation']).toBe('wp test --mutation')
    expect((pkg['scripts'] as Record<string, string>)['test:mutation']).toBe(
      'stryker run stryker.config.ts',
    )
    expect((pkg['scripts'] as Record<string, string>)['e2e']).toBe(
      'wp e2e --config playwright.config.ts',
    )
    expect((pkg['scripts'] as Record<string, string>)['qa']).toContain(
      'wp lint --file src --file e2e --file *.config.ts',
    )
    expect((pkg['scripts'] as Record<string, string>)['verify:paths']).toBe(
      'wp audit absolute-path-policy --root .',
    )
    expect((pkg['scripts'] as Record<string, string>)['verify:secrets']).toBe(
      'wp audit no-dev-vars',
    )
    expect((pkg['scripts'] as Record<string, string>)['audit:secret-provider-quarantine']).toBe(
      'wp audit secret-provider-quarantine',
    )
    expect((pkg['scripts'] as Record<string, string>)['prepare']).toBe('husky')
  })

  it('adds only missing bootstrap fields for consumers', () => {
    const pkgPath = join(repoRoot, 'package.json')
    const initial = {
      name: 'consumer-app',
      scripts: { test: 'vitest' },
      devDependencies: { '@webpresso/agent-config': '^0.2.0' },
    }
    writeFileSync(pkgPath, JSON.stringify(initial, null, 2))

    const catalogDir = resolveCatalogDir()
    scaffoldBaseKit({ catalogDir, repoRoot, options: {} })

    const pkg = JSON.parse(readFileSync(pkgPath, 'utf8')) as Record<string, unknown>
    expect((pkg['devDependencies'] as Record<string, string>)['@webpresso/agent-config']).toBe(
      '^0.2.0',
    )
    expect(pkg['version']).toBe('0.0.0')
    expect((pkg['scripts'] as Record<string, string>)['setup:agent']).toBe('wp setup')
    expect((pkg['scripts'] as Record<string, string>)['changeset']).toBe('changeset')
    expect((pkg['scripts'] as Record<string, string>)['changeset:status']).toBe('changeset status')
    expect((pkg['scripts'] as Record<string, string>)['version']).toBe(
      'changeset version && bun scripts/sync-release-metadata-version.ts',
    )
    expect((pkg['scripts'] as Record<string, string>)['release:publish']).toBe(
      'bun scripts/release-publish.ts',
    )
    expect((pkg['scripts'] as Record<string, string>)['verify:paths']).toBe(
      'wp audit absolute-path-policy --root .',
    )
    expect((pkg['scripts'] as Record<string, string>)['verify:secrets']).toBe(
      'wp audit no-dev-vars',
    )
    expect((pkg['scripts'] as Record<string, string>)['audit:secret-provider-quarantine']).toBe(
      'wp audit secret-provider-quarantine',
    )
    expect((pkg['scripts'] as Record<string, string>)['prepare']).toBe('husky')
    expect((pkg['scripts'] as Record<string, string>)['test']).toBe('vitest')
    expect((pkg['scripts'] as Record<string, string>)['lint']).toBe(
      'wp lint --file src --file e2e --file *.config.ts',
    )
  })

  it('replaces npm init placeholder test script with the starter test lane', () => {
    const pkgPath = join(repoRoot, 'package.json')
    writeFileSync(
      pkgPath,
      JSON.stringify(
        {
          name: 'consumer-app',
          scripts: { test: 'echo "Error: no test specified" && exit 1' },
        },
        null,
        2,
      ),
    )

    const catalogDir = resolveCatalogDir()
    scaffoldBaseKit({ catalogDir, repoRoot, options: {} })

    const pkg = JSON.parse(readFileSync(pkgPath, 'utf8')) as Record<string, unknown>
    expect((pkg['scripts'] as Record<string, string>)['test']).toBe(
      'wp test --file vitest.config.ts',
    )
  })

  it('preserves consumer-owned setup:agent and existing agent-config devDependency', () => {
    const pkgPath = join(repoRoot, 'package.json')
    mkdirSync(repoRoot, { recursive: true })
    const initial = {
      name: 'consumer-app',
      scripts: { 'setup:agent': 'wp setup' },
      devDependencies: { '@webpresso/agent-config': '^0.2.0' },
    }
    writeFileSync(pkgPath, JSON.stringify(initial, null, 2))

    const catalogDir = resolveCatalogDir()
    scaffoldBaseKit({ catalogDir, repoRoot, options: {} })

    const pkg = JSON.parse(readFileSync(pkgPath, 'utf8')) as Record<string, unknown>
    expect(pkg['version']).toBe('0.0.0')
    expect((pkg['scripts'] as Record<string, string>)['setup:agent']).toBe('wp setup')
    expect((pkg['scripts'] as Record<string, string>)['changeset']).toBe('changeset')
    expect((pkg['scripts'] as Record<string, string>)['changeset:status']).toBe('changeset status')
    expect((pkg['scripts'] as Record<string, string>)['version']).toBe(
      'changeset version && bun scripts/sync-release-metadata-version.ts',
    )
    expect((pkg['scripts'] as Record<string, string>)['release:publish']).toBe(
      'bun scripts/release-publish.ts',
    )
    expect((pkg['scripts'] as Record<string, string>)['verify:paths']).toBe(
      'wp audit absolute-path-policy --root .',
    )
    expect((pkg['scripts'] as Record<string, string>)['verify:secrets']).toBe(
      'wp audit no-dev-vars',
    )
    expect((pkg['scripts'] as Record<string, string>)['audit:secret-provider-quarantine']).toBe(
      'wp audit secret-provider-quarantine',
    )
    expect((pkg['scripts'] as Record<string, string>)['prepare']).toBe('husky')
    expect((pkg['devDependencies'] as Record<string, string>)['@webpresso/agent-config']).toBe(
      '^0.2.0',
    )
  })

  it('preserves a consumer-provided verify:secrets script', () => {
    const pkgPath = join(repoRoot, 'package.json')
    const initial = {
      name: 'consumer-app',
      scripts: {
        'setup:agent': 'wp setup',
        'verify:paths': 'echo custom path check',
        'verify:secrets': 'echo custom secret check',
        prepare: 'pnpm -C packages prebuild',
      },
      devDependencies: { '@webpresso/agent-config': '^0.2.0' },
    }
    writeFileSync(pkgPath, JSON.stringify(initial, null, 2))

    const catalogDir = resolveCatalogDir()
    scaffoldBaseKit({ catalogDir, repoRoot, options: {} })

    const pkg = JSON.parse(readFileSync(pkgPath, 'utf8')) as Record<string, unknown>
    expect((pkg['scripts'] as Record<string, string>)['prepare']).toBe('pnpm -C packages prebuild')
    expect((pkg['scripts'] as Record<string, string>)['verify:paths']).toBe(
      'echo custom path check',
    )
    expect((pkg['scripts'] as Record<string, string>)['verify:secrets']).toBe(
      'echo custom secret check',
    )
    expect((pkg['scripts'] as Record<string, string>)['audit:secret-provider-quarantine']).toBe(
      'wp audit secret-provider-quarantine',
    )
  })

  it('injects the agent-config package pin for ordinary consumer repos', () => {
    const pkgPath = join(repoRoot, 'package.json')
    writeFileSync(pkgPath, JSON.stringify({ name: 'consumer-app', private: true }, null, 2))

    const catalogDir = resolveCatalogDir()
    scaffoldBaseKit({ catalogDir, repoRoot, options: {} })

    const pkg = JSON.parse(readFileSync(pkgPath, 'utf8')) as Record<string, unknown>
    expect(
      (pkg['devDependencies'] as Record<string, string>)['@webpresso/agent-kit'],
    ).toBeUndefined()
    expect((pkg['devDependencies'] as Record<string, string>)['@webpresso/agent-config']).toMatch(
      /^\^\d+\.\d+\.\d+/,
    )
    expect(pkg['version']).toBe('0.0.0')
    expect((pkg['scripts'] as Record<string, string>)['setup:agent']).toBe('wp setup')
    expect((pkg['scripts'] as Record<string, string>)['changeset']).toBe('changeset')
    expect((pkg['scripts'] as Record<string, string>)['changeset:status']).toBe('changeset status')
    expect((pkg['scripts'] as Record<string, string>)['version']).toBe(
      'changeset version && bun scripts/sync-release-metadata-version.ts',
    )
    expect((pkg['scripts'] as Record<string, string>)['release:publish']).toBe(
      'bun scripts/release-publish.ts',
    )
    expect((pkg['scripts'] as Record<string, string>)['verify:paths']).toBe(
      'wp audit absolute-path-policy --root .',
    )
    expect((pkg['scripts'] as Record<string, string>)['verify:secrets']).toBe(
      'wp audit no-dev-vars',
    )
    expect((pkg['scripts'] as Record<string, string>)['audit:secret-provider-quarantine']).toBe(
      'wp audit secret-provider-quarantine',
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
      devDependencies: { '@webpresso/agent-config': '^0.18.0' },
    }
    writeFileSync(pkgPath, JSON.stringify(initial, null, 2))

    const catalogDir = resolveCatalogDir()
    scaffoldBaseKit({ catalogDir, repoRoot, options: {} })

    const pkg = JSON.parse(readFileSync(pkgPath, 'utf8')) as Record<string, unknown>
    expect(pkg['packageManager']).toBe('pnpm@11.5.0')
  })

  it('scaffolds verify:paths onto the shared wp audit surface', () => {
    const catalogDir = resolveCatalogDir()
    scaffoldBaseKit({ catalogDir, repoRoot, options: {} })

    const pkg = JSON.parse(readFileSync(join(repoRoot, 'package.json'), 'utf8')) as Record<
      string,
      unknown
    >
    expect((pkg['scripts'] as Record<string, string>)['verify:paths']).toBe(
      'wp audit absolute-path-policy --root .',
    )
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

  it('skips self-install fields in the @webpresso/agent-kit repo itself', () => {
    const pkgPath = join(repoRoot, 'package.json')
    writeFileSync(pkgPath, JSON.stringify({ name: '@webpresso/agent-kit', private: true }, null, 2))

    const catalogDir = resolveCatalogDir()
    scaffoldBaseKit({ catalogDir, repoRoot, options: {} })

    const pkg = JSON.parse(readFileSync(pkgPath, 'utf8')) as Record<string, unknown>
    expect((pkg['devDependencies'] as Record<string, string>)['@webpresso/agent-kit']).toBe(
      undefined,
    )
    expect((pkg['scripts'] as Record<string, string>)['test']).toBe(
      'wp test --file vitest.config.ts',
    )
  })

  it('does NOT overwrite existing quality configs or sample files even with --overwrite', () => {
    const consumerFiles: Array<[string, string]> = [
      ['tsconfig.json', '{"compilerOptions":{"strict":false}}\n'],
      ['vitest.config.ts', 'export default {}\n'],
      ['oxlint.config.ts', 'export default {}\n'],
      ['stryker.config.ts', 'export default {}\n'],
      ['playwright.config.ts', 'export default {}\n'],
      [join('src', 'quality-sample.ts'), 'export const owned = true\n'],
      [join('e2e', 'smoke.spec.ts'), 'export const owned = true\n'],
    ]
    for (const [relativePath, content] of consumerFiles) {
      const targetPath = join(repoRoot, relativePath)
      mkdirSync(join(targetPath, '..'), { recursive: true })
      writeFileSync(targetPath, content)
    }

    const catalogDir = resolveCatalogDir()
    scaffoldBaseKit({ catalogDir, repoRoot, options: { overwrite: true } })

    for (const [relativePath, content] of consumerFiles) {
      expect(readFileSync(join(repoRoot, relativePath), 'utf8')).toBe(content)
    }
  })

  it('identical run produces only identical/skipped results', () => {
    const catalogDir = resolveCatalogDir()
    scaffoldBaseKit({ catalogDir, repoRoot, options: {} })
    const results2 = scaffoldBaseKit({ catalogDir, repoRoot, options: {} })

    const nonIdentical = results2.filter((r) => r.action !== 'identical')
    expect(nonIdentical).toHaveLength(0)
  })

  it('separates local authoring deps from execution-only removal candidates', () => {
    expect(
      collectRuntimeContractGuidance({
        devDependencies: {
          vitest: '^3.0.0',
          '@playwright/test': '^1.55.0',
          oxlint: '^1.0.0',
          oxfmt: '^1.0.0',
        },
      }),
    ).toEqual({
      keepLocalAuthoringDeps: ['vitest', '@playwright/test'],
      reviewForRemovalDeps: ['oxlint', 'oxfmt'],
    })
  })
})
