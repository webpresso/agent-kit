import { mkdirSync, rmSync, writeFileSync } from 'node:fs'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'

import { type ScanOptions, scanBlueprintDirectory } from './scanner.js'

describe('scanBlueprintDirectory - edge cases', () => {
  const testDir = `/tmp/test-blueprints-edge-${Date.now()}`

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

  describe('hidden directory filtering', () => {
    it('should not traverse into .git directories inside the blueprint dir', () => {
      mkdirSync(`${testDir}/webpresso/blueprints/.git/hooks`, { recursive: true })
      writeFileSync(`${testDir}/webpresso/blueprints/.git/hooks/_overview.md`, '# Hidden')

      const options: ScanOptions = {
        baseDir: `${testDir}/webpresso/blueprints`,
        includeSpecialFolders: true,
      }

      const result = scanBlueprintDirectory(options)

      const gitPlan = result.find((p) => p.path.includes('.git'))
      expect(gitPlan).toBe(undefined)

      const normalPlans = result.filter((p) => !p.path.includes('.git'))
      expect(normalPlans.length).toBe(3) // my-feature, completed/tooling, _future/idea
    })

    it('should not traverse into .hidden directories at any nesting level', () => {
      mkdirSync(`${testDir}/webpresso/blueprints/group/.hidden-dir/sub`, { recursive: true })
      writeFileSync(
        `${testDir}/webpresso/blueprints/group/.hidden-dir/sub/_overview.md`,
        '# Hidden nested',
      )

      const options: ScanOptions = {
        baseDir: `${testDir}/webpresso/blueprints`,
        includeSpecialFolders: true,
      }

      const result = scanBlueprintDirectory(options)

      const hiddenPlan = result.find((p) => p.path.includes('.hidden-dir'))
      expect(hiddenPlan).toBe(undefined)
    })

    it('should still include plans from directories that do not start with dot', () => {
      mkdirSync(`${testDir}/webpresso/blueprints/visible-dir`, { recursive: true })
      writeFileSync(`${testDir}/webpresso/blueprints/visible-dir/_overview.md`, '# Visible')

      const options: ScanOptions = {
        baseDir: `${testDir}/webpresso/blueprints`,
        includeSpecialFolders: false,
      }

      const result = scanBlueprintDirectory(options)

      const visiblePlan = result.find((p) => p.path.includes('visible-dir'))
      expect(visiblePlan).toMatchObject({ slug: 'visible-dir' })
      expect(visiblePlan!.slug).toBe('visible-dir')
    })
  })

  describe('node_modules filtering', () => {
    it('should not traverse into node_modules directory inside blueprint dir', () => {
      mkdirSync(`${testDir}/webpresso/blueprints/node_modules/some-pkg`, { recursive: true })
      writeFileSync(
        `${testDir}/webpresso/blueprints/node_modules/some-pkg/_overview.md`,
        '# Pkg Plan',
      )

      const options: ScanOptions = {
        baseDir: `${testDir}/webpresso/blueprints`,
        includeSpecialFolders: true,
      }

      const result = scanBlueprintDirectory(options)

      const nodeModulesPlan = result.find((p) => p.path.includes('node_modules'))
      expect(nodeModulesPlan).toBe(undefined)

      expect(result.length).toBe(3)
    })

    it('should skip entries starting with dot but not skip normal entries', () => {
      mkdirSync(`${testDir}/webpresso/blueprints/.dotdir`, { recursive: true })
      writeFileSync(`${testDir}/webpresso/blueprints/.dotdir/_overview.md`, '# Dot')
      mkdirSync(`${testDir}/webpresso/blueprints/normal-dir`, { recursive: true })
      writeFileSync(`${testDir}/webpresso/blueprints/normal-dir/_overview.md`, '# Normal')

      const options: ScanOptions = {
        baseDir: `${testDir}/webpresso/blueprints`,
        includeSpecialFolders: false,
      }

      const result = scanBlueprintDirectory(options)

      const dotPlan = result.find((p) => p.path.includes('.dotdir'))
      expect(dotPlan).toBe(undefined)

      const normalPlan = result.find((p) => p.path.includes('normal-dir'))
      expect(normalPlan).toMatchObject({ slug: 'normal-dir' })
      expect(normalPlan!.slug).toBe('normal-dir')
    })
  })

  describe('extractSlugAndGroup edge cases', () => {
    it('should return slug with no group for a standalone plan (single segment)', () => {
      const options: ScanOptions = {
        baseDir: `${testDir}/webpresso/blueprints`,
        includeSpecialFolders: false,
      }

      const result = scanBlueprintDirectory(options)

      const standalonePlan = result.find((p) => p.slug === 'my-feature')
      expect(standalonePlan).toMatchObject({ slug: 'my-feature', group: null })
      expect(standalonePlan!.slug).toBe('my-feature')
      expect(standalonePlan!.group).toBeNull()
    })

    it('should return slug with group for a nested plan (two segments)', () => {
      const options: ScanOptions = {
        baseDir: `${testDir}/webpresso/blueprints`,
        includeSpecialFolders: false,
      }

      const result = scanBlueprintDirectory(options)

      const nestedPlan = result.find((p) => p.slug === 'completed/tooling')
      expect(nestedPlan).toMatchObject({ slug: 'completed/tooling', group: 'completed' })
      expect(nestedPlan!.slug).toBe('completed/tooling')
      expect(nestedPlan!.group).toBe('completed')
    })

    it('should handle _deprioritized special folder with nested plan', () => {
      mkdirSync(`${testDir}/webpresso/blueprints/_deprioritized/old-idea`, { recursive: true })
      writeFileSync(
        `${testDir}/webpresso/blueprints/_deprioritized/old-idea/_overview.md`,
        '# Deprioritized',
      )

      const options: ScanOptions = {
        baseDir: `${testDir}/webpresso/blueprints`,
        includeSpecialFolders: true,
      }

      const result = scanBlueprintDirectory(options)

      const deprioPlan = result.find((p) => p.slug === '_deprioritized/old-idea')
      expect(deprioPlan).toMatchObject({
        isSpecialFolder: true,
        specialFolderType: '_deprioritized',
        group: null,
      })
      expect(deprioPlan!.isSpecialFolder).toBe(true)
      expect(deprioPlan!.specialFolderType).toBe('_deprioritized')
      expect(deprioPlan!.group).toBeNull()
    })

    it('should handle special folder with group and initiative (3+ segments)', () => {
      mkdirSync(`${testDir}/webpresso/blueprints/_completed/infra/old-migration`, {
        recursive: true,
      })
      writeFileSync(
        `${testDir}/webpresso/blueprints/_completed/infra/old-migration/_overview.md`,
        '# Old Migration',
      )

      const options: ScanOptions = {
        baseDir: `${testDir}/webpresso/blueprints`,
        includeSpecialFolders: true,
      }

      const result = scanBlueprintDirectory(options)

      const plan = result.find((p) => p.slug === '_completed/infra/old-migration')
      expect(plan).toMatchObject({
        isSpecialFolder: true,
        specialFolderType: '_completed',
        group: 'infra',
      })
      expect(plan!.isSpecialFolder).toBe(true)
      expect(plan!.specialFolderType).toBe('_completed')
      expect(plan!.group).toBe('infra')
    })

    it('should return empty slug for _overview.md directly in baseDir', () => {
      writeFileSync(`${testDir}/webpresso/blueprints/_overview.md`, '# Root Plan')

      const options: ScanOptions = {
        baseDir: `${testDir}/webpresso/blueprints`,
        includeSpecialFolders: false,
      }

      const result = scanBlueprintDirectory(options)

      const rootPlan = result.find((p) => p.path === `${testDir}/webpresso/blueprints/_overview.md`)
      expect(rootPlan).toMatchObject({ slug: '', group: null })
      expect(rootPlan!.slug).toBe('')
      expect(rootPlan!.group).toBeNull()
    })
  })

  describe('processEntry non-overview files', () => {
    it('should ignore non-_overview.md files in blueprint directories', () => {
      writeFileSync(`${testDir}/webpresso/blueprints/my-feature/README.md`, '# Readme')
      writeFileSync(`${testDir}/webpresso/blueprints/my-feature/notes.md`, '# Notes')
      writeFileSync(`${testDir}/webpresso/blueprints/my-feature/plan.md`, '# Not overview')

      const options: ScanOptions = {
        baseDir: `${testDir}/webpresso/blueprints`,
        includeSpecialFolders: false,
      }

      const result = scanBlueprintDirectory(options)

      for (const plan of result) {
        expect(plan.path).toMatch(/_overview\.md$/)
        expect(plan.path).not.toMatch(/README\.md$/)
        expect(plan.path).not.toMatch(/notes\.md$/)
        expect(plan.path).not.toMatch(/plan\.md$/)
      }

      expect(result.length).toBe(2)
    })

    it('should process directories that do not contain _overview.md without adding results', () => {
      mkdirSync(`${testDir}/webpresso/blueprints/empty-dir`, { recursive: true })
      writeFileSync(`${testDir}/webpresso/blueprints/empty-dir/some-other-file.txt`, 'not a plan')

      const options: ScanOptions = {
        baseDir: `${testDir}/webpresso/blueprints`,
        includeSpecialFolders: false,
      }

      const result = scanBlueprintDirectory(options)

      const emptyDirPlan = result.find((p) => p.path.includes('empty-dir'))
      expect(emptyDirPlan).toBe(undefined)

      expect(result.length).toBe(2)
    })
  })

  describe('special folder type assignment', () => {
    it('should set specialFolderType to _future for plans in _future folder', () => {
      const options: ScanOptions = {
        baseDir: `${testDir}/webpresso/blueprints`,
        includeSpecialFolders: true,
      }

      const result = scanBlueprintDirectory(options)

      const futurePlan = result.find((p) => p.path.includes('/_future/'))
      expect(futurePlan).toMatchObject({
        isSpecialFolder: true,
        specialFolderType: '_future',
        slug: '_future/idea',
      })
      expect(futurePlan!.isSpecialFolder).toBe(true)
      expect(futurePlan!.specialFolderType).toBe('_future')
      expect(futurePlan!.slug).toBe('_future/idea')
    })

    it('should NOT set specialFolderType on non-special folder plans', () => {
      const options: ScanOptions = {
        baseDir: `${testDir}/webpresso/blueprints`,
        includeSpecialFolders: true,
      }

      const result = scanBlueprintDirectory(options)

      const normalPlan = result.find((p) => p.slug === 'my-feature')
      expect(normalPlan).toMatchObject({ isSpecialFolder: false })
      expect(normalPlan!.isSpecialFolder).toBe(false)
      expect(normalPlan!.specialFolderType).toBe(undefined)
    })

    it('should set specialFolderType to _completed for _completed folder plans', () => {
      mkdirSync(`${testDir}/webpresso/blueprints/_completed/done-feature`, { recursive: true })
      writeFileSync(
        `${testDir}/webpresso/blueprints/_completed/done-feature/_overview.md`,
        '# Done',
      )

      const options: ScanOptions = {
        baseDir: `${testDir}/webpresso/blueprints`,
        includeSpecialFolders: true,
      }

      const result = scanBlueprintDirectory(options)

      const completedPlan = result.find((p) => p.slug === '_completed/done-feature')
      expect(completedPlan).toMatchObject({
        isSpecialFolder: true,
        specialFolderType: '_completed',
      })
      expect(completedPlan!.isSpecialFolder).toBe(true)
      expect(completedPlan!.specialFolderType).toBe('_completed')
    })

    it('should set specialFolderType to _deprioritized for _deprioritized folder plans', () => {
      mkdirSync(`${testDir}/webpresso/blueprints/_deprioritized/low-prio`, { recursive: true })
      writeFileSync(`${testDir}/webpresso/blueprints/_deprioritized/low-prio/_overview.md`, '# Low')

      const options: ScanOptions = {
        baseDir: `${testDir}/webpresso/blueprints`,
        includeSpecialFolders: true,
      }

      const result = scanBlueprintDirectory(options)

      const deprioPlan = result.find((p) => p.slug === '_deprioritized/low-prio')
      expect(deprioPlan).toMatchObject({
        isSpecialFolder: true,
        specialFolderType: '_deprioritized',
      })
      expect(deprioPlan!.isSpecialFolder).toBe(true)
      expect(deprioPlan!.specialFolderType).toBe('_deprioritized')
    })
  })
})
