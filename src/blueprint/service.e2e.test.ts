/**
 * E2E tests for BlueprintService — scans real blueprints from webpresso/blueprints/.
 *
 * Uses BlueprintService with findRepoRoot() to load actual blueprint files.
 */

import { existsSync } from 'node:fs'
import { mkdir, readdir, rm, writeFile } from 'node:fs/promises'
import path from 'node:path'
import { afterEach, describe, expect, it } from 'vitest'

import { planStatusSchema } from '#core/schema'
import { isValidBlueprintSlug } from '#lifecycle/local'

import { BlueprintCreationService } from './service/BlueprintCreationService.js'
import { BlueprintService } from './service/BlueprintService.js'

// Package root — two levels up from src/blueprint/ (this file's location)
const PROJECT_ROOT = new URL('../../', import.meta.url).pathname
const TEMP_PROJECT_ROOTS: string[] = []

describe('BlueprintService e2e — real blueprints', () => {
  const service = new BlueprintService(PROJECT_ROOT)

  it('lists blueprints from real webpresso/blueprints/ directory', async () => {
    const plans = await service.list()

    expect(plans.length).toBeGreaterThan(0)
  })

  it('every blueprint has slug, status, and complexity', async () => {
    const plans = await service.list()

    for (const plan of plans) {
      expect(plan.name.length, 'slug missing').toBeGreaterThan(0)
      expect(typeof plan.status).toBe('string')
      expect(typeof plan.complexity).toBe('string')
    }
  })

  it('every real blueprint slug uses the normalized slug format', async () => {
    const plans = await service.list()

    for (const plan of plans) {
      expect(isValidBlueprintSlug(plan.name), `invalid blueprint slug on disk: ${plan.name}`).toBe(
        true,
      )
    }
  })

  it('blueprint statuses match directory structure', async () => {
    const plans = await service.list()
    const validStatuses = planStatusSchema.options

    for (const plan of plans) {
      if (!plan.malformed) {
        expect(validStatuses, `unexpected status: ${plan.status}`).toContain(plan.status)
      }
    }
  })

  it('can retrieve a specific blueprint by slug', async () => {
    const plans = await service.list()
    const firstPlan = plans.find((p) => !p.malformed)

    // Skip if no valid plans exist
    if (!firstPlan) return

    const detail = await service.get(firstPlan.name)

    expect(detail.name).toBe(firstPlan.name)
    expect(Array.isArray(detail.tasks)).toBe(true)
    expect(Array.isArray(detail.tasks)).toBe(true)
  })

  it('throws for nonexistent blueprint slug', async () => {
    await expect(service.get('nonexistent-slug-xyz-99999')).rejects.toThrow()
  })

  it('progress is between 0 and 100 for all blueprints', async () => {
    const plans = await service.list()

    for (const plan of plans) {
      expect(plan.progress).toBeGreaterThanOrEqual(0)
      expect(plan.progress).toBeLessThanOrEqual(100)
    }
  })
})

describe('BlueprintCreationService e2e — real template + filesystem', () => {
  afterEach(async () => {
    while (TEMP_PROJECT_ROOTS.length > 0) {
      const projectRoot = TEMP_PROJECT_ROOTS.pop()
      if (projectRoot) {
        await rm(projectRoot, { recursive: true, force: true })
      }
    }
  })

  it('gracefully suffixes collisions while creating a real draft from the canonical template', async () => {
    const projectRoot = path.join(
      PROJECT_ROOT,
      '.test-blueprint-creation-e2e',
      `${Date.now()}-${Math.random().toString(36).slice(2)}`,
    )
    TEMP_PROJECT_ROOTS.push(projectRoot)
    await mkdir(
      path.join(projectRoot, 'webpresso', 'blueprints', 'completed', 'customer-runtime-contract'),
      { recursive: true },
    )
    await writeFile(
      path.join(
        projectRoot,
        'webpresso',
        'blueprints',
        'completed',
        'customer-runtime-contract',
        '_overview.md',
      ),
      `---
type: blueprint
status: completed
complexity: M
created: 2026-04-02
last_updated: 2026-04-02
completed_at: 2026-04-02
---

# Existing blueprint

### Phase 1: Done [Complexity: S]

#### Task 1.1: Existing task

**Status:** done
`,
      'utf-8',
    )

    const service = new BlueprintCreationService(projectRoot, {
      templatePath: path.join(PROJECT_ROOT, 'docs', 'templates', 'blueprint.md'),
    })
    const created = await service.create({
      complexity: 'M',
      goal: 'Customer runtime contract',
    })

    expect(created.slug).toBe('customer-runtime-contract-2')
    expect(created.status).toBe('draft')
    expect(existsSync(created.path)).toBe(true)
    expect(created.markdown).toContain('## Planning Summary')
    expect(created.markdown.match(/\*\*Status:\*\* todo/g)).toHaveLength(2)
  })

  it('fails closed on malformed templates without leaving temp draft artifacts', async () => {
    const projectRoot = path.join(
      PROJECT_ROOT,
      '.test-blueprint-creation-e2e',
      `${Date.now()}-${Math.random().toString(36).slice(2)}`,
    )
    TEMP_PROJECT_ROOTS.push(projectRoot)
    await mkdir(path.join(projectRoot, 'webpresso', 'blueprints'), { recursive: true })

    const invalidTemplatePath = path.join(projectRoot, 'invalid-template.md')
    await writeFile(
      invalidTemplatePath,
      `---
type: blueprint
status: draft
complexity: {{complexity}}
created: '{{date}}'
last_updated: '{{date}}'
---

# {{title}}
`,
      'utf-8',
    )

    const service = new BlueprintCreationService(projectRoot, {
      templatePath: invalidTemplatePath,
    })

    await expect(
      service.create({
        complexity: 'S',
        goal: 'Malformed template guard',
      }),
    ).rejects.toThrow('Generated blueprint is missing required section')

    const draftDir = path.join(projectRoot, 'webpresso', 'blueprints', 'draft')
    expect(existsSync(path.join(draftDir, 'malformed-template-guard'))).toBe(false)
    const entries = existsSync(draftDir) ? await readdir(draftDir) : []
    expect(entries.some((entry) => entry.includes('.tmp-'))).toBe(false)
  })
})
