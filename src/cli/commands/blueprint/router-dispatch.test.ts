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

import { executeBlueprintSubcommand } from './router-dispatch.js'

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
})
