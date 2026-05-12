import type { BlueprintAuditResult, BlueprintSummary } from '#local'
import type { BlueprintTemplateEntry } from '#sync/types.js'
import type {
  AdvanceTaskResult,
  BlueprintCommandOptions,
  BlueprintLifecycleMutationResult,
  CreateBlueprintResult,
  ExecuteBlueprintResult,
  MoveBlueprintResult,
  PromoteBlueprintResult,
  ShowBlueprintResult,
} from './router.js'

import { describe, expect, it, vi, afterEach } from 'vitest'

import {
  BlueprintAuditFailedError,
  executeBlueprintSubcommand,
  _setPlatformTemplatesFetcher,
} from './router-dispatch.js'
import { listTemplates, resolveTemplate } from './template-resolver.js'
import type { TemplateEntry } from './template-resolver.js'

vi.mock('./template-resolver.js', () => ({
  listTemplates: vi.fn<(dir?: string) => readonly TemplateEntry[]>(() => []),
  resolveTemplate: vi.fn<(name: string, dir?: string) => string | null>(() => null),
}))

type Deps = Parameters<typeof executeBlueprintSubcommand>[3]

// Shared lifecycle stub — reused across happy-path cases that don't
// need a unique return shape.
const mutationStub: BlueprintLifecycleMutationResult = {
  message: 'updated',
  moved: false,
  progress: '0%',
  slug: 's',
  status: 'todo',
}

const promoteStub: PromoteBlueprintResult = {
  message: 'promoted',
  moved: true,
  newPath: '/tmp/blueprints/in-progress/s/_overview.md',
  newState: 'in-progress',
  oldState: 'planned',
  slug: 's',
}

function buildDeps(overrides: Partial<Deps> = {}): Deps {
  const base: Deps = {
    advanceBlueprintTask: vi.fn<
      (
        slug: string,
        taskId: string,
        toStatus: string,
        options: BlueprintCommandOptions,
      ) => Promise<AdvanceTaskResult>
    >(async () => ({
      blueprintSlug: 's',
      taskId: '1.1',
      oldStatus: 'todo',
      newStatus: 'in-progress',
      message: 'Task 1.1 of s: todo → in-progress',
    })),
    auditBlueprints: vi.fn<(options: BlueprintCommandOptions) => Promise<BlueprintAuditResult>>(
      async () => ({ ok: true, issues: [] }) as BlueprintAuditResult,
    ),
    controlBlueprintExec:
      vi.fn<
        (
          action: 'status' | 'resume' | 'stop',
          slug: string,
          options: BlueprintCommandOptions,
        ) => Promise<ExecuteBlueprintResult>
      >(),
    readBlueprintExecutionLogs:
      vi.fn<(slug: string, options: BlueprintCommandOptions) => Promise<ExecuteBlueprintResult>>(),
    createBlueprint:
      vi.fn<(goal: string, options: BlueprintCommandOptions) => Promise<CreateBlueprintResult>>(),
    executeBlueprint:
      vi.fn<(slug: string, options: BlueprintCommandOptions) => Promise<ExecuteBlueprintResult>>(),
    parkBlueprint: vi.fn<
      (slug: string, options: BlueprintCommandOptions) => Promise<BlueprintLifecycleMutationResult>
    >(async () => mutationStub),
    finalizeBlueprint: vi.fn<
      (slug: string, options: BlueprintCommandOptions) => Promise<BlueprintLifecycleMutationResult>
    >(async () => mutationStub),
    finalizeBlueprintBySlug: vi.fn<
      (slug: string, options: BlueprintCommandOptions) => Promise<PromoteBlueprintResult>
    >(async () => ({ ...promoteStub, newState: 'completed' })),
    promoteBlueprintToState: vi.fn<
      (
        slug: string,
        toState: string,
        options: BlueprintCommandOptions,
      ) => Promise<PromoteBlueprintResult>
    >(async () => promoteStub),
    formatBlueprintAudit: vi.fn<(result: BlueprintAuditResult) => string>(() => 'audit ok'),
    formatBlueprintCreation: vi.fn<(result: CreateBlueprintResult) => string>(() => 'created'),
    formatBlueprintDetails: vi.fn<(result: ShowBlueprintResult) => string>(() => 'details'),
    formatBlueprintExecution: vi.fn<(result: ExecuteBlueprintResult) => string>(() => 'execution'),
    formatBlueprintSummaries: vi.fn<(summaries: BlueprintSummary[]) => string>(() => 'summaries'),
    getHelpText: vi.fn<() => string>(() => 'HELP'),
    listBlueprints: vi.fn<(options: BlueprintCommandOptions) => Promise<BlueprintSummary[]>>(
      async () => [],
    ),
    moveBlueprint:
      vi.fn<
        (
          slug: string,
          status: string,
          options: BlueprintCommandOptions,
        ) => Promise<MoveBlueprintResult>
      >(),
    mutateBlueprintTask: vi.fn<
      (
        action: 'start' | 'block' | 'unblock' | 'complete',
        slug: string,
        taskId: string,
        options: BlueprintCommandOptions & { reason?: string },
      ) => Promise<BlueprintLifecycleMutationResult>
    >(async () => mutationStub),
    printBlueprintOutput: vi.fn<(value: object | string, asJson?: boolean) => void>(),
    showBlueprint:
      vi.fn<(slug: string, options: BlueprintCommandOptions) => Promise<ShowBlueprintResult>>(),
    startBlueprint: vi.fn<
      (slug: string, options: BlueprintCommandOptions) => Promise<BlueprintLifecycleMutationResult>
    >(async () => ({
      message: 'started',
      moved: false,
      progress: '0%',
      slug: 's',
      status: 'in-progress',
    })),
  }
  return { ...base, ...overrides }
}

describe('executeBlueprintSubcommand', () => {
  afterEach(() => {
    _setPlatformTemplatesFetcher(null)
  })

  it('prints help when no subcommand is provided', async () => {
    const deps = buildDeps()
    await executeBlueprintSubcommand(undefined, [], { '--': [] }, deps)
    expect(deps.getHelpText).toHaveBeenCalledTimes(1)
    expect(deps.printBlueprintOutput).toHaveBeenCalledWith('HELP', false)
  })

  it('routes "list" with optional status arg', async () => {
    const deps = buildDeps()
    await executeBlueprintSubcommand('list', ['planned'], { '--': [] }, deps)
    expect(deps.listBlueprints).toHaveBeenCalledWith({ '--': [], status: 'planned' })
  })

  it('routes "start" with slug', async () => {
    const deps = buildDeps()
    await executeBlueprintSubcommand('start', ['blueprints/foo'], { '--': [] }, deps)
    expect(deps.startBlueprint).toHaveBeenCalledWith('blueprints/foo', { '--': [] })
  })

  it('accepts ak-native task form: <slug> <taskId> <action>', async () => {
    const deps = buildDeps()
    await executeBlueprintSubcommand(
      'task',
      ['blueprints/foo', '1.1', 'complete'],
      { '--': [] },
      deps,
    )
    expect(deps.mutateBlueprintTask).toHaveBeenCalledWith(
      'complete',
      'blueprints/foo',
      '1.1',
      expect.objectContaining({ '--': [] }),
    )
  })

  it('accepts wp-compatible task form: <action> <slug> <taskId>', async () => {
    const deps = buildDeps()
    await executeBlueprintSubcommand('task', ['start', 'blueprints/foo', '2.1'], { '--': [] }, deps)
    expect(deps.mutateBlueprintTask).toHaveBeenCalledWith(
      'start',
      'blueprints/foo',
      '2.1',
      expect.objectContaining({ '--': [] }),
    )
  })

  it('throws on unknown subcommand', async () => {
    const deps = buildDeps()
    await expect(executeBlueprintSubcommand('frobnicate', [], { '--': [] }, deps)).rejects.toThrow(
      /Unknown blueprint subcommand: frobnicate/,
    )
  })

  it('rejects unknown task action', async () => {
    const deps = buildDeps()
    await expect(
      executeBlueprintSubcommand(
        'task',
        ['blueprints/foo', '1.1', 'frobnicate'],
        { '--': [] },
        deps,
      ),
    ).rejects.toThrow(/Unknown blueprint task action/)
  })

  it('routes "control resume <slug>"', async () => {
    const deps = buildDeps({
      controlBlueprintExec: vi.fn<
        (
          action: 'status' | 'resume' | 'stop',
          slug: string,
          options: BlueprintCommandOptions,
        ) => Promise<ExecuteBlueprintResult>
      >(async () => ({
        action: 'resume',
        backend: 'omx-team',
        executionId: 'x',
        message: 'resumed',
        output: '',
        slug: 's',
        status: 'running',
      })),
    })
    await executeBlueprintSubcommand('control', ['resume', 'blueprints/foo'], { '--': [] }, deps)
    expect(deps.controlBlueprintExec).toHaveBeenCalledWith('resume', 'blueprints/foo', { '--': [] })
  })

  // ── new ──────────────────────────────────────────────────────────────

  it('routes "new" with goal args', async () => {
    const created: CreateBlueprintResult = {
      slug: 'my-feature',
      type: 'blueprint',
      title: 'My Feature',
      complexity: 'M',
      path: '/tmp/my-feature/_overview.md',
      outputPath: '/tmp/my-feature/_overview.md',
      projectRoot: '/tmp',
      relativeFilePath: 'blueprints/draft/my-feature/_overview.md',
      markdown: '# My Feature\n',
      status: 'draft',
      blueprint: {
        tasks: [],
        slug: 'my-feature',
        title: 'My Feature',
      } as unknown as CreateBlueprintResult['blueprint'],
      message: 'Created blueprint draft/my-feature.',
    }
    const deps = buildDeps({
      createBlueprint: vi.fn<
        (goal: string, options: BlueprintCommandOptions) => Promise<CreateBlueprintResult>
      >(async () => created),
    })
    await executeBlueprintSubcommand(
      'new',
      ['my', 'feature', 'goal'],
      { '--': [], complexity: 'M' },
      deps,
    )
    expect(deps.createBlueprint).toHaveBeenCalledWith(
      'my feature goal',
      expect.objectContaining({ complexity: 'M' }),
    )
    expect(deps.printBlueprintOutput).toHaveBeenCalledWith('created', undefined)
  })

  it('passes --type parent-roadmap for new', async () => {
    const created: CreateBlueprintResult = {
      slug: 'roadmap-a',
      type: 'parent-roadmap',
      title: 'Roadmap A',
      complexity: 'M',
      path: '/tmp/roadmap-a/_overview.md',
      outputPath: '/tmp/roadmap-a/_overview.md',
      projectRoot: '/tmp',
      relativeFilePath: 'blueprints/draft/roadmap-a/_overview.md',
      markdown: '# Roadmap A\n',
      status: 'draft',
      blueprint: {
        tasks: [],
        slug: 'roadmap-a',
        title: 'Roadmap A',
      } as unknown as CreateBlueprintResult['blueprint'],
      message: 'Created parent-roadmap draft/roadmap-a.',
    }
    const deps = buildDeps({
      createBlueprint: vi.fn(async () => created),
    })

    await executeBlueprintSubcommand(
      'new',
      ['roadmap', 'a'],
      { '--': [], complexity: 'M', type: 'parent-roadmap' },
      deps,
    )
    expect(deps.createBlueprint).toHaveBeenCalledWith(
      'roadmap a',
      expect.objectContaining({ complexity: 'M', type: 'parent-roadmap' }),
    )
  })

  it('throws when "new" receives no goal', async () => {
    const deps = buildDeps()
    await expect(executeBlueprintSubcommand('new', [], { '--': [] }, deps)).rejects.toThrow(
      /Usage: ak blueprint new/,
    )
  })

  // ── show ─────────────────────────────────────────────────────────────

  it('routes "show <slug>"', async () => {
    const showResult: ShowBlueprintResult = {
      slug: 'my-feature',
      blueprint: {
        title: 'T',
        status: 'planned',
        complexity: 'M',
        tasks: [],
        name: 'T',
        lastUpdated: '2024-01-01',
        type: 'blueprint',
        phases: [],
        raw: '',
      },
      location: { path: '/tmp/p', projectRoot: '/tmp' },
    }
    const deps = buildDeps({
      showBlueprint: vi.fn<
        (slug: string, options: BlueprintCommandOptions) => Promise<ShowBlueprintResult>
      >(async () => showResult),
    })
    await executeBlueprintSubcommand('show', ['my-feature'], { '--': [] }, deps)
    expect(deps.showBlueprint).toHaveBeenCalledWith('my-feature', { '--': [] })
    expect(deps.printBlueprintOutput).toHaveBeenCalledWith('details', undefined)
  })

  it('throws when "show" receives no slug', async () => {
    const deps = buildDeps()
    await expect(executeBlueprintSubcommand('show', [], { '--': [] }, deps)).rejects.toThrow(
      /Usage: ak blueprint show/,
    )
  })

  // ── exec ─────────────────────────────────────────────────────────────

  const execResult: ExecuteBlueprintResult = {
    action: 'launch',
    backend: 'omx-team',
    executionId: 'eid',
    message: 'Launched',
    output: '',
    slug: 'my-feature',
    status: 'running',
  }

  it('routes "exec <slug>" (launch)', async () => {
    const deps = buildDeps({
      executeBlueprint: vi.fn<
        (slug: string, options: BlueprintCommandOptions) => Promise<ExecuteBlueprintResult>
      >(async () => execResult),
    })
    await executeBlueprintSubcommand('exec', ['my-feature'], { '--': [] }, deps)
    expect(deps.executeBlueprint).toHaveBeenCalledWith('my-feature', { '--': [] })
    expect(deps.printBlueprintOutput).toHaveBeenCalledWith('execution', undefined)
  })

  it('routes "exec status <slug>"', async () => {
    const deps = buildDeps({
      controlBlueprintExec: vi.fn<
        (
          action: 'status' | 'resume' | 'stop',
          slug: string,
          options: BlueprintCommandOptions,
        ) => Promise<ExecuteBlueprintResult>
      >(async () => ({ ...execResult, action: 'status' })),
    })
    await executeBlueprintSubcommand('exec', ['status', 'my-feature'], { '--': [] }, deps)
    expect(deps.controlBlueprintExec).toHaveBeenCalledWith('status', 'my-feature', { '--': [] })
  })

  it('routes "exec stop <slug>"', async () => {
    const deps = buildDeps({
      controlBlueprintExec: vi.fn<
        (
          action: 'status' | 'resume' | 'stop',
          slug: string,
          options: BlueprintCommandOptions,
        ) => Promise<ExecuteBlueprintResult>
      >(async () => ({ ...execResult, action: 'stop' })),
    })
    await executeBlueprintSubcommand('exec', ['stop', 'my-feature'], { '--': [] }, deps)
    expect(deps.controlBlueprintExec).toHaveBeenCalledWith('stop', 'my-feature', { '--': [] })
  })

  it('routes "exec resume <slug>"', async () => {
    const deps = buildDeps({
      controlBlueprintExec: vi.fn<
        (
          action: 'status' | 'resume' | 'stop',
          slug: string,
          options: BlueprintCommandOptions,
        ) => Promise<ExecuteBlueprintResult>
      >(async () => ({ ...execResult, action: 'resume' })),
    })
    await executeBlueprintSubcommand('exec', ['resume', 'my-feature'], { '--': [] }, deps)
    expect(deps.controlBlueprintExec).toHaveBeenCalledWith('resume', 'my-feature', { '--': [] })
  })

  it('routes "exec logs <slug>"', async () => {
    const deps = buildDeps({
      readBlueprintExecutionLogs: vi.fn<
        (slug: string, options: BlueprintCommandOptions) => Promise<ExecuteBlueprintResult>
      >(async () => ({ ...execResult, action: 'logs' })),
    })
    await executeBlueprintSubcommand('exec', ['logs', 'my-feature'], { '--': [] }, deps)
    expect(deps.readBlueprintExecutionLogs).toHaveBeenCalledWith('my-feature', { '--': [] })
  })

  it('throws when "exec" receives no subaction', async () => {
    const deps = buildDeps()
    await expect(executeBlueprintSubcommand('exec', [], { '--': [] }, deps)).rejects.toThrow(
      /Usage: ak blueprint exec/,
    )
  })

  it('throws when "exec status" receives no slug', async () => {
    const deps = buildDeps()
    await expect(
      executeBlueprintSubcommand('exec', ['status'], { '--': [] }, deps),
    ).rejects.toThrow(/Usage: ak blueprint exec status/)
  })

  // ── logs ─────────────────────────────────────────────────────────────

  it('routes "logs <slug>"', async () => {
    const deps = buildDeps({
      readBlueprintExecutionLogs: vi.fn<
        (slug: string, options: BlueprintCommandOptions) => Promise<ExecuteBlueprintResult>
      >(async () => ({ ...execResult, action: 'logs' })),
    })
    await executeBlueprintSubcommand('logs', ['my-feature'], { '--': [] }, deps)
    expect(deps.readBlueprintExecutionLogs).toHaveBeenCalledWith('my-feature', { '--': [] })
  })

  it('throws when "logs" receives no slug', async () => {
    const deps = buildDeps()
    await expect(executeBlueprintSubcommand('logs', [], { '--': [] }, deps)).rejects.toThrow(
      /Usage: ak blueprint logs/,
    )
  })

  // ── park ─────────────────────────────────────────────────────────────

  it('routes "park <slug>"', async () => {
    const deps = buildDeps()
    await executeBlueprintSubcommand('park', ['my-feature'], { '--': [] }, deps)
    expect(deps.parkBlueprint).toHaveBeenCalledWith('my-feature', { '--': [] })
    expect(deps.printBlueprintOutput).toHaveBeenCalledWith('updated', undefined)
  })

  it('throws when "park" receives no slug', async () => {
    const deps = buildDeps()
    await expect(executeBlueprintSubcommand('park', [], { '--': [] }, deps)).rejects.toThrow(
      /Usage: ak blueprint park/,
    )
  })

  // ── finalize ─────────────────────────────────────────────────────────

  it('routes "finalize <slug>"', async () => {
    const deps = buildDeps()
    await executeBlueprintSubcommand('finalize', ['my-feature'], { '--': [] }, deps)
    expect(deps.finalizeBlueprintBySlug).toHaveBeenCalledWith('my-feature', { '--': [] })
    expect(deps.printBlueprintOutput).toHaveBeenCalledWith('promoted', undefined)
  })

  it('throws when "finalize" receives no slug', async () => {
    const deps = buildDeps()
    await expect(executeBlueprintSubcommand('finalize', [], { '--': [] }, deps)).rejects.toThrow(
      /Usage: ak blueprint finalize/,
    )
  })

  // ── move ─────────────────────────────────────────────────────────────

  it('routes "move <slug> <status>"', async () => {
    const moveResult: MoveBlueprintResult = {
      fromPath: '/old',
      fromStatus: 'planned',
      message: 'Moved to completed.',
      moved: true,
      slug: 'my-feature',
      toPath: '/new',
      toStatus: 'completed',
      updated: true,
    }
    const deps = buildDeps({
      moveBlueprint: vi.fn<
        (
          slug: string,
          status: string,
          options: BlueprintCommandOptions,
        ) => Promise<MoveBlueprintResult>
      >(async () => moveResult),
    })
    await executeBlueprintSubcommand('move', ['my-feature', 'completed'], { '--': [] }, deps)
    expect(deps.moveBlueprint).toHaveBeenCalledWith('my-feature', 'completed', { '--': [] })
    expect(deps.printBlueprintOutput).toHaveBeenCalledWith('Moved to completed.', undefined)
  })

  it('throws when "move" is missing slug or status', async () => {
    const deps = buildDeps()
    await expect(
      executeBlueprintSubcommand('move', ['my-feature'], { '--': [] }, deps),
    ).rejects.toThrow(/Usage: ak blueprint move/)
  })

  // ── audit ─────────────────────────────────────────────────────────────

  it('routes "audit" and prints output when ok', async () => {
    const deps = buildDeps({
      auditBlueprints: vi.fn<(options: BlueprintCommandOptions) => Promise<BlueprintAuditResult>>(
        async () => ({ ok: true, issues: [] }),
      ),
    })
    await executeBlueprintSubcommand('audit', [], { '--': [] }, deps)
    expect(deps.auditBlueprints).toHaveBeenCalledWith({ '--': [] })
    expect(deps.printBlueprintOutput).toHaveBeenCalledWith('audit ok', undefined)
  })

  it('throws BlueprintAuditFailedError when audit finds issues', async () => {
    const failResult: BlueprintAuditResult = {
      ok: false,
      issues: [{ level: 'error', message: 'bad blueprint', file: 'foo.md' }],
    }
    const deps = buildDeps({
      auditBlueprints: vi.fn<(options: BlueprintCommandOptions) => Promise<BlueprintAuditResult>>(
        async () => failResult,
      ),
    })
    await expect(executeBlueprintSubcommand('audit', [], { '--': [] }, deps)).rejects.toThrow(
      BlueprintAuditFailedError,
    )
    // Output is printed before throwing
    expect(deps.printBlueprintOutput).toHaveBeenCalledWith('audit ok', undefined)
  })

  it('prints JSON audit result when --json', async () => {
    const auditResult: BlueprintAuditResult = { ok: true, issues: [] }
    const deps = buildDeps({
      auditBlueprints: vi.fn<(options: BlueprintCommandOptions) => Promise<BlueprintAuditResult>>(
        async () => auditResult,
      ),
    })
    await executeBlueprintSubcommand('audit', [], { '--': [], json: true }, deps)
    expect(deps.printBlueprintOutput).toHaveBeenCalledWith(auditResult, true)
  })

  // ── control error paths ───────────────────────────────────────────────

  it('throws when "control" receives no args', async () => {
    const deps = buildDeps()
    await expect(executeBlueprintSubcommand('control', [], { '--': [] }, deps)).rejects.toThrow(
      /Usage: ak blueprint control/,
    )
  })

  it('throws when "control" receives unknown action', async () => {
    const deps = buildDeps()
    await expect(
      executeBlueprintSubcommand('control', ['launch', 'my-feature'], { '--': [] }, deps),
    ).rejects.toThrow(/Unknown blueprint control action/)
  })

  it('routes "control stop <slug>"', async () => {
    const deps = buildDeps({
      controlBlueprintExec: vi.fn<
        (
          action: 'status' | 'resume' | 'stop',
          slug: string,
          options: BlueprintCommandOptions,
        ) => Promise<ExecuteBlueprintResult>
      >(async () => ({ ...execResult, action: 'stop' })),
    })
    await executeBlueprintSubcommand('control', ['stop', 'my-feature'], { '--': [] }, deps)
    expect(deps.controlBlueprintExec).toHaveBeenCalledWith('stop', 'my-feature', { '--': [] })
  })

  it('routes "control status <slug>"', async () => {
    const deps = buildDeps({
      controlBlueprintExec: vi.fn<
        (
          action: 'status' | 'resume' | 'stop',
          slug: string,
          options: BlueprintCommandOptions,
        ) => Promise<ExecuteBlueprintResult>
      >(async () => ({ ...execResult, action: 'status' })),
    })
    await executeBlueprintSubcommand('control', ['status', 'my-feature'], { '--': [] }, deps)
    expect(deps.controlBlueprintExec).toHaveBeenCalledWith('status', 'my-feature', { '--': [] })
  })

  // ── task: remaining actions ───────────────────────────────────────────

  it.each([
    ['block', 'blueprints/foo', '1.1'],
    ['unblock', 'blueprints/bar', '2.3'],
    ['complete', 'blueprints/baz', '3.1'],
  ] as const)(
    'routes "task %s <slug> <taskId>" (wp-compatible form)',
    async (action, slug, taskId) => {
      const deps = buildDeps()
      await executeBlueprintSubcommand('task', [action, slug, taskId], { '--': [] }, deps)
      expect(deps.mutateBlueprintTask).toHaveBeenCalledWith(
        action,
        slug,
        taskId,
        expect.objectContaining({ '--': [] }),
      )
    },
  )

  it('passes --reason option for task block', async () => {
    const deps = buildDeps()
    await executeBlueprintSubcommand(
      'task',
      ['block', 'blueprints/foo', '1.1'],
      { '--': [], reason: 'blocked by infra' },
      deps,
    )
    expect(deps.mutateBlueprintTask).toHaveBeenCalledWith(
      'block',
      'blueprints/foo',
      '1.1',
      expect.objectContaining({ reason: 'blocked by infra' }),
    )
  })

  it('throws when "task" receives fewer than 3 args', async () => {
    const deps = buildDeps()
    await expect(
      executeBlueprintSubcommand('task', ['blueprints/foo', '1.1'], { '--': [] }, deps),
    ).rejects.toThrow(/Usage: ak blueprint task/)
  })

  // ── start missing slug ────────────────────────────────────────────────

  it('throws when "start" receives no slug', async () => {
    const deps = buildDeps()
    await expect(executeBlueprintSubcommand('start', [], { '--': [] }, deps)).rejects.toThrow(
      /Usage: ak blueprint start/,
    )
  })

  // ── json output paths ─────────────────────────────────────────────────

  it('outputs JSON for "list" when --json', async () => {
    const summaries: BlueprintSummary[] = [
      {
        name: 'my-feature',
        title: 'My Feature',
        status: 'planned',
        complexity: 'M',
        progress: 0,
        taskCount: 0,
        type: 'blueprint',
      },
    ]
    const deps = buildDeps({
      listBlueprints: vi.fn<(options: BlueprintCommandOptions) => Promise<BlueprintSummary[]>>(
        async () => summaries,
      ),
    })
    await executeBlueprintSubcommand('list', [], { '--': [], json: true }, deps)
    expect(deps.printBlueprintOutput).toHaveBeenCalledWith(summaries, true)
  })

  it('throws when "list" receives more than one arg', async () => {
    const deps = buildDeps()
    await expect(
      executeBlueprintSubcommand('list', ['planned', 'extra'], { '--': [] }, deps),
    ).rejects.toThrow(/Usage: ak blueprint list/)
  })

  // ── --list-templates ──────────────────────────────────────────────────

  it('prints template names and returns when --list-templates is set', async () => {
    vi.mocked(listTemplates).mockReturnValueOnce([
      { name: 'blueprint', path: '/tmp/docs/templates/blueprint.md' },
      { name: 'guide', path: '/tmp/docs/templates/guide.md' },
    ])
    const deps = buildDeps()
    await executeBlueprintSubcommand('new', [], { '--': [], listTemplates: true }, deps)
    expect(deps.printBlueprintOutput).toHaveBeenCalledWith('blueprint\nguide', false)
    expect(deps.createBlueprint).not.toHaveBeenCalled()
  })

  it('prints "No templates found." when --list-templates and directory is empty', async () => {
    vi.mocked(listTemplates).mockReturnValueOnce([])
    const deps = buildDeps()
    await executeBlueprintSubcommand('new', [], { '--': [], listTemplates: true }, deps)
    expect(deps.printBlueprintOutput).toHaveBeenCalledWith('No templates found.', false)
  })

  // ── --template <name> ─────────────────────────────────────────────────

  it('passes resolvedPath as templatePath when --template matches a known template', async () => {
    const resolvedPath = '/tmp/docs/templates/blueprint.md'
    vi.mocked(resolveTemplate).mockReturnValueOnce(resolvedPath)

    const created: CreateBlueprintResult = {
      slug: 'my-feature',
      type: 'blueprint',
      title: 'My Feature',
      complexity: 'M',
      path: '/tmp/my-feature/_overview.md',
      outputPath: '/tmp/my-feature/_overview.md',
      projectRoot: '/tmp',
      relativeFilePath: 'blueprints/draft/my-feature/_overview.md',
      markdown: '# My Feature\n',
      status: 'draft',
      blueprint: {
        tasks: [],
        slug: 'my-feature',
        title: 'My Feature',
      } as unknown as CreateBlueprintResult['blueprint'],
      message: 'Created blueprint draft/my-feature.',
    }
    const deps = buildDeps({
      createBlueprint: vi.fn<
        (goal: string, options: BlueprintCommandOptions) => Promise<CreateBlueprintResult>
      >(async () => created),
    })

    await executeBlueprintSubcommand(
      'new',
      ['my feature'],
      { '--': [], complexity: 'M', template: 'blueprint' },
      deps,
    )

    expect(deps.createBlueprint).toHaveBeenCalledWith(
      'my feature',
      expect.objectContaining({ templatePath: resolvedPath, complexity: 'M' }),
    )
  })

  it('prints available templates and calls process.exit(2) when --template is unknown', async () => {
    vi.mocked(resolveTemplate).mockReturnValueOnce(null)
    vi.mocked(listTemplates).mockReturnValueOnce([
      { name: 'blueprint', path: '/tmp/docs/templates/blueprint.md' },
      { name: 'guide', path: '/tmp/docs/templates/guide.md' },
    ])

    const processExitSpy = vi.spyOn(process, 'exit').mockImplementationOnce(
      (code?: number | string | null) => {
        throw new Error(`process.exit(${code ?? ''})`)
      },
    )

    const deps = buildDeps()

    await expect(
      executeBlueprintSubcommand(
        'new',
        ['my feature'],
        { '--': [], template: 'nonexistent' },
        deps,
      ),
    ).rejects.toThrow(/process\.exit\(2\)/)

    expect(deps.printBlueprintOutput).toHaveBeenCalledWith(
      expect.stringContaining('nonexistent'),
      false,
    )
    expect(deps.printBlueprintOutput).toHaveBeenCalledWith(
      expect.stringContaining('blueprint'),
      false,
    )

    processExitSpy.mockRestore()
  })

  it('--complexity flag overrides when --template is used', async () => {
    const resolvedPath = '/tmp/docs/templates/blueprint.md'
    vi.mocked(resolveTemplate).mockReturnValueOnce(resolvedPath)

    const created: CreateBlueprintResult = {
      slug: 'my-feature',
      type: 'blueprint',
      title: 'My Feature',
      complexity: 'L',
      path: '/tmp/my-feature/_overview.md',
      outputPath: '/tmp/my-feature/_overview.md',
      projectRoot: '/tmp',
      relativeFilePath: 'blueprints/draft/my-feature/_overview.md',
      markdown: '# My Feature\n',
      status: 'draft',
      blueprint: {
        tasks: [],
        slug: 'my-feature',
        title: 'My Feature',
      } as unknown as CreateBlueprintResult['blueprint'],
      message: 'Created blueprint draft/my-feature.',
    }
    const deps = buildDeps({
      createBlueprint: vi.fn<
        (goal: string, options: BlueprintCommandOptions) => Promise<CreateBlueprintResult>
      >(async () => created),
    })

    await executeBlueprintSubcommand(
      'new',
      ['my feature'],
      { '--': [], complexity: 'L', template: 'blueprint' },
      deps,
    )

    expect(deps.createBlueprint).toHaveBeenCalledWith(
      'my feature',
      expect.objectContaining({ complexity: 'L', templatePath: resolvedPath }),
    )
  })

  // ── platform templates: --list-templates ──────────────────────────────

  it('--list-templates merges platform and local templates (platform first)', async () => {
    const platformEntries: readonly BlueprintTemplateEntry[] = [
      { name: 'platform-tpl', slug: 'platform-tpl', url: 'https://example.com/platform-tpl.md' },
      { name: 'shared', slug: 'shared', url: 'https://example.com/shared.md' },
    ]
    _setPlatformTemplatesFetcher(async () => platformEntries)

    vi.mocked(listTemplates).mockReturnValueOnce([
      { name: 'shared', path: '/tmp/shared.md' },
      { name: 'local-only', path: '/tmp/local-only.md' },
    ])

    const deps = buildDeps()
    await executeBlueprintSubcommand('new', [], { '--': [], listTemplates: true }, deps)

    expect(deps.printBlueprintOutput).toHaveBeenCalledWith(
      'platform-tpl\nshared\nlocal-only',
      false,
    )
    expect(deps.createBlueprint).not.toHaveBeenCalled()
  })

  it('--list-templates uses local only when platform fetcher returns null (no credentials)', async () => {
    // No _setPlatformTemplatesFetcher call → production path; but we inject
    // a fetcher that returns [] to simulate no-credentials / disabled
    _setPlatformTemplatesFetcher(async () => [])

    vi.mocked(listTemplates).mockReturnValueOnce([
      { name: 'local-tpl', path: '/tmp/local-tpl.md' },
    ])

    const deps = buildDeps()
    await executeBlueprintSubcommand('new', [], { '--': [], listTemplates: true }, deps)

    expect(deps.printBlueprintOutput).toHaveBeenCalledWith('local-tpl', false)
  })

  it('--list-templates falls back to local only when platform fetcher throws (offline)', async () => {
    _setPlatformTemplatesFetcher(async () => {
      throw new Error('Network error')
    })

    vi.mocked(listTemplates).mockReturnValueOnce([
      { name: 'local-tpl', path: '/tmp/local-tpl.md' },
    ])

    const deps = buildDeps()
    await executeBlueprintSubcommand('new', [], { '--': [], listTemplates: true }, deps)

    // Should not throw; should fall back to local
    expect(deps.printBlueprintOutput).toHaveBeenCalledWith('local-tpl', false)
  })

  // ── platform templates: --template <name> ────────────────────────────

  it('--template matching a platform template fetches content from URL', async () => {
    const markdownContent = '# Platform Template\n\nContent here.\n'
    const platformEntries: readonly BlueprintTemplateEntry[] = [
      {
        name: 'platform-tpl',
        slug: 'platform-tpl',
        url: 'https://example.com/platform-tpl.md',
      },
    ]
    _setPlatformTemplatesFetcher(async () => platformEntries)

    // Mock global fetch for the template content download
    const fetchSpy = vi.spyOn(globalThis, 'fetch').mockResolvedValueOnce(
      new Response(markdownContent, { status: 200 }),
    )

    const created: CreateBlueprintResult = {
      slug: 'my-feature',
      type: 'blueprint',
      title: 'My Feature',
      complexity: 'M',
      path: '/tmp/my-feature/_overview.md',
      outputPath: '/tmp/my-feature/_overview.md',
      projectRoot: '/tmp',
      relativeFilePath: 'blueprints/draft/my-feature/_overview.md',
      markdown: '# My Feature\n',
      status: 'draft',
      blueprint: {
        tasks: [],
        slug: 'my-feature',
        title: 'My Feature',
      } as unknown as CreateBlueprintResult['blueprint'],
      message: 'Created blueprint draft/my-feature.',
    }
    const deps = buildDeps({
      createBlueprint: vi.fn<
        (goal: string, options: BlueprintCommandOptions) => Promise<CreateBlueprintResult>
      >(async () => created),
    })

    await executeBlueprintSubcommand(
      'new',
      ['my feature'],
      { '--': [], complexity: 'M', template: 'platform-tpl' },
      deps,
    )

    expect(fetchSpy).toHaveBeenCalledWith('https://example.com/platform-tpl.md')
    expect(deps.createBlueprint).toHaveBeenCalledWith(
      'my feature',
      expect.objectContaining({ templatePath: expect.stringContaining('.md') as string }),
    )

    fetchSpy.mockRestore()
  })

  it('--template falls back to local when platform is offline (empty platform list)', async () => {
    _setPlatformTemplatesFetcher(async () => [])

    const resolvedPath = '/tmp/docs/templates/local-tpl.md'
    vi.mocked(resolveTemplate).mockReturnValueOnce(resolvedPath)

    const created: CreateBlueprintResult = {
      slug: 'my-feature',
      type: 'blueprint',
      title: 'My Feature',
      complexity: 'M',
      path: '/tmp/my-feature/_overview.md',
      outputPath: '/tmp/my-feature/_overview.md',
      projectRoot: '/tmp',
      relativeFilePath: 'blueprints/draft/my-feature/_overview.md',
      markdown: '# My Feature\n',
      status: 'draft',
      blueprint: {
        tasks: [],
        slug: 'my-feature',
        title: 'My Feature',
      } as unknown as CreateBlueprintResult['blueprint'],
      message: 'Created blueprint draft/my-feature.',
    }
    const deps = buildDeps({
      createBlueprint: vi.fn<
        (goal: string, options: BlueprintCommandOptions) => Promise<CreateBlueprintResult>
      >(async () => created),
    })

    await executeBlueprintSubcommand(
      'new',
      ['my feature'],
      { '--': [], complexity: 'M', template: 'local-tpl' },
      deps,
    )

    expect(deps.createBlueprint).toHaveBeenCalledWith(
      'my feature',
      expect.objectContaining({ templatePath: resolvedPath }),
    )
  })

  it('throws when platform template URL fetch fails mid-stream (network error)', async () => {
    // Platform returns a matching template entry, but fetching its URL throws
    const platformEntries: readonly BlueprintTemplateEntry[] = [
      { name: 'remote-tpl', slug: 'remote-tpl', url: 'https://example.com/template.md' },
    ]
    _setPlatformTemplatesFetcher(async () => platformEntries)

    // Stub globalThis.fetch to throw when fetching the template content URL
    const fetchSpy = vi
      .spyOn(globalThis, 'fetch')
      .mockRejectedValueOnce(new Error('ECONNREFUSED'))

    const deps = buildDeps()

    // The platform match is found → fetchPlatformTemplateToTmpFile is called →
    // fetch throws → error propagates out of executeBlueprintSubcommand
    await expect(
      executeBlueprintSubcommand(
        'new',
        ['my feature'],
        { '--': [], template: 'remote-tpl' },
        deps,
      ),
    ).rejects.toThrow('ECONNREFUSED')

    expect(deps.createBlueprint).not.toHaveBeenCalled()

    fetchSpy.mockRestore()
  })

  it('--template not found in platform or local shows combined error listing both', async () => {
    const platformEntries: readonly BlueprintTemplateEntry[] = [
      { name: 'platform-tpl', slug: 'platform-tpl', url: 'https://example.com/platform-tpl.md' },
    ]
    _setPlatformTemplatesFetcher(async () => platformEntries)

    vi.mocked(resolveTemplate).mockReturnValueOnce(null)
    vi.mocked(listTemplates).mockReturnValueOnce([
      { name: 'local-tpl', path: '/tmp/local-tpl.md' },
    ])

    const processExitSpy = vi.spyOn(process, 'exit').mockImplementationOnce(
      (code?: number | string | null) => {
        throw new Error(`process.exit(${code ?? ''})`)
      },
    )

    const deps = buildDeps()

    await expect(
      executeBlueprintSubcommand(
        'new',
        ['my feature'],
        { '--': [], template: 'nonexistent' },
        deps,
      ),
    ).rejects.toThrow(/process\.exit\(2\)/)

    expect(deps.printBlueprintOutput).toHaveBeenCalledWith(
      expect.stringContaining('nonexistent'),
      false,
    )
    // Both platform and local template names should appear in the error message
    expect(deps.printBlueprintOutput).toHaveBeenCalledWith(
      expect.stringContaining('platform-tpl'),
      false,
    )
    expect(deps.printBlueprintOutput).toHaveBeenCalledWith(
      expect.stringContaining('local-tpl'),
      false,
    )

    processExitSpy.mockRestore()
  })
})
