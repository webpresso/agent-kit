import type { BlueprintAuditResult, BlueprintSummary } from '#local'
import type {
  BlueprintCommandOptions,
  BlueprintLifecycleMutationResult,
  CreateBlueprintResult,
  ExecuteBlueprintResult,
  MoveBlueprintResult,
  ShowBlueprintResult,
} from './router.js'

import { describe, expect, it, vi } from 'vitest'

import { BlueprintAuditFailedError, executeBlueprintSubcommand } from './router-dispatch.js'

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

function buildDeps(overrides: Partial<Deps> = {}): Deps {
  const base: Deps = {
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
      blueprint: { tasks: [], slug: 'my-feature', title: 'My Feature' } as unknown as CreateBlueprintResult['blueprint'],
      message: 'Created blueprint draft/my-feature.',
    }
    const deps = buildDeps({
      createBlueprint: vi.fn<
        (goal: string, options: BlueprintCommandOptions) => Promise<CreateBlueprintResult>
      >(async () => created),
    })
    await executeBlueprintSubcommand('new', ['my', 'feature', 'goal'], { '--': [], complexity: 'M' }, deps)
    expect(deps.createBlueprint).toHaveBeenCalledWith('my feature goal', expect.objectContaining({ complexity: 'M' }))
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
      blueprint: { tasks: [], slug: 'roadmap-a', title: 'Roadmap A' } as unknown as CreateBlueprintResult['blueprint'],
      message: 'Created parent-roadmap draft/roadmap-a.',
    }
    const deps = buildDeps({
      createBlueprint: vi.fn(async () => created),
    })

    await executeBlueprintSubcommand('new', ['roadmap', 'a'], { '--': [], complexity: 'M', type: 'parent-roadmap' }, deps)
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
      blueprint: { title: 'T', status: 'planned', complexity: 'M', tasks: [], name: 'T', lastUpdated: '2024-01-01', type: 'blueprint', phases: [], raw: '' },
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
    await expect(executeBlueprintSubcommand('exec', ['status'], { '--': [] }, deps)).rejects.toThrow(
      /Usage: ak blueprint exec status/,
    )
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
    expect(deps.finalizeBlueprint).toHaveBeenCalledWith('my-feature', { '--': [] })
    expect(deps.printBlueprintOutput).toHaveBeenCalledWith('updated', undefined)
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
        (slug: string, status: string, options: BlueprintCommandOptions) => Promise<MoveBlueprintResult>
      >(async () => moveResult),
    })
    await executeBlueprintSubcommand('move', ['my-feature', 'completed'], { '--': [] }, deps)
    expect(deps.moveBlueprint).toHaveBeenCalledWith('my-feature', 'completed', { '--': [] })
    expect(deps.printBlueprintOutput).toHaveBeenCalledWith('Moved to completed.', undefined)
  })

  it('throws when "move" is missing slug or status', async () => {
    const deps = buildDeps()
    await expect(executeBlueprintSubcommand('move', ['my-feature'], { '--': [] }, deps)).rejects.toThrow(
      /Usage: ak blueprint move/,
    )
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
  ] as const)('routes "task %s <slug> <taskId>" (wp-compatible form)', async (action, slug, taskId) => {
    const deps = buildDeps()
    await executeBlueprintSubcommand('task', [action, slug, taskId], { '--': [] }, deps)
    expect(deps.mutateBlueprintTask).toHaveBeenCalledWith(
      action,
      slug,
      taskId,
      expect.objectContaining({ '--': [] }),
    )
  })

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
})
