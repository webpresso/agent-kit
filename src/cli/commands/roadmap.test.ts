import { cac } from 'cac'
import type { ShowBlueprintResult } from './blueprint/router.js'

import { afterEach, describe, expect, it, vi } from 'vitest'

vi.mock('./blueprint/router.js', async () => {
  const actual = await vi.importActual<typeof import('./blueprint/router.js')>('./blueprint/router.js')
  return {
    ...actual,
    listBlueprints: vi.fn(),
    showBlueprint: vi.fn(),
  }
})

import { listBlueprints, showBlueprint } from './blueprint/router.js'
import { assertParentRoadmap, formatRoadmapDetails, registerRoadmapCommand } from './roadmap.js'

function buildResult(type: 'blueprint' | 'parent-roadmap', slug = 'demo'): ShowBlueprintResult {
  return {
    blueprint: {
      type,
      name: slug,
      title: slug,
      status: 'draft',
      complexity: 'S',
      lastUpdated: '2026-05-04',
      tasks: [],
      phases: [],
      raw: `# ${slug}`,
    },
    location: {
      path: '/tmp/demo/_overview.md',
      projectRoot: '/tmp',
    },
    slug,
  }
}

describe('assertParentRoadmap', () => {
  it('returns parent-roadmap results unchanged', () => {
    const result = buildResult('parent-roadmap')
    expect(assertParentRoadmap(result)).toBe(result)
  })

  it('rejects non-roadmap blueprint results', () => {
    expect(() => assertParentRoadmap(buildResult('blueprint'))).toThrow(
      /not type=parent-roadmap/,
    )
  })
})

describe('formatRoadmapDetails', () => {
  it('includes child rows and blocker callouts', () => {
    const parent = buildResult('parent-roadmap', 'roadmap-a')
    const child = buildResult('blueprint', 'child-a')
    child.blueprint.status = 'in-progress'
    child.blueprint.tasks = [
      {
        acceptanceCriteria: { checked: 0, total: 1 },
        blockedReason: 'waiting on API',
        id: '1.1',
        status: 'blocked',
        title: 'Wire child',
        stepType: 'task',
      },
    ]

    const output = formatRoadmapDetails(parent, [child])

    expect(output).toContain('children:')
    expect(output).toContain('- child-a status=in-progress tasks=0/1 done')
    expect(output).toContain('blockers:')
    expect(output).toContain('- child-a Task 1.1: waiting on API')
  })
})

describe('registerRoadmapCommand', () => {
  afterEach(() => {
    vi.restoreAllMocks()
    vi.mocked(listBlueprints).mockReset()
    vi.mocked(showBlueprint).mockReset()
  })

  it('routes roadmap list through the roadmap-only list surface', async () => {
    vi.mocked(listBlueprints).mockResolvedValue([
      {
        name: 'draft/roadmap-a',
        title: 'Roadmap A',
        status: 'draft',
        complexity: 'M',
        progress: 0,
        taskCount: 0,
        type: 'parent-roadmap',
      },
    ])
    const cli = cac('ak')
    registerRoadmapCommand(cli)
    const logSpy = vi.spyOn(console, 'log').mockImplementation(() => {})

    cli.parse(['node', 'ak', 'roadmap', 'list', '--json'], { run: false })
    await cli.runMatchedCommand()

    expect(listBlueprints).toHaveBeenCalledWith(
      expect.objectContaining({ json: true, onlyRoadmaps: true, status: undefined }),
    )
    expect(logSpy).toHaveBeenCalled()
  })

  it('routes roadmap show for parent roadmaps', async () => {
    vi.mocked(showBlueprint).mockResolvedValue(buildResult('parent-roadmap'))
    vi.mocked(listBlueprints).mockResolvedValue([
      {
        name: 'demo',
        title: 'Demo',
        status: 'draft',
        complexity: 'S',
        progress: 0,
        taskCount: 0,
        type: 'parent-roadmap',
      },
    ])
    const cli = cac('ak')
    registerRoadmapCommand(cli)
    const logSpy = vi.spyOn(console, 'log').mockImplementation(() => {})

    cli.parse(['node', 'ak', 'roadmap', 'show', 'demo'], { run: false })
    await cli.runMatchedCommand()

    expect(showBlueprint).toHaveBeenCalledWith('demo', { json: undefined, projectRoot: undefined })
    expect(listBlueprints).toHaveBeenCalledWith({ projectRoot: undefined })
    expect(logSpy).toHaveBeenCalled()
  })

  it('rejects roadmap show for non-roadmap blueprints', async () => {
    vi.mocked(showBlueprint).mockResolvedValue(buildResult('blueprint'))
    const cli = cac('ak')
    registerRoadmapCommand(cli)

    cli.parse(['node', 'ak', 'roadmap', 'show', 'demo'], { run: false })

    await expect(cli.runMatchedCommand()).rejects.toThrow(/not type=parent-roadmap/)
  })
})
