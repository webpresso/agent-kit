import type { BlueprintLaunchSpec } from './types.js'

import { describe, expect, it } from 'vitest'

import { parseBlueprint } from '#core/parser'

import {
  buildBlueprintProgressBridgeState,
  normalizeOmxTeamTaskSnapshot,
  projectBlueprintLifecycleFromRuntime,
  resolveBlueprintProgressBridgePath,
} from './progress-bridge.js'

const BLUEPRINT_MARKDOWN = `---
type: blueprint
status: in-progress
complexity: L
created: 2026-04-10
last_updated: 2026-04-10
---

# test-blueprint

#### Task 1.1: Launch execution
**Status:** todo

**Depends:** None

- [ ] a

#### Task 1.2: Verify launch
**Status:** todo

**Depends:** Task 1.1

- [ ] b
`

const LAUNCH_SPEC = {
  backend: 'omx-team',
  blueprintPath: 'webpresso/blueprints/in-progress/test-blueprint/_overview.md',
  blueprintSlug: 'in-progress/test-blueprint',
  mode: 'durable',
  policy: {
    maxParallelism: 1,
    preferWorktree: false,
    requireVerificationForCompletion: true,
    runtimeStateRoot: '.omx/state',
  },
  tasks: [
    {
      backendHints: {},
      dependsOn: [],
      files: ['apps/cli-wp/src/commands/blueprint/execution.ts'],
      id: '1.1',
      title: 'Launch execution',
      verificationCommands: [],
    },
    {
      backendHints: {},
      dependsOn: ['1.1'],
      files: [],
      id: '1.2',
      title: 'Verify launch',
      verificationCommands: [],
    },
  ],
} satisfies BlueprintLaunchSpec

function passingTestEvidence(ts: string) {
  return [{ kind: 'test', command: 'vp test', exit_code: 0, result: 'pass', ts }] as const
}

describe('buildBlueprintProgressBridgeState', () => {
  it('maps OMX team tasks back to blueprint task ids using Task <id> prefixes', () => {
    const bridge = buildBlueprintProgressBridgeState(
      LAUNCH_SPEC,
      'team-a',
      [
        normalizeOmxTeamTaskSnapshot({
          id: '1',
          status: 'pending',
          subject: 'Task 1.1: Launch execution',
        }),
        normalizeOmxTeamTaskSnapshot({
          id: '2',
          status: 'pending',
          subject: 'Task 1.2: Verify launch',
        }),
      ],
      '2026-04-10T12:00:00Z',
    )

    expect(bridge.tasks).toEqual([
      { blueprintTaskId: '1.1', runtimeTaskId: '1', title: 'Launch execution' },
      { blueprintTaskId: '1.2', runtimeTaskId: '2', title: 'Verify launch' },
    ])
  })

  it('resolves bridge files under runtime state only', () => {
    expect(resolveBlueprintProgressBridgePath('.omx/state', 'omx-team', 'team-a')).toBe(
      '.omx/state/blueprint-execution/omx-team/team-a.json',
    )
  })
})

describe('projectBlueprintLifecycleFromRuntime', () => {
  it('projects in-progress and completed runtime tasks into lifecycle intents', () => {
    const blueprint = parseBlueprint(BLUEPRINT_MARKDOWN, 'in-progress/test-blueprint')
    const bridge = buildBlueprintProgressBridgeState(
      LAUNCH_SPEC,
      'team-a',
      [
        normalizeOmxTeamTaskSnapshot({
          id: '1',
          status: 'pending',
          subject: 'Task 1.1: Launch execution',
        }),
        normalizeOmxTeamTaskSnapshot({
          id: '2',
          status: 'pending',
          subject: 'Task 1.2: Verify launch',
        }),
      ],
      '2026-04-10T12:00:00Z',
    )

    const projection = projectBlueprintLifecycleFromRuntime(blueprint, bridge, [
      normalizeOmxTeamTaskSnapshot({
        id: '1',
        status: 'in_progress',
        subject: 'Task 1.1: Launch execution',
      }),
      normalizeOmxTeamTaskSnapshot({
        evidence: passingTestEvidence('2026-04-10T12:01:00Z'),
        id: '2',
        status: 'completed',
        subject: 'Task 1.2: Verify launch',
      }),
    ])

    expect(projection.status).toBe('running')
    expect(projection.intents).toEqual([
      { type: 'task_start', taskId: '1.1' },
      {
        type: 'task_verify',
        taskId: '1.2',
        evidence: passingTestEvidence('2026-04-10T12:01:00Z'),
      },
    ])
  })

  it('blocks failed runtime work and finalizes only when every task completed', () => {
    const blueprint = parseBlueprint(BLUEPRINT_MARKDOWN, 'in-progress/test-blueprint')
    const bridge = buildBlueprintProgressBridgeState(
      LAUNCH_SPEC,
      'team-a',
      [
        normalizeOmxTeamTaskSnapshot({
          id: '1',
          status: 'pending',
          subject: 'Task 1.1: Launch execution',
        }),
        normalizeOmxTeamTaskSnapshot({
          id: '2',
          status: 'pending',
          subject: 'Task 1.2: Verify launch',
        }),
      ],
      '2026-04-10T12:00:00Z',
    )

    const failed = projectBlueprintLifecycleFromRuntime(blueprint, bridge, [
      normalizeOmxTeamTaskSnapshot({
        error: 'Tests failed',
        id: '1',
        status: 'failed',
        subject: 'Task 1.1: Launch execution',
      }),
      normalizeOmxTeamTaskSnapshot({
        id: '2',
        status: 'pending',
        subject: 'Task 1.2: Verify launch',
      }),
    ])

    expect(failed.status).toBe('failed')
    expect(failed.intents).toEqual([{ type: 'task_block', taskId: '1.1', reason: 'Tests failed' }])

    const completed = projectBlueprintLifecycleFromRuntime(blueprint, bridge, [
      normalizeOmxTeamTaskSnapshot({
        evidence: passingTestEvidence('2026-04-10T12:01:00Z'),
        id: '1',
        status: 'completed',
        subject: 'Task 1.1: Launch execution',
      }),
      normalizeOmxTeamTaskSnapshot({
        evidence: passingTestEvidence('2026-04-10T12:02:00Z'),
        id: '2',
        status: 'completed',
        subject: 'Task 1.2: Verify launch',
      }),
    ])

    expect(completed.status).toBe('completed')
    expect(completed.intents).toEqual([
      {
        type: 'task_verify',
        taskId: '1.1',
        evidence: passingTestEvidence('2026-04-10T12:01:00Z'),
      },
      {
        type: 'task_verify',
        taskId: '1.2',
        evidence: passingTestEvidence('2026-04-10T12:02:00Z'),
      },
      { type: 'finalize' },
    ])
  })

  it('does not finalize projected completion without passing evidence for every done task', () => {
    const blueprint = parseBlueprint(BLUEPRINT_MARKDOWN, 'in-progress/test-blueprint')
    const bridge = buildBlueprintProgressBridgeState(
      LAUNCH_SPEC,
      'team-a',
      [
        normalizeOmxTeamTaskSnapshot({
          id: '1',
          status: 'pending',
          subject: 'Task 1.1: Launch execution',
        }),
        normalizeOmxTeamTaskSnapshot({
          id: '2',
          status: 'pending',
          subject: 'Task 1.2: Verify launch',
        }),
      ],
      '2026-04-10T12:00:00Z',
    )

    const completed = projectBlueprintLifecycleFromRuntime(blueprint, bridge, [
      normalizeOmxTeamTaskSnapshot({
        evidence: passingTestEvidence('2026-04-10T12:01:00Z'),
        id: '1',
        status: 'completed',
        subject: 'Task 1.1: Launch execution',
      }),
      normalizeOmxTeamTaskSnapshot({
        id: '2',
        status: 'completed',
        subject: 'Task 1.2: Verify launch',
      }),
    ])

    expect(completed.status).toBe('completed')
    expect(completed.intents).toEqual([
      {
        type: 'task_verify',
        taskId: '1.1',
        evidence: passingTestEvidence('2026-04-10T12:01:00Z'),
      },
      {
        type: 'task_block',
        taskId: '1.2',
        reason: 'Runtime reported task 1.2 completed without task-local verification evidence.',
      },
    ])
  })
})
