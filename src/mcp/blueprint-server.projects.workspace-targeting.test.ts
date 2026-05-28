import { existsSync, mkdtempSync, mkdirSync, realpathSync, rmSync, writeFileSync } from 'node:fs'
import path from 'node:path'
import { tmpdir } from 'node:os'

import { afterEach, describe, expect, it } from 'vitest'

import { createProjectResolver } from '#project-resolver.js'

import { callTool, makeRegistrar, parseResult, VALID_BLUEPRINT } from './blueprint-server.test-harness.js'
import { registerBlueprintServer, registerBlueprintTools } from './blueprint-server.js'

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
    const ancestorRepo = mkdtempSync(path.join(tmpdir(), 'wp-bp-workspace-ancestor-'))
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
    writeFileSync(path.join(framework, 'package.json'), JSON.stringify({ name: 'framework' }), 'utf8')
    writeFileSync(path.join(framework, 'blueprints', 'draft', 'two.md'), '# two\n')

    const { registrar, tools } = makeRegistrar()
    await registerBlueprintServer(registrar, {
      cwd: workspaceDir,
      existingToolNames: new Set(),
    })

    const result = await callTool(tools, 'wp_blueprint_projects', { scope: 'current' })
    const data = parseResult<{ projects: Array<{ worktree_path: string }> }>(result)

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
    const ancestorRepo = mkdtempSync(path.join(tmpdir(), 'wp-bp-workspace-target-'))
    cleanups.push(ancestorRepo)
    mkdirSync(path.join(ancestorRepo, '.git'), { recursive: true })

    const workspaceDir = path.join(ancestorRepo, 'webpresso')
    mkdirSync(workspaceDir, { recursive: true })

    const monorepo = path.join(workspaceDir, 'monorepo')
    mkdirSync(path.join(monorepo, '.agent'), { recursive: true })
    writeFileSync(path.join(monorepo, 'package.json'), JSON.stringify({ name: 'monorepo' }), 'utf8')

    const { registrar, tools } = makeRegistrar()
    await registerBlueprintTools(registrar, workspaceDir)

    const createResult = await callTool(tools, 'wp_blueprint_create', {
      project_id: monorepo,
      title: 'Nested Repo Blueprint',
      goal: 'Verify explicit project targeting inside a workspace container',
    })
    const created = parseResult<{ slug: string; path: string }>(createResult)

    expect(created.slug).toBe('nested-repo-blueprint')
    expect(created.path).toContain(path.join('monorepo', 'blueprints', 'draft'))
    expect(existsSync(created.path)).toBe(true)
  })

  it('explicit project_id routes get through the targeted nested repo', async () => {
    const ancestorRepo = mkdtempSync(path.join(tmpdir(), 'wp-bp-workspace-target-get-'))
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

    const { registrar, tools } = makeRegistrar()
    await registerBlueprintTools(registrar, workspaceDir)

    const getResult = await callTool(tools, 'wp_blueprint_get', {
      project_id: monorepo,
      slug,
    })
    const fetched = parseResult<{
      blueprint: { slug: string } | null
      failures: string[]
    }>(getResult)

    expect(fetched.failures).toStrictEqual([])
    expect(fetched.blueprint?.slug).toBe(slug)
  })

  it('wp_blueprint_projects warms a recent project cache for explicit project_id lookups from another cwd', async () => {
    const ancestorRepo = mkdtempSync(path.join(tmpdir(), 'wp-bp-workspace-cache-'))
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
    const projectsPayload = parseResult<{
      projects: Array<{ project_id: string; worktree_path: string }>
    }>(projectsResult)
    const warmedProject = projectsPayload.projects.find(
      (project) => project.worktree_path === realpathSync(monorepo),
    )
    expect(warmedProject?.project_id).toBeTruthy()

    const unrelatedCwd = mkdtempSync(path.join(tmpdir(), 'wp-bp-unrelated-cwd-'))
    cleanups.push(unrelatedCwd)

    const { registrar, tools } = makeRegistrar()
    await registerBlueprintTools(registrar, unrelatedCwd, sharedResolver)

    const getResult = await callTool(tools, 'wp_blueprint_get', {
      project_id: warmedProject?.project_id,
      slug,
    })
    const fetched = parseResult<{
      blueprint: { slug: string } | null
      failures: string[]
    }>(getResult)

    expect(fetched.failures).toStrictEqual([])
    expect(fetched.blueprint?.slug).toBe(slug)
  })
})
