import { describe, expect, it } from 'vitest'

import {
  blueprintExecutionPolicySchema,
  blueprintExecutionSpecSchema,
  blueprintLaunchSpecSchema,
  blueprintTaskLaunchSpecSchema,
  DEFAULT_BLUEPRINT_RUNTIME_STATE_ROOT,
  runtimeStateSnapshotSchema,
} from './types.js'

describe('blueprintTaskLaunchSpecSchema', () => {
  it('defaults optional task arrays and backend hints', () => {
    const result = blueprintTaskLaunchSpecSchema.parse({
      id: '1.1',
      title: 'Compile launch spec',
    })

    expect(result.dependsOn).toEqual([])
    expect(result.files).toEqual([])
    expect(result.verificationCommands).toEqual([])
    expect(result.backendHints).toEqual({})
  })
})

describe('blueprintExecutionPolicySchema', () => {
  it('defaults runtime state to .omx/state', () => {
    const result = blueprintExecutionPolicySchema.parse({})

    expect(result.runtimeStateRoot).toBe(DEFAULT_BLUEPRINT_RUNTIME_STATE_ROOT)
    expect(result.preferWorktree).toBe(false)
    expect(result.requireVerificationForCompletion).toBe(true)
  })

  it('rejects runtime state roots outside .omx/state', () => {
    expect(() =>
      blueprintExecutionPolicySchema.parse({
        runtimeStateRoot: '.omx/plans',
      }),
    ).toThrow(/runtimeStateRoot must stay under \.omx\/state/)
  })

  it('accepts a bare .omx/state as the runtime root', () => {
    const result = blueprintExecutionPolicySchema.parse({
      runtimeStateRoot: '.omx/state',
    })

    expect(result.runtimeStateRoot).toBe('.omx/state')
  })

  it('accepts subdirectories under .omx/state', () => {
    const result = blueprintExecutionPolicySchema.parse({
      runtimeStateRoot: '.omx/state/custom',
    })

    expect(result.runtimeStateRoot).toBe('.omx/state/custom')
  })

  it('rejects paths that are prefixed with .omx/state but not actually under it', () => {
    expect(() =>
      blueprintExecutionPolicySchema.parse({
        runtimeStateRoot: '.omx/statecraft',
      }),
    ).toThrow(/runtimeStateRoot must stay under \.omx\/state/)
  })
})

describe('blueprintLaunchSpecSchema', () => {
  it('accepts a legacy Webpresso blueprint-backed launch spec', () => {
    const result = blueprintLaunchSpecSchema.parse({
      backend: 'omx-team',
      blueprintPath: 'webpresso/blueprints/in-progress/test-plan/_overview.md',
      blueprintSlug: 'in-progress/test-plan',
      mode: 'durable',
      policy: {},
      tasks: [
        {
          id: '1.1',
          title: 'Do work',
          verificationCommands: ['just test --file some.test.ts'],
        },
      ],
    })

    expect(result.backend).toBe('omx-team')
    expect(result.policy.runtimeStateRoot).toBe(DEFAULT_BLUEPRINT_RUNTIME_STATE_ROOT)
  })



  it('accepts a generic consumer blueprint-backed launch spec', () => {
    const result = blueprintLaunchSpecSchema.parse({
      backend: 'omx-team',
      blueprintPath: 'blueprints/in-progress/test-plan/_overview.md',
      blueprintSlug: 'in-progress/test-plan',
      mode: 'durable',
      policy: {},
      tasks: [],
    })

    expect(result.blueprintPath).toBe('blueprints/in-progress/test-plan/_overview.md')
  })

  it('rejects launch specs rooted in .omx/plans', () => {
    expect(() =>
      blueprintLaunchSpecSchema.parse({
        backend: 'omx-team',
        blueprintPath: '.omx/plans/prd-test.md',
        blueprintSlug: 'prd-test',
        mode: 'durable',
        policy: {},
        tasks: [],
      }),
    ).toThrow(/blueprintPath must point at blueprints\/ or webpresso\/blueprints/)
  })

  it('rejects blueprint paths not in blueprints directories', () => {
    expect(() =>
      blueprintLaunchSpecSchema.parse({
        backend: 'omx-team',
        blueprintPath: 'src/some-code.ts',
        blueprintSlug: 'prd-test',
        mode: 'durable',
        policy: {},
        tasks: [],
      }),
    ).toThrow(/blueprintPath must point at blueprints\/ or webpresso\/blueprints/)
  })

  it('accepts blueprint paths starting with blueprints/', () => {
    const result = blueprintLaunchSpecSchema.parse({
      backend: 'omx-team',
      blueprintPath: 'blueprints/some-path/_overview.md',
      blueprintSlug: 'in-progress/some-path',
      mode: 'durable',
      policy: {},
      tasks: [],
    })

    expect(result.blueprintPath).toBe('blueprints/some-path/_overview.md')
  })

  it('rejects blueprint paths ending strangely', () => {
    expect(() =>
      blueprintLaunchSpecSchema.parse({
        backend: 'omx-team',
        blueprintPath: 'src/blueprints-fake/test.md',
        blueprintSlug: 'test',
        mode: 'durable',
        policy: {},
        tasks: [],
      }),
    ).toThrow(/blueprintPath must point at blueprints\/ or webpresso\/blueprints/)
  })

  it('accepts paths containing blueprints/ in a nested path', () => {
    const result = blueprintLaunchSpecSchema.parse({
      backend: 'omx-team',
      blueprintPath: 'src/blueprints/in-progress/test-plan/_overview.md',
      blueprintSlug: 'in-progress/test-plan',
      mode: 'durable',
      policy: {},
      tasks: [],
    })

    expect(result.blueprintPath).toBe('src/blueprints/in-progress/test-plan/_overview.md')
  })
})

describe('blueprintExecutionSpecSchema', () => {
  it('aliases the shipped launch-spec contract', () => {
    const result = blueprintExecutionSpecSchema.parse({
      backend: 'omx-team',
      blueprintPath: 'webpresso/blueprints/in-progress/test-plan/_overview.md',
      blueprintSlug: 'in-progress/test-plan',
      mode: 'durable',
      policy: {},
      tasks: [],
    })

    expect(result.blueprintSlug).toBe('in-progress/test-plan')
  })
})

describe('runtimeStateSnapshotSchema', () => {
  it('requires runtime identity and status', () => {
    const result = runtimeStateSnapshotSchema.parse({
      backend: 'omx-team',
      executionId: 'job-123',
      status: 'running',
      updatedAt: '2026-04-10T10:00:00Z',
    })

    expect(result.executionId).toBe('job-123')
    expect(result.status).toBe('running')
  })
})
