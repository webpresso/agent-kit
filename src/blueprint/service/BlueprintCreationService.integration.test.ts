import { existsSync } from 'node:fs'
import { mkdir, readFile, readdir, rm, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import path from 'node:path'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'

import { BlueprintCreationService } from './BlueprintCreationService.js'

describe('BlueprintCreationService integration', () => {
  let projectRoot: string

  beforeEach(async () => {
    projectRoot = path.join(
      tmpdir(),
      '.test-blueprint-creation-integration',
      `${Date.now()}-${Math.random().toString(36).slice(2)}`,
    )
    await mkdir(path.join(projectRoot, 'webpresso', 'blueprints'), { recursive: true })
  })

  afterEach(async () => {
    await rm(projectRoot, { recursive: true, force: true })
  })

  it('creates a draft blueprint atomically on disk from the bundled default template', async () => {
    const service = new BlueprintCreationService(projectRoot)

    const created = await service.create({
      complexity: 'M',
      goal: 'Customer runtime contract',
    })

    expect(created.status).toBe('draft')
    expect(existsSync(created.path)).toBe(true)
    expect(created.blueprint.status).toBe('draft')
    expect(created.blueprint.tasks.length).toBeGreaterThan(0)
    expect(await readFile(created.path, 'utf-8')).toContain('# Customer runtime contract')
    expect(created.path).toBe(
      path.join(projectRoot, 'webpresso', 'blueprints', 'draft', 'customer-runtime-contract.md'),
    )
  })

  it('cleans up temporary output when validation fails before rename', async () => {
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
        complexity: 'M',
        goal: 'Broken blueprint template',
      }),
    ).rejects.toThrow('Generated blueprint is missing required section')

    const draftDir = path.join(projectRoot, 'webpresso', 'blueprints', 'draft')
    expect(existsSync(path.join(draftDir, 'broken-blueprint-template'))).toBe(false)
    const entries = existsSync(draftDir) ? await readdir(draftDir) : []
    expect(entries.some((entry) => entry.includes('.tmp-'))).toBe(false)
  })
})
