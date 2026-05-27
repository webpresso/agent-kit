import { mkdtempSync, mkdirSync, writeFileSync, realpathSync, rmSync, existsSync } from 'node:fs'
import path from 'node:path'
import { tmpdir } from 'node:os'

import { afterEach, beforeEach, describe, expect, it } from 'vitest'

import { createProjectResolver } from '#project-resolver.js'

import type { ToolHandler, ToolHandlerResult, ToolRegistrar } from './auto-discover.js'
import { registerBlueprintServer, registerBlueprintTools } from './blueprint-server.js'

type RegisteredTool = { name: string; handler: ToolHandler }

function makeRegistrar(): { registrar: ToolRegistrar; tools: Map<string, RegisteredTool> } {
  const tools = new Map<string, RegisteredTool>()
  const registrar: ToolRegistrar = {
    registerTool(name, _desc, _schema, _outSchema, handler) {
      tools.set(name, { name, handler })
    },
  }
  return { registrar, tools }
}

async function callTool(
  tools: Map<string, { name: string; handler: ToolHandler }>,
  name: string,
  input: unknown,
): Promise<ToolHandlerResult> {
  const tool = tools.get(name)
  if (!tool) throw new Error(`Tool "${name}" not registered`)
  return tool.handler(input)
}

function parseResult(result: ToolHandlerResult): unknown {
  const text = result.content[0]
  if (!text || text.type !== 'text' || typeof text.text !== 'string') {
    throw new Error('Expected text content block')
  }
  return JSON.parse(text.text)
}

const VALID_BLUEPRINT = `---
type: blueprint
title: My Feature Blueprint
status: draft
complexity: M
owner: alice
created: '2026-01-15'
last_updated: '2026-04-01'
---

## Product wedge anchor

- **Stage outcome:** Phase 1 — ship feature X
- **Consuming surface:** /dashboard route
- **New user-visible capability:** Users can see feature X on the dashboard.

## Summary

A well-formed blueprint for testing.

#### Task 1.1: Do the thing

**Status:** todo
**Wave:** 0

**Acceptance:**
- [ ] The thing is done
`

let tmpDir: string
let tools: Map<string, { name: string; handler: ToolHandler }>

beforeEach(async () => {
  tmpDir = mkdtempSync(path.join(tmpdir(), 'ak-bs-projects-test-'))
  mkdirSync(path.join(tmpDir, '.agent'), { recursive: true })
  mkdirSync(path.join(tmpDir, 'blueprints', 'draft'), { recursive: true })
  writeFileSync(path.join(tmpDir, 'package.json'), JSON.stringify({ name: 'test' }), 'utf8')

  const { registrar, tools: registeredTools } = makeRegistrar()
  await registerBlueprintTools(registrar, tmpDir)
  tools = registeredTools
})

afterEach(() => {
  rmSync(tmpDir, { recursive: true, force: true })
})

describe('Task 3.3 — wp_blueprint_list with aggregate scope', () => {
  it('ak_blueprint tool is NOT registered (old facade deleted)', () => {
    expect(tools.has('ak_blueprint')).toBe(false)
  })

  it('wp_blueprint_list with scope: current returns blueprints from single project', async () => {
    await callTool(tools, 'wp_blueprint_create', {
      project_id: tmpDir,
      title: 'Scope Current Blueprint',
      goal: 'Test scope current',
    })
    const result = await callTool(tools, 'wp_blueprint_list', { scope: 'current' })
    expect(result.isError).toStrictEqual(false)
    const data = parseResult(result) as {
      blueprints: Array<{ slug: string }>
      failures: unknown[]
    }
    expect(Array.isArray(data.blueprints)).toBe(true)
    expect(Array.isArray(data.failures)).toBe(true)
    expect(data.blueprints.some((blueprint) => blueprint.slug === 'scope-current-blueprint')).toBe(
      true,
    )
  })

  it('wp_blueprint_list with scope: all returns blueprints and failures array', async () => {
    await callTool(tools, 'wp_blueprint_create', {
      project_id: tmpDir,
      title: 'Scope All Blueprint',
      goal: 'Test scope all aggregate',
    })
    const result = await callTool(tools, 'wp_blueprint_list', { scope: 'all' })
    expect(result.isError).toStrictEqual(false)
    const data = parseResult(result) as {
      blueprints: Array<{ slug: string; project_id: string }>
      failures: unknown[]
      duplicate_slugs: unknown[]
    }
    expect(Array.isArray(data.blueprints)).toBe(true)
    expect(Array.isArray(data.failures)).toBe(true)
    expect(Array.isArray(data.duplicate_slugs)).toBe(true)
    for (const blueprint of data.blueprints) {
      expect(typeof blueprint.project_id).toBe('string')
      expect(blueprint.project_id.length).toBeGreaterThan(0)
    }
  })

  it('wp_blueprint_list with scope: roots returns blueprints and failures array', async () => {
    const result = await callTool(tools, 'wp_blueprint_list', { scope: 'roots' })
    expect(result.isError).toStrictEqual(false)
    const data = parseResult(result) as {
      blueprints: unknown[]
      failures: unknown[]
      duplicate_slugs: unknown[]
    }
    expect(Array.isArray(data.blueprints)).toBe(true)
    expect(Array.isArray(data.failures)).toBe(true)
    expect(Array.isArray(data.duplicate_slugs)).toBe(true)
  })

  it('wp_blueprint_list with scope: workspace returns blueprints and failures array', async () => {
    const result = await callTool(tools, 'wp_blueprint_list', { scope: 'workspace' })
    expect(result.isError).toStrictEqual(false)
    const data = parseResult(result) as {
      blueprints: unknown[]
      failures: unknown[]
      duplicate_slugs: unknown[]
    }
    expect(Array.isArray(data.blueprints)).toBe(true)
    expect(Array.isArray(data.failures)).toBe(true)
    expect(Array.isArray(data.duplicate_slugs)).toBe(true)
  })
})

describe('Task 3.3 — wp_blueprint_get with aggregate scope', () => {
  it('wp_blueprint_get with scope: current (single-project) finds blueprint by directory-derived slug', async () => {
    const localTmpDir = mkdtempSync(path.join(tmpdir(), 'ak-bs-get33-'))
    mkdirSync(path.join(localTmpDir, '.agent'), { recursive: true })
    writeFileSync(path.join(localTmpDir, 'package.json'), JSON.stringify({ name: 'test' }), 'utf8')

    const slug = 'single-scope-test-bp'
    const overviewPath = path.join(localTmpDir, 'blueprints', 'draft', slug, '_overview.md')
    mkdirSync(path.dirname(overviewPath), { recursive: true })
    writeFileSync(overviewPath, VALID_BLUEPRINT, 'utf8')

    const { registrar, tools: localTools } = makeRegistrar()
    await registerBlueprintTools(registrar, localTmpDir)

    try {
      const result = await callTool(localTools, 'wp_blueprint_get', {
        slug,
        scope: 'current',
      })
      expect(result.isError).toStrictEqual(false)
      const data = parseResult(result) as {
        blueprint: { slug: string } | null
        failures: unknown[]
      }
      expect(data.blueprint).not.toBeNull()
      expect(data.blueprint?.slug).toBe(slug)
    } finally {
      rmSync(localTmpDir, { recursive: true, force: true })
    }
  })

  it('wp_blueprint_get with scope: all returns structured response with failures/blueprint fields', async () => {
    const result = await callTool(tools, 'wp_blueprint_get', {
      slug: 'any-slug',
      scope: 'all',
    })
    expect(result.isError).toStrictEqual(false)
    const data = parseResult(result) as Record<string, unknown>
    expect(Array.isArray(data['failures'])).toBe(true)
    expect('blueprint' in data).toBe(true)
    if (data['blueprint'] === null) {
      expect(typeof (data['next_action'] as { kind: string })?.kind).toBe('string')
    }
  })

  it('wp_blueprint_get with scope: all returns disambiguate_slug next_action when slug not found anywhere', async () => {
    const result = await callTool(tools, 'wp_blueprint_get', {
      slug: 'nonexistent-everywhere',
      scope: 'all',
    })
    expect(result.isError).toStrictEqual(false)
    const data = parseResult(result) as {
      blueprint: unknown
      next_action: { kind: string }
      failures: unknown[]
    }
    expect(data.blueprint).toBeNull()
    expect(data.next_action.kind).toBe('disambiguate_slug')
  })

  it('mutation tools still reject scope — wp_blueprint_create ignores scope field', async () => {
    const result = await callTool(tools, 'wp_blueprint_create', {
      project_id: tmpDir,
      title: 'No Scope Mutation',
      goal: 'Verify scope is stripped',
      scope: 'all',
    })
    expect(result.isError).toStrictEqual(false)
    const data = parseResult(result) as Record<string, unknown>
    expect('scope' in data).toBe(false)
  })
})

describe('nested workspace blueprint targeting', () => {
  const cleanups: string[] = []

  afterEach(() => {
    while (cleanups.length > 0) {
      const dir = cleanups.pop()
      if (!dir) continue
      rmSync(dir, { recursive: true, force: true })
    }
  })

  it('wp_blueprint_projects scope=current returns descendant repos instead of the ancestor git container', async () => {
    const ancestorRepo = mkdtempSync(path.join(tmpdir(), 'ak-bp-workspace-ancestor-'))
    cleanups.push(ancestorRepo)
    mkdirSync(path.join(ancestorRepo, '.git'), { recursive: true })

    const workspaceDir = path.join(ancestorRepo, 'webpresso')
    mkdirSync(workspaceDir, { recursive: true })

    const monorepo = path.join(workspaceDir, 'monorepo')
    mkdirSync(path.join(monorepo, 'blueprints', 'planned'), { recursive: true })
    writeFileSync(path.join(monorepo, 'package.json'), JSON.stringify({ name: 'monorepo' }), 'utf8')
    writeFileSync(path.join(monorepo, 'blueprints', 'planned', 'one.md'), '# one\n')

    const framework = path.join(workspaceDir, 'framework')
    mkdirSync(path.join(framework, 'blueprints', 'draft'), { recursive: true })
    writeFileSync(
      path.join(framework, 'package.json'),
      JSON.stringify({ name: 'framework' }),
      'utf8',
    )
    writeFileSync(path.join(framework, 'blueprints', 'draft', 'two.md'), '# two\n')

    const { registrar, tools: localTools } = makeRegistrar()
    await registerBlueprintServer(registrar, {
      cwd: workspaceDir,
      existingToolNames: new Set(),
    })

    const result = await callTool(localTools, 'wp_blueprint_projects', { scope: 'current' })
    const data = parseResult(result) as {
      projects: Array<{ worktree_path: string }>
    }

    expect(data.projects.some((project) => project.worktree_path === realpathSync(monorepo))).toBe(
      true,
    )
    expect(data.projects.some((project) => project.worktree_path === realpathSync(framework))).toBe(
      true,
    )
    expect(
      data.projects.some((project) => project.worktree_path === realpathSync(ancestorRepo)),
    ).toBe(false)
  })

  it('explicit project_id routes create through the targeted nested repo', async () => {
    const ancestorRepo = mkdtempSync(path.join(tmpdir(), 'ak-bp-workspace-target-'))
    cleanups.push(ancestorRepo)
    mkdirSync(path.join(ancestorRepo, '.git'), { recursive: true })

    const workspaceDir = path.join(ancestorRepo, 'webpresso')
    mkdirSync(workspaceDir, { recursive: true })

    const monorepo = path.join(workspaceDir, 'monorepo')
    mkdirSync(path.join(monorepo, '.agent'), { recursive: true })
    writeFileSync(path.join(monorepo, 'package.json'), JSON.stringify({ name: 'monorepo' }), 'utf8')

    const { registrar, tools: localTools } = makeRegistrar()
    await registerBlueprintTools(registrar, workspaceDir)

    const createResult = await callTool(localTools, 'wp_blueprint_create', {
      project_id: monorepo,
      title: 'Nested Repo Blueprint',
      goal: 'Verify explicit project targeting inside a workspace container',
    })
    const created = parseResult(createResult) as { slug: string; path: string }

    expect(created.slug).toBe('nested-repo-blueprint')
    expect(created.path).toContain(path.join('monorepo', 'blueprints', 'draft'))
    expect(existsSync(created.path)).toBe(true)
  })

  it('explicit project_id routes get through the targeted nested repo', async () => {
    const ancestorRepo = mkdtempSync(path.join(tmpdir(), 'ak-bp-workspace-target-get-'))
    cleanups.push(ancestorRepo)
    mkdirSync(path.join(ancestorRepo, '.git'), { recursive: true })

    const workspaceDir = path.join(ancestorRepo, 'webpresso')
    mkdirSync(workspaceDir, { recursive: true })

    const monorepo = path.join(workspaceDir, 'monorepo')
    mkdirSync(path.join(monorepo, '.agent'), { recursive: true })
    writeFileSync(path.join(monorepo, 'package.json'), JSON.stringify({ name: 'monorepo' }), 'utf8')
    const slug = 'nested-existing-blueprint'
    const overviewPath = path.join(monorepo, 'blueprints', 'draft', slug, '_overview.md')
    mkdirSync(path.dirname(overviewPath), { recursive: true })
    writeFileSync(overviewPath, VALID_BLUEPRINT, 'utf8')

    const { registrar: seedRegistrar } = makeRegistrar()
    await registerBlueprintTools(seedRegistrar, monorepo)

    const { registrar, tools: localTools } = makeRegistrar()
    await registerBlueprintTools(registrar, workspaceDir)

    const getResult = await callTool(localTools, 'wp_blueprint_get', {
      project_id: monorepo,
      slug,
    })
    const fetched = parseResult(getResult) as {
      blueprint: { slug: string } | null
      failures: string[]
    }

    expect(fetched.failures).toStrictEqual([])
    expect(fetched.blueprint?.slug).toBe(slug)
  })

  it('wp_blueprint_projects warms a recent project cache for explicit project_id lookups from another cwd', async () => {
    const ancestorRepo = mkdtempSync(path.join(tmpdir(), 'ak-bp-workspace-cache-'))
    cleanups.push(ancestorRepo)
    mkdirSync(path.join(ancestorRepo, '.git'), { recursive: true })

    const workspaceDir = path.join(ancestorRepo, 'webpresso')
    mkdirSync(workspaceDir, { recursive: true })

    const monorepo = path.join(workspaceDir, 'monorepo')
    mkdirSync(path.join(monorepo, '.agent'), { recursive: true })
    writeFileSync(path.join(monorepo, 'package.json'), JSON.stringify({ name: 'monorepo' }), 'utf8')
    const slug = 'cached-project-blueprint'
    const overviewPath = path.join(monorepo, 'blueprints', 'draft', slug, '_overview.md')
    mkdirSync(path.dirname(overviewPath), { recursive: true })
    writeFileSync(overviewPath, VALID_BLUEPRINT, 'utf8')

    const sharedResolver = createProjectResolver()

    const { registrar: seedRegistrar } = makeRegistrar()
    await registerBlueprintTools(seedRegistrar, monorepo)

    const { registrar: warmRegistrar, tools: warmTools } = makeRegistrar()
    await registerBlueprintServer(warmRegistrar, {
      cwd: workspaceDir,
      existingToolNames: new Set(),
      projectResolver: sharedResolver,
    })

    const projectsResult = await callTool(warmTools, 'wp_blueprint_projects', { scope: 'current' })
    const projectsPayload = parseResult(projectsResult) as {
      projects: Array<{ project_id: string; worktree_path: string }>
    }
    const warmedProject = projectsPayload.projects.find(
      (project) => project.worktree_path === realpathSync(monorepo),
    )
    expect(warmedProject?.project_id).toBeTruthy()

    const unrelatedCwd = mkdtempSync(path.join(tmpdir(), 'ak-bp-unrelated-cwd-'))
    cleanups.push(unrelatedCwd)

    const { registrar, tools: cachedTools } = makeRegistrar()
    await registerBlueprintTools(registrar, unrelatedCwd, sharedResolver)

    const getResult = await callTool(cachedTools, 'wp_blueprint_get', {
      project_id: warmedProject?.project_id,
      slug,
    })
    const fetched = parseResult(getResult) as {
      blueprint: { slug: string } | null
      failures: string[]
    }

    expect(fetched.failures).toStrictEqual([])
    expect(fetched.blueprint?.slug).toBe(slug)
  })
})
