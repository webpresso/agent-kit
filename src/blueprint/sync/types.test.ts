/**
 * Type-level and runtime tests for BlueprintPlatformClient interface contract.
 *
 * Type-level: Assert the discriminated union covers exactly the 8 required
 * event types via exhaustive switch (compile error if any branch is missing
 * or the union changes without updating this file).
 *
 * Runtime: Verify object shapes are valid at the boundary level using plain
 * TypeScript type assignments (no Zod schema needed — types.ts is types-only).
 */

import { describe, expect, it } from 'vitest'

import type {
  BlueprintEventPayload,
  BlueprintEventType,
  BlueprintPlatformClient,
  BlueprintPlatformEvent,
  BlueprintSnapshot,
  BlueprintTemplateEntry,
  SnapshotBlueprint,
  SnapshotTask,
} from './types.js'

// ---------------------------------------------------------------------------
// Type-level: exhaustive check over BlueprintEventType
//
// If a new event type is added to the union without updating this switch,
// TypeScript raises a compile error on the `default` branch via `never`.
// ---------------------------------------------------------------------------

function assertExhaustive(value: never): never {
  throw new Error(`Unhandled event type: ${String(value)}`)
}

function _typeExhaustiveCheck(type: BlueprintEventType): string {
  switch (type) {
    case 'blueprint.created':
      return type
    case 'blueprint.status_changed':
      return type
    case 'blueprint.archived':
      return type
    case 'blueprint.finalized':
      return type
    case 'blueprint.metadata_updated':
      return type
    case 'task.created':
      return type
    case 'task.status_changed':
      return type
    case 'runner.event':
      return type
    default:
      return assertExhaustive(type)
  }
}

// ---------------------------------------------------------------------------
// Type-level: BlueprintPlatformClient interface shape
//
// A mock implementation must satisfy the interface — compile error otherwise.
// ---------------------------------------------------------------------------

const _mockClient: BlueprintPlatformClient = {
  pushEvent: async (_payload: BlueprintPlatformEvent): Promise<void> => {
    // no-op
  },
  getSnapshot: async (_opts?: { slug?: string }): Promise<BlueprintSnapshot> => ({
    blueprints: [],
    fetchedAt: new Date().toISOString(),
  }),
  listTemplates: async (): Promise<readonly BlueprintTemplateEntry[]> => [],
  healthCheck: async (): Promise<{ ok: boolean; latencyMs: number }> => ({
    ok: true,
    latencyMs: 0,
  }),
}

// Suppress unused-variable warnings without affecting runtime
void _mockClient
void _typeExhaustiveCheck

// ---------------------------------------------------------------------------
// Runtime: valid BlueprintPlatformEvent objects satisfy the shape contract
// ---------------------------------------------------------------------------

describe('BlueprintPlatformEvent', () => {
  it('blueprint.created payload has required fields', () => {
    const event: BlueprintPlatformEvent = {
      eventId: 'a1b2c3d4-0000-0000-0000-000000000001',
      repoId: 'repo-abc',
      occurredAt: '2026-05-12T00:00:00.000Z',
      type: 'blueprint.created',
      payload: {
        type: 'blueprint.created',
        slug: 'my-feature',
        title: 'My Feature',
        complexity: 'M',
        status: 'planned',
      },
    }
    expect(event.eventId).toStrictEqual('a1b2c3d4-0000-0000-0000-000000000001')
    expect(event.type).toStrictEqual('blueprint.created')
    expect(event.payload.type).toStrictEqual('blueprint.created')
  })

  it('blueprint.status_changed payload has fromStatus and toStatus', () => {
    const event: BlueprintPlatformEvent = {
      eventId: 'a1b2c3d4-0000-0000-0000-000000000002',
      repoId: 'repo-abc',
      occurredAt: '2026-05-12T00:00:00.000Z',
      type: 'blueprint.status_changed',
      payload: {
        type: 'blueprint.status_changed',
        slug: 'my-feature',
        fromStatus: 'planned',
        toStatus: 'in-progress',
      },
    }
    expect(event.payload.type).toStrictEqual('blueprint.status_changed')
    if (event.payload.type === 'blueprint.status_changed') {
      expect(event.payload.fromStatus).toStrictEqual('planned')
      expect(event.payload.toStatus).toStrictEqual('in-progress')
    }
  })

  it('blueprint.archived payload has slug', () => {
    const event: BlueprintPlatformEvent = {
      eventId: 'a1b2c3d4-0000-0000-0000-000000000003',
      repoId: 'repo-abc',
      occurredAt: '2026-05-12T00:00:00.000Z',
      type: 'blueprint.archived',
      payload: { type: 'blueprint.archived', slug: 'my-feature' },
    }
    expect(event.payload.type).toStrictEqual('blueprint.archived')
  })

  it('blueprint.finalized payload has slug', () => {
    const event: BlueprintPlatformEvent = {
      eventId: 'a1b2c3d4-0000-0000-0000-000000000004',
      repoId: 'repo-abc',
      occurredAt: '2026-05-12T00:00:00.000Z',
      type: 'blueprint.finalized',
      payload: { type: 'blueprint.finalized', slug: 'my-feature' },
    }
    expect(event.payload.type).toStrictEqual('blueprint.finalized')
  })

  it('blueprint.metadata_updated payload has slug and changes map', () => {
    const event: BlueprintPlatformEvent = {
      eventId: 'a1b2c3d4-0000-0000-0000-000000000005',
      repoId: 'repo-abc',
      occurredAt: '2026-05-12T00:00:00.000Z',
      type: 'blueprint.metadata_updated',
      payload: {
        type: 'blueprint.metadata_updated',
        slug: 'my-feature',
        changes: { title: 'New Title', complexity: 'L' },
      },
    }
    expect(event.payload.type).toStrictEqual('blueprint.metadata_updated')
    if (event.payload.type === 'blueprint.metadata_updated') {
      expect(event.payload.changes).toStrictEqual({ title: 'New Title', complexity: 'L' })
    }
  })

  it('task.created payload has blueprintSlug, taskId, title', () => {
    const event: BlueprintPlatformEvent = {
      eventId: 'a1b2c3d4-0000-0000-0000-000000000006',
      repoId: 'repo-abc',
      occurredAt: '2026-05-12T00:00:00.000Z',
      type: 'task.created',
      payload: {
        type: 'task.created',
        blueprintSlug: 'my-feature',
        taskId: 'task-1',
        title: 'Implement endpoint',
      },
    }
    expect(event.payload.type).toStrictEqual('task.created')
    if (event.payload.type === 'task.created') {
      expect(event.payload.taskId).toStrictEqual('task-1')
    }
  })

  it('task.status_changed payload has fromStatus and toStatus', () => {
    const event: BlueprintPlatformEvent = {
      eventId: 'a1b2c3d4-0000-0000-0000-000000000007',
      repoId: 'repo-abc',
      occurredAt: '2026-05-12T00:00:00.000Z',
      type: 'task.status_changed',
      payload: {
        type: 'task.status_changed',
        blueprintSlug: 'my-feature',
        taskId: 'task-1',
        fromStatus: 'todo',
        toStatus: 'done',
      },
    }
    expect(event.payload.type).toStrictEqual('task.status_changed')
    if (event.payload.type === 'task.status_changed') {
      expect(event.payload.fromStatus).toStrictEqual('todo')
      expect(event.payload.toStatus).toStrictEqual('done')
    }
  })

  it('runner.event payload has executionHandle, sequence, kind', () => {
    const event: BlueprintPlatformEvent = {
      eventId: 'a1b2c3d4-0000-0000-0000-000000000008',
      repoId: 'repo-abc',
      occurredAt: '2026-05-12T00:00:00.000Z',
      type: 'runner.event',
      payload: {
        type: 'runner.event',
        blueprintSlug: 'my-feature',
        executionHandle: 'handle-xyz',
        sequence: 1,
        kind: 'progress',
      },
    }
    expect(event.payload.type).toStrictEqual('runner.event')
    if (event.payload.type === 'runner.event') {
      expect(event.payload.sequence).toStrictEqual(1)
      expect(event.payload.kind).toStrictEqual('progress')
    }
  })
})

// ---------------------------------------------------------------------------
// Runtime: BlueprintEventType union has exactly 8 variants
// ---------------------------------------------------------------------------

describe('BlueprintEventType', () => {
  it('covers exactly the 8 required mutation operations', () => {
    const allTypes: readonly BlueprintEventType[] = [
      'blueprint.created',
      'blueprint.status_changed',
      'blueprint.archived',
      'blueprint.finalized',
      'blueprint.metadata_updated',
      'task.created',
      'task.status_changed',
      'runner.event',
    ] as const

    expect(allTypes).toHaveLength(8)
    expect(allTypes).toStrictEqual([
      'blueprint.created',
      'blueprint.status_changed',
      'blueprint.archived',
      'blueprint.finalized',
      'blueprint.metadata_updated',
      'task.created',
      'task.status_changed',
      'runner.event',
    ])
  })
})

// ---------------------------------------------------------------------------
// Runtime: BlueprintSnapshot shape
// ---------------------------------------------------------------------------

describe('BlueprintSnapshot', () => {
  it('contains blueprints array and fetchedAt ISO string', () => {
    const task: SnapshotTask = {
      id: 'task-1',
      title: 'Write tests',
      status: 'todo',
      dependsOn: [],
    }
    const blueprint: SnapshotBlueprint = {
      slug: 'my-feature',
      title: 'My Feature',
      status: 'in-progress',
      complexity: 'M',
      tasks: [task],
    }
    const snapshot: BlueprintSnapshot = {
      blueprints: [blueprint],
      fetchedAt: '2026-05-12T00:00:00.000Z',
    }
    expect(snapshot.blueprints).toHaveLength(1)
    expect(snapshot.blueprints[0]?.tasks).toHaveLength(1)
    expect(snapshot.fetchedAt).toStrictEqual('2026-05-12T00:00:00.000Z')
  })
})

// ---------------------------------------------------------------------------
// Runtime: BlueprintTemplateEntry shape
// ---------------------------------------------------------------------------

describe('BlueprintTemplateEntry', () => {
  it('has required name, slug, url and optional description', () => {
    const entry: BlueprintTemplateEntry = {
      name: 'SaaS Feature',
      slug: 'saas-feature',
      url: 'https://raw.githubusercontent.com/webpresso/templates/main/saas-feature.md',
    }
    expect(entry.name).toStrictEqual('SaaS Feature')
    expect(entry.description).toBeUndefined()

    const entryWithDesc: BlueprintTemplateEntry = {
      name: 'Auth Flow',
      slug: 'auth-flow',
      url: 'https://raw.githubusercontent.com/webpresso/templates/main/auth-flow.md',
      description: 'Standard OAuth2 authentication flow blueprint',
    }
    expect(entryWithDesc.description).toStrictEqual(
      'Standard OAuth2 authentication flow blueprint',
    )
  })
})

// ---------------------------------------------------------------------------
// Runtime: BlueprintEventPayload discriminated union narrowing
// ---------------------------------------------------------------------------

describe('BlueprintEventPayload discriminated union', () => {
  it('narrows correctly by type field', () => {
    const payload: BlueprintEventPayload = {
      type: 'blueprint.created',
      slug: 'test-feature',
      title: 'Test Feature',
      complexity: 'S',
      status: 'planned',
    }

    if (payload.type === 'blueprint.created') {
      expect(payload.slug).toStrictEqual('test-feature')
      expect(payload.complexity).toStrictEqual('S')
    } else {
      throw new Error('Expected blueprint.created payload')
    }
  })
})
