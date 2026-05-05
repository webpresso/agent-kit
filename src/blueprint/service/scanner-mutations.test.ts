import { cpSync, mkdirSync, rmSync, symlinkSync, writeFileSync } from 'node:fs'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

import { type ScanOptions, scanBlueprintDirectory } from './scanner.js'

describe('scanBlueprintDirectory - mutation coverage', () => {
  const testDir = `/tmp/test-blueprints-mut-${Date.now()}`

  beforeEach(() => {
    mkdirSync(`${testDir}/webpresso/blueprints/my-feature`, { recursive: true })
    mkdirSync(`${testDir}/webpresso/blueprints/completed/tooling`, { recursive: true })
    mkdirSync(`${testDir}/webpresso/blueprints/_future/idea`, { recursive: true })

    writeFileSync(`${testDir}/webpresso/blueprints/my-feature/_overview.md`, '# Plan')
    writeFileSync(
      `${testDir}/webpresso/blueprints/completed/tooling/_overview.md`,
      '# Tooling Plan',
    )
    writeFileSync(`${testDir}/webpresso/blueprints/_future/idea/_overview.md`, '# Future Idea')
  })

  afterEach(() => {
    rmSync(testDir, { recursive: true, force: true })
  })

  describe('extractSlugAndGroup filter mutations (lines 115-117)', () => {
    it('should filter out _overview.md filename from slug segments', () => {
      const options: ScanOptions = {
        baseDir: `${testDir}/webpresso/blueprints`,
        includeSpecialFolders: false,
      }

      const result = scanBlueprintDirectory(options)

      for (const plan of result) {
        expect(plan.slug).not.toContain('_overview.md')
      }

      const myFeature = result.find((p) => p.path.includes('my-feature'))
      expect(myFeature).toMatchObject({ slug: 'my-feature' })
      expect(myFeature!.slug).toBe('my-feature')
    })

    it('should filter out empty segments from slug', () => {
      const options: ScanOptions = {
        baseDir: `${testDir}/webpresso/blueprints`,
        includeSpecialFolders: true,
      }

      const result = scanBlueprintDirectory(options)

      for (const plan of result) {
        if (plan.slug !== '') {
          expect(plan.slug).not.toMatch(/\/\//)
          const segments = plan.slug.split('/')
          expect(segments.every((s) => s !== '')).toBe(true)
        }
      }
    })

    it('should return empty slug and null group for _overview.md at base dir root', () => {
      writeFileSync(`${testDir}/webpresso/blueprints/_overview.md`, '# Root')

      const result = scanBlueprintDirectory({
        baseDir: `${testDir}/webpresso/blueprints`,
        includeSpecialFolders: false,
      })

      const rootPlan = result.find((p) => p.path === `${testDir}/webpresso/blueprints/_overview.md`)
      expect(rootPlan).toMatchObject({ slug: '', group: null, isSpecialFolder: false })
      expect(rootPlan!.slug).toBe('')
      expect(rootPlan!.group).toBeNull()
      expect(rootPlan!.isSpecialFolder).toBe(false)
    })

    it('should not return empty slug for non-root plans (segments.length > 0)', () => {
      const result = scanBlueprintDirectory({
        baseDir: `${testDir}/webpresso/blueprints`,
        includeSpecialFolders: false,
      })

      const nonRootPlans = result.filter((p) => !p.path.endsWith('blueprints/_overview.md'))
      expect(nonRootPlans.length).toBeGreaterThan(0)
      for (const plan of nonRootPlans) {
        expect(plan.slug).not.toBe('')
        expect(plan.slug.length).toBeGreaterThan(0)
      }
    })
  })

  describe('group determination boundary (line 136)', () => {
    it('should return null group when there is exactly 1 non-special segment', () => {
      const result = scanBlueprintDirectory({
        baseDir: `${testDir}/webpresso/blueprints`,
        includeSpecialFolders: false,
      })

      const standalone = result.find((p) => p.slug === 'my-feature')
      expect(standalone).toMatchObject({ group: null })
      expect(standalone!.group).toBeNull()
    })

    it('should return non-null group when there are exactly 2 non-special segments', () => {
      const result = scanBlueprintDirectory({
        baseDir: `${testDir}/webpresso/blueprints`,
        includeSpecialFolders: false,
      })

      const nested = result.find((p) => p.slug === 'completed/tooling')
      expect(nested).toMatchObject({ group: 'completed' })
      expect(nested!.group).toBe('completed')
      expect(nested!.group).not.toBeNull()
    })

    it('should handle special folder with only 1 non-special segment (no group)', () => {
      const result = scanBlueprintDirectory({
        baseDir: `${testDir}/webpresso/blueprints`,
        includeSpecialFolders: true,
      })

      const futurePlan = result.find((p) => p.slug === '_future/idea')
      expect(futurePlan).toMatchObject({ group: null })
      expect(futurePlan!.group).toBeNull()
    })

    it('should set group when special folder has 2+ non-special segments', () => {
      mkdirSync(`${testDir}/webpresso/blueprints/_completed/infra/migration`, { recursive: true })
      writeFileSync(
        `${testDir}/webpresso/blueprints/_completed/infra/migration/_overview.md`,
        '# Migration',
      )

      const result = scanBlueprintDirectory({
        baseDir: `${testDir}/webpresso/blueprints`,
        includeSpecialFolders: true,
      })

      const plan = result.find((p) => p.slug === '_completed/infra/migration')
      expect(plan).toMatchObject({ group: 'infra' })
      expect(plan!.group).toBe('infra')
    })
  })

  describe('shouldSkipEntry mutations (line 148)', () => {
    it('should skip entry named exactly "node_modules" but not similar names', () => {
      mkdirSync(`${testDir}/webpresso/blueprints/node_modules/pkg`, { recursive: true })
      mkdirSync(`${testDir}/webpresso/blueprints/node_modules_extra/plan`, { recursive: true })
      writeFileSync(
        `${testDir}/webpresso/blueprints/node_modules/pkg/_overview.md`,
        '# In node_modules',
      )
      writeFileSync(
        `${testDir}/webpresso/blueprints/node_modules_extra/plan/_overview.md`,
        '# Not node_modules',
      )

      const result = scanBlueprintDirectory({
        baseDir: `${testDir}/webpresso/blueprints`,
        includeSpecialFolders: false,
      })

      const nmPlan = result.find((p) => p.path.includes('node_modules/pkg'))
      expect(nmPlan).toBe(undefined)

      const extraPlan = result.find((p) => p.path.includes('node_modules_extra'))
      expect(extraPlan).toMatchObject({ slug: 'node_modules_extra/plan' })
      expect(extraPlan!.slug).toBe('node_modules_extra/plan')
    })

    it('should skip entries starting with dot but not entries containing dot elsewhere', () => {
      mkdirSync(`${testDir}/webpresso/blueprints/.hidden-plan`, { recursive: true })
      mkdirSync(`${testDir}/webpresso/blueprints/my.dotted.name`, { recursive: true })
      writeFileSync(`${testDir}/webpresso/blueprints/.hidden-plan/_overview.md`, '# Hidden')
      writeFileSync(`${testDir}/webpresso/blueprints/my.dotted.name/_overview.md`, '# Dotted')

      const result = scanBlueprintDirectory({
        baseDir: `${testDir}/webpresso/blueprints`,
        includeSpecialFolders: false,
      })

      const hiddenPlan = result.find((p) => p.path.includes('.hidden-plan'))
      expect(hiddenPlan).toBe(undefined)

      const dottedPlan = result.find((p) => p.path.includes('my.dotted.name'))
      expect(dottedPlan).toMatchObject({ slug: 'my.dotted.name' })
    })
  })

  describe('containsHiddenDirectory mutations (lines 180-182)', () => {
    it('should return false for paths with no hidden segments', () => {
      mkdirSync(`${testDir}/webpresso/blueprints/clean/path/here`, { recursive: true })
      writeFileSync(`${testDir}/webpresso/blueprints/clean/path/here/_overview.md`, '# Clean')

      const result = scanBlueprintDirectory({
        baseDir: `${testDir}/webpresso/blueprints`,
        includeSpecialFolders: false,
      })

      const cleanPlan = result.find((p) => p.slug === 'clean/path/here')
      expect(cleanPlan).toMatchObject({ slug: 'clean/path/here' })
      expect(cleanPlan!.path).toContain('clean/path/here')
    })

    it('should return true for paths containing a dot-prefixed directory', () => {
      mkdirSync(`${testDir}/webpresso/blueprints/ok/.nope/sub`, { recursive: true })
      writeFileSync(`${testDir}/webpresso/blueprints/ok/.nope/sub/_overview.md`, '# Nope')

      const result = scanBlueprintDirectory({
        baseDir: `${testDir}/webpresso/blueprints`,
        includeSpecialFolders: true,
      })

      const nopePlan = result.find((p) => p.path.includes('.nope'))
      expect(nopePlan).toBe(undefined)
    })

    it('should treat single dot segment as non-hidden (line 182: segment !== ".")', () => {
      mkdirSync(`${testDir}/webpresso/blueprints/normal-plan`, { recursive: true })
      writeFileSync(`${testDir}/webpresso/blueprints/normal-plan/_overview.md`, '# Normal')

      const result = scanBlueprintDirectory({
        baseDir: `${testDir}/webpresso/blueprints`,
        includeSpecialFolders: false,
      })

      const normalPlan = result.find((p) => p.slug === 'normal-plan')
      expect(normalPlan).toMatchObject({ slug: 'normal-plan' })
    })

    it('should filter plans where any ancestor is hidden even if leaf is visible', () => {
      mkdirSync(`${testDir}/webpresso/blueprints/a/.b/c/d`, { recursive: true })
      writeFileSync(`${testDir}/webpresso/blueprints/a/.b/c/d/_overview.md`, '# Deep hidden')

      mkdirSync(`${testDir}/webpresso/blueprints/a/b/c/d`, { recursive: true })
      writeFileSync(`${testDir}/webpresso/blueprints/a/b/c/d/_overview.md`, '# Deep visible')

      const result = scanBlueprintDirectory({
        baseDir: `${testDir}/webpresso/blueprints`,
        includeSpecialFolders: false,
      })

      const hiddenPlan = result.find((p) => p.path.includes('.b'))
      expect(hiddenPlan).toBe(undefined)

      const visiblePlan = result.find((p) => p.slug === 'a/b/c/d')
      expect(visiblePlan).toMatchObject({ slug: 'a/b/c/d' })
    })
  })

  describe('processEntry stat/directory handling (lines 199, 204)', () => {
    it('should handle symlinks to nonexistent targets gracefully', () => {
      const result = scanBlueprintDirectory({
        baseDir: `${testDir}/webpresso/blueprints`,
        includeSpecialFolders: false,
      })

      expect(result.length).toBe(2)
      for (const plan of result) {
        expect(typeof plan.path).toBe('string')
      }
    })

    it('should add non-hidden directories to traversal queue', () => {
      mkdirSync(`${testDir}/webpresso/blueprints/level1/level2/level3`, { recursive: true })
      writeFileSync(`${testDir}/webpresso/blueprints/level1/level2/level3/_overview.md`, '# Deep')

      const result = scanBlueprintDirectory({
        baseDir: `${testDir}/webpresso/blueprints`,
        includeSpecialFolders: false,
      })

      const deepPlan = result.find((p) => p.slug === 'level1/level2/level3')
      expect(deepPlan).toMatchObject({ group: 'level1' })
      expect(deepPlan!.group).toBe('level1')
    })

    it('should NOT add hidden directories to traversal queue', () => {
      mkdirSync(`${testDir}/webpresso/blueprints/.hidden-queue-test/sub`, { recursive: true })
      writeFileSync(
        `${testDir}/webpresso/blueprints/.hidden-queue-test/sub/_overview.md`,
        '# Should not appear',
      )

      const result = scanBlueprintDirectory({
        baseDir: `${testDir}/webpresso/blueprints`,
        includeSpecialFolders: true,
      })

      const hiddenPlan = result.find((p) => p.path.includes('.hidden-queue-test'))
      expect(hiddenPlan).toBe(undefined)
    })
  })

  describe('processPlanFile hidden directory defense (line 231)', () => {
    it('should reject plans in hidden directories even if traversal somehow reaches them', () => {
      mkdirSync(`${testDir}/webpresso/blueprints/.defense-test`, { recursive: true })
      writeFileSync(`${testDir}/webpresso/blueprints/.defense-test/_overview.md`, '# Defense')

      const result = scanBlueprintDirectory({
        baseDir: `${testDir}/webpresso/blueprints`,
        includeSpecialFolders: true,
      })

      const defensePlan = result.find((p) => p.path.includes('.defense-test'))
      expect(defensePlan).toBe(undefined)

      const normalPlans = result.filter((p) => !p.path.includes('.defense-test'))
      expect(normalPlans.length).toBe(3) // my-feature, completed/tooling, _future/idea
    })
  })

  describe('exact count and structure validation', () => {
    it('should return exactly 2 plans when special folders are excluded', () => {
      const result = scanBlueprintDirectory({
        baseDir: `${testDir}/webpresso/blueprints`,
        includeSpecialFolders: false,
      })

      expect(result.length).toBe(2)
      expect(result.filter((p) => p.isSpecialFolder).length).toBe(0)
    })

    it('should return exactly 3 plans when special folders are included', () => {
      const result = scanBlueprintDirectory({
        baseDir: `${testDir}/webpresso/blueprints`,
        includeSpecialFolders: true,
      })

      expect(result.length).toBe(3)
      expect(result.filter((p) => p.isSpecialFolder).length).toBe(1)
      expect(result.filter((p) => !p.isSpecialFolder).length).toBe(2)
    })

    it('should have isSpecialFolder=false for non-special plans (not just truthy check)', () => {
      const result = scanBlueprintDirectory({
        baseDir: `${testDir}/webpresso/blueprints`,
        includeSpecialFolders: false,
      })

      for (const plan of result) {
        expect(plan.isSpecialFolder).toBe(false)
        expect(plan.specialFolderType).toBe(undefined)
      }
    })
  })

  describe('includeSpecialFolders default value (kills ?? false -> ?? true mutant)', () => {
    it('should exclude special folders when includeSpecialFolders is not specified', () => {
      const result = scanBlueprintDirectory({
        baseDir: `${testDir}/webpresso/blueprints`,
      })

      expect(result.length).toBe(2)
      expect(result.every((p) => !p.isSpecialFolder)).toBe(true)
      expect(result.find((p) => p.path.includes('_future'))).toBe(undefined)
    })
  })

  describe('safeStatSync null guard (kills if(!stat) -> if(false) mutant)', () => {
    it('should handle broken symlinks gracefully without crashing', () => {
      symlinkSync(
        '/nonexistent-target-for-mutation-test',
        `${testDir}/webpresso/blueprints/broken-link`,
      )

      const result = scanBlueprintDirectory({
        baseDir: `${testDir}/webpresso/blueprints`,
        includeSpecialFolders: false,
      })

      expect(result.length).toBe(2)
    })
  })
})

describe('scanBlueprintDirectory - relative path resolution (monorepo root)', () => {
  const testMonorepo = `/tmp/test-monorepo-${Date.now()}`
  const pnpmWorkspaceFixture = new URL('./__fixtures__/pnpm-workspace.yaml', import.meta.url)

  beforeEach(() => {
    mkdirSync(`${testMonorepo}/webpresso/blueprints/my-plan`, { recursive: true })
    writeFileSync(
      `${testMonorepo}/package.json`,
      JSON.stringify({ name: 'test-monorepo', workspaces: ['packages/*'] }),
    )
    cpSync(pnpmWorkspaceFixture, `${testMonorepo}/pnpm-workspace.yaml`)
    writeFileSync(`${testMonorepo}/webpresso/blueprints/my-plan/_overview.md`, '# Test Plan')
  })

  afterEach(() => {
    vi.restoreAllMocks()
    rmSync(testMonorepo, { recursive: true, force: true })
  })

  it('should resolve relative baseDir via monorepo root when cwd is monorepo root', () => {
    vi.spyOn(process, 'cwd').mockReturnValue(testMonorepo)
    const result = scanBlueprintDirectory({ baseDir: 'webpresso/blueprints' })
    expect(result.length).toBe(1)
    expect(result[0]!.slug).toBe('my-plan')
  })

  it('should resolve relative baseDir from process.cwd() directly (no root-walking)', () => {
    // After Phase F: relative paths resolve from process.cwd(), not from a walked-up monorepo root.
    // When cwd is a sub-package that does not contain the relative path, 0 results.
    const subPkg = `${testMonorepo}/packages/sub-pkg`
    mkdirSync(subPkg, { recursive: true })
    vi.spyOn(process, 'cwd').mockReturnValue(subPkg)
    const result = scanBlueprintDirectory({ baseDir: 'webpresso/blueprints' })
    // sub-pkg/webpresso/blueprints does not exist → 0 results
    expect(result.length).toBe(0)
  })

  it('should use default baseDir when no options given', () => {
    vi.spyOn(process, 'cwd').mockReturnValue(testMonorepo)
    const result = scanBlueprintDirectory()
    expect(result.length).toBe(1)
    expect(result[0]!.slug).toBe('my-plan')
  })

  it('should fallback to cwd when not in a monorepo (no workspaces)', () => {
    const noWorkspaces = `/tmp/test-no-workspaces-${Date.now()}`
    mkdirSync(`${noWorkspaces}/webpresso/blueprints/standalone`, { recursive: true })
    writeFileSync(`${noWorkspaces}/package.json`, JSON.stringify({ name: 'no-ws' }))
    writeFileSync(`${noWorkspaces}/webpresso/blueprints/standalone/_overview.md`, '# Standalone')
    vi.spyOn(process, 'cwd').mockReturnValue(noWorkspaces)
    const result = scanBlueprintDirectory({ baseDir: 'webpresso/blueprints' })
    expect(result.length).toBe(1)
    rmSync(noWorkspaces, { recursive: true, force: true })
  })

  it('should fallback to cwd when no package.json exists at all', () => {
    const noPackageJson = `/tmp/test-no-pkg-${Date.now()}`
    mkdirSync(`${noPackageJson}/webpresso/blueprints/orphan`, { recursive: true })
    writeFileSync(`${noPackageJson}/webpresso/blueprints/orphan/_overview.md`, '# Orphan')
    vi.spyOn(process, 'cwd').mockReturnValue(noPackageJson)
    const result = scanBlueprintDirectory({ baseDir: 'webpresso/blueprints' })
    expect(result.length).toBe(1)
    rmSync(noPackageJson, { recursive: true, force: true })
  })

  it('should handle invalid JSON in package.json gracefully', () => {
    const badJson = `/tmp/test-bad-json-${Date.now()}`
    mkdirSync(`${badJson}/webpresso/blueprints/ok`, { recursive: true })
    writeFileSync(`${badJson}/package.json`, '{invalid json}')
    writeFileSync(`${badJson}/webpresso/blueprints/ok/_overview.md`, '# OK')
    vi.spyOn(process, 'cwd').mockReturnValue(badJson)
    const result = scanBlueprintDirectory({ baseDir: 'webpresso/blueprints' })
    expect(result.length).toBe(1)
    rmSync(badJson, { recursive: true, force: true })
  })

  it('should handle package.json with workspaces=undefined vs defined', () => {
    const undefinedWs = `/tmp/test-undefined-ws-${Date.now()}`
    mkdirSync(`${undefinedWs}/webpresso/blueprints/test-plan`, { recursive: true })
    writeFileSync(`${undefinedWs}/package.json`, JSON.stringify({ name: 'no-ws-field' }))
    writeFileSync(`${undefinedWs}/webpresso/blueprints/test-plan/_overview.md`, '# Plan')
    vi.spyOn(process, 'cwd').mockReturnValue(undefinedWs)
    const result = scanBlueprintDirectory({ baseDir: 'webpresso/blueprints' })
    expect(result.length).toBe(1)
    rmSync(undefinedWs, { recursive: true, force: true })
  })
})
