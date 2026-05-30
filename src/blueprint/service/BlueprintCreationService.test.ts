import { mkdir, readFile, rm, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import path from 'node:path'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'

import { parseBlueprint } from '#index'

import { BlueprintCreationService } from './BlueprintCreationService.js'

// Resolve package root relative to this test file's location (src/blueprint/service/ → ../../..)
const packageRoot = new URL('../../../', import.meta.url).pathname

describe('BlueprintCreationService', () => {
  let projectRoot: string
  const templatePath = path.join(packageRoot, 'docs', 'templates', 'blueprint.md')

  beforeEach(async () => {
    projectRoot = path.join(
      tmpdir(),
      '.test-blueprint-creation-service',
      `${Date.now()}-${Math.random().toString(36).slice(2)}`,
    )
    await mkdir(path.join(projectRoot, 'webpresso', 'blueprints'), { recursive: true })
  })

  afterEach(async () => {
    await rm(projectRoot, { recursive: true, force: true })
  })

  it('renders deterministic blueprint markdown from goal-only input', async () => {
    const service = new BlueprintCreationService(projectRoot, { templatePath })

    const draft = await service.compileDraft({
      complexity: 'L',
      goal: ' Unify the blueprint creation command ',
    })

    expect(draft.title).toBe('Unify the blueprint creation command')
    expect(draft.slug).toBe('unify-the-blueprint-creation-command')
    expect(draft.outputPath).toBe(
      path.join(
        projectRoot,
        'webpresso',
        'blueprints',
        'draft',
        'unify-the-blueprint-creation-command.md',
      ),
    )
    expect(draft.markdown).toContain('# Unify the blueprint creation command')
    expect(draft.markdown).toContain('**Goal:** Unify the blueprint creation command')
    expect(draft.markdown.match(/\*\*Status:\*\*\s*todo/g)).toHaveLength(2)
    expect(draft.markdown).not.toContain('For Claude')

    const parsed = parseBlueprint(draft.markdown, `draft/${draft.slug}`)
    expect(parsed.title).toBe('Unify the blueprint creation command')
    expect(parsed.complexity).toBe('L')
  })

  it('renders a parent-roadmap stub when type is parent-roadmap', async () => {
    const service = new BlueprintCreationService(projectRoot, { templatePath })

    const draft = await service.compileDraft({
      complexity: 'M',
      goal: 'Roadmap for launch sequencing',
      type: 'parent-roadmap',
    })

    expect(draft.type).toBe('parent-roadmap')
    expect(draft.markdown).toContain('type: parent-roadmap')
    expect(draft.markdown).toContain('# Roadmap for launch sequencing')
    expect(draft.markdown).toContain('--type parent-roadmap')

    const parsed = parseBlueprint(draft.markdown, `draft/${draft.slug}`)
    expect(parsed.type).toBe('parent-roadmap')
    expect(parsed.tasks).toEqual([])
  })

  it('suffixes the slug when a blueprint with the same tail already exists', async () => {
    const service = new BlueprintCreationService(projectRoot, { templatePath })
    const existingDir = path.join(
      projectRoot,
      'webpresso',
      'blueprints',
      'in-progress',
      'unify-the-blueprint-creation-command',
    )
    await mkdir(existingDir, { recursive: true })
    await writeFile(
      path.join(existingDir, '_overview.md'),
      `---
type: blueprint
status: in-progress
complexity: M
created: 2026-04-02
last_updated: 2026-04-02
---

# Existing

### Phase 1: Existing [Complexity: S]

#### Task 1.1: Existing task

**Status:** todo
`,
    )

    const draft = await service.compileDraft({
      complexity: 'M',
      goal: 'Unify the blueprint creation command',
    })

    expect(draft.slug).toBe('unify-the-blueprint-creation-command-2')
  })

  it('writes a flat draft file by default', async () => {
    const service = new BlueprintCreationService(projectRoot, { templatePath })

    const created = await service.create({
      complexity: 'M',
      goal: 'Ship flat blueprint drafts by default',
    })

    expect(created.relativeFilePath).toBe('webpresso/blueprints/draft/ship-flat-blueprint-drafts-by-default.md')
    await expect(readFile(created.outputPath, 'utf-8')).resolves.toContain(
      '# Ship flat blueprint drafts by default',
    )
  })

  it('treats an existing flat blueprint as a slug collision', async () => {
    const service = new BlueprintCreationService(projectRoot, { templatePath })
    await mkdir(path.join(projectRoot, 'webpresso', 'blueprints', 'planned'), { recursive: true })
    await writeFile(
      path.join(
        projectRoot,
        'webpresso',
        'blueprints',
        'planned',
        'ship-flat-blueprint-drafts-by-default.md',
      ),
      `---
type: blueprint
status: planned
complexity: S
created: 2026-04-02
last_updated: 2026-04-02
---

# Existing

#### Task 1.1: Existing task

**Status:** todo
`,
    )

    const draft = await service.compileDraft({
      complexity: 'M',
      goal: 'Ship flat blueprint drafts by default',
    })

    expect(draft.slug).toBe('ship-flat-blueprint-drafts-by-default-2')
  })

  it('embeds a planning summary instead of relying on external OMX plan artifacts', async () => {
    const service = new BlueprintCreationService(projectRoot, { templatePath })

    const draft = await service.compileDraft({
      complexity: 'XL',
      goal: 'Unify the blueprint creation command',
    })

    expect(draft.markdown).toContain('## Planning Summary')
    expect(draft.markdown).toContain('- Goal input: `Unify the blueprint creation command`')
    expect(draft.markdown).toContain('- Complexity: `XL`')
    expect(draft.markdown).toContain('- Draft slug: `unify-the-blueprint-creation-command`')
    expect(draft.markdown).toContain(
      '- Generated command: `wp blueprint new "Unify the blueprint creation command" --complexity XL`',
    )
    expect(draft.markdown).not.toContain('.omx/plans')
  })

  it('rejects empty and whitespace-only goals', async () => {
    const service = new BlueprintCreationService(projectRoot, { templatePath })

    await expect(service.compileDraft({ complexity: 'S', goal: '   ' })).rejects.toThrow(
      'Blueprint goal must not be empty or whitespace.',
    )
  })

  it('rejects reserved and invalid derived slugs', async () => {
    const service = new BlueprintCreationService(projectRoot, { templatePath })

    await expect(service.compileDraft({ complexity: 'S', goal: 'draft' })).rejects.toThrow(
      /reserved.+draft|draft.+reserved/i,
    )
    await expect(service.compileDraft({ complexity: 'S', goal: '!!!' })).rejects.toThrow(
      /converted into a valid slug|slug can be derived/i,
    )
  })

  it('keeps the canonical template free of agent-specific directives and task-status-explicit', async () => {
    const template = await readFile(templatePath, 'utf-8')

    expect(template).not.toContain('For Claude')

    const taskCount = Array.from(template.matchAll(/^####\s+Task\s+\d+(?:\.\d+)+:/gm)).length
    const explicitStatusCount = Array.from(template.matchAll(/\*\*Status:\*\*\s*todo/gm)).length

    expect(taskCount).toBeGreaterThan(0)
    expect(explicitStatusCount).toBe(taskCount)
  })
})
