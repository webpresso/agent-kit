/**
 * ReplicaManager tests — pull-on-demand replica freshness guard.
 *
 * Uses in-memory SQLite (:memory:) throughout, same pattern as
 * src/blueprint/db/ingester.test.ts.
 */

import Database from 'better-sqlite3'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

import type { BlueprintPlatformClient, BlueprintSnapshot } from './types.js'
import { ReplicaManager } from './replica.js'

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function makeSnapshot(): BlueprintSnapshot {
  return { blueprints: [], fetchedAt: new Date().toISOString() }
}

function makeClient(overrides?: Partial<BlueprintPlatformClient>): BlueprintPlatformClient {
  return {
    pushEvent: vi.fn().mockResolvedValue(undefined),
    getSnapshot: vi.fn().mockResolvedValue(makeSnapshot()),
    listTemplates: vi.fn().mockResolvedValue([]),
    healthCheck: vi.fn().mockResolvedValue({ ok: true, latencyMs: 1 }),
    ...overrides,
  }
}

function makeDb(): Database.Database {
  const db = new Database(':memory:')
  return db
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe('ReplicaManager', () => {
  let db: Database.Database
  let client: BlueprintPlatformClient

  beforeEach(() => {
    db = makeDb()
    client = makeClient()
    vi.unstubAllEnvs()
  })

  afterEach(() => {
    db.close()
  })

  // ── 1. Fresh replica (age < TTL) → no network call ─────────────────────
  it('does not call getSnapshot when replica is fresh', async () => {
    const manager = new ReplicaManager({ ttlSeconds: 60, client, db })
    // Simulate a recent pull by calling forcePull first
    await manager.forcePull()
    const callsBefore = (client.getSnapshot as ReturnType<typeof vi.fn>).mock.calls.length

    await manager.ensureFresh()

    const callsAfter = (client.getSnapshot as ReturnType<typeof vi.fn>).mock.calls.length
    expect(callsAfter).toStrictEqual(callsBefore)
  })

  // ── 2. Stale replica (age ≥ TTL) → calls getSnapshot once ──────────────
  it('calls getSnapshot when replica is stale', async () => {
    const manager = new ReplicaManager({ ttlSeconds: 0, client, db })

    await manager.ensureFresh()

    expect(client.getSnapshot).toHaveBeenCalledTimes(1)
  })

  // ── 3. TTL = 0 → always pulls ───────────────────────────────────────────
  it('always pulls when TTL is 0 (every call is stale)', async () => {
    const manager = new ReplicaManager({ ttlSeconds: 0, client, db })

    await manager.ensureFresh()
    await manager.ensureFresh()

    expect(client.getSnapshot).toHaveBeenCalledTimes(2)
  })

  // ── 4. Single-flight: two concurrent calls → exactly one network call ───
  it('coalesces concurrent ensureFresh calls into a single getSnapshot call', async () => {
    const manager = new ReplicaManager({ ttlSeconds: 0, client, db })

    const [, ] = await Promise.all([manager.ensureFresh(), manager.ensureFresh()])

    expect(client.getSnapshot).toHaveBeenCalledTimes(1)
  })

  // ── 5. AK_BLUEPRINT_PLATFORM_DISABLED=1 → ensureFresh is a no-op ───────
  it('is a no-op when AK_BLUEPRINT_PLATFORM_DISABLED=1', async () => {
    vi.stubEnv('AK_BLUEPRINT_PLATFORM_DISABLED', '1')

    const manager = new ReplicaManager({ ttlSeconds: 0, client, db })

    await manager.ensureFresh()
    await manager.ensureFresh()

    expect(client.getSnapshot).not.toHaveBeenCalled()
  })

  // ── 6. forcePull always calls getSnapshot regardless of freshness ───────
  it('forcePull always pulls even when replica is fresh', async () => {
    const manager = new ReplicaManager({ ttlSeconds: 3600, client, db })

    // Two force pulls back-to-back
    await manager.forcePull()
    await manager.forcePull()

    expect(client.getSnapshot).toHaveBeenCalledTimes(2)
  })

  // ── 7. getState() returns correct fields ────────────────────────────────
  it('getState returns correct lastPulledAt, pullCount, and consecutiveFailures', async () => {
    const manager = new ReplicaManager({ ttlSeconds: 0, client, db })

    const stateBefore = manager.getState()
    expect(stateBefore.lastPulledAt).toStrictEqual(0)
    expect(stateBefore.pullCount).toStrictEqual(0)
    expect(stateBefore.consecutiveFailures).toStrictEqual(0)

    const t0 = Date.now()
    await manager.ensureFresh()
    const t1 = Date.now()

    const stateAfter = manager.getState()
    expect(stateAfter.pullCount).toStrictEqual(1)
    expect(stateAfter.consecutiveFailures).toStrictEqual(0)
    expect(stateAfter.lastPulledAt).toBeGreaterThanOrEqual(t0)
    expect(stateAfter.lastPulledAt).toBeLessThanOrEqual(t1)
  })

  // ── 8. Failed pull → consecutiveFailures increments; success → resets ──
  it('increments consecutiveFailures on failure and resets on success', async () => {
    const failingGetSnapshot = vi
      .fn()
      .mockRejectedValueOnce(new Error('network error'))
      .mockResolvedValueOnce(makeSnapshot())

    const failingClient = makeClient({ getSnapshot: failingGetSnapshot })
    const manager = new ReplicaManager({ ttlSeconds: 0, client: failingClient, db })

    // First call — should fail
    await expect(manager.forcePull()).rejects.toThrow('network error')
    expect(manager.getState().consecutiveFailures).toStrictEqual(1)

    // Second call — should succeed and reset
    await manager.forcePull()
    expect(manager.getState().consecutiveFailures).toStrictEqual(0)
    expect(manager.getState().pullCount).toStrictEqual(1)
  })

  // ── 9. offline throws, not buffers — contract test ──────────────────────
  it('throws when getSnapshot fails — does not buffer offline mutations', async () => {
    const failingGetSnapshot = vi.fn<() => Promise<BlueprintSnapshot>>().mockRejectedValue(
      new Error('ECONNREFUSED'),
    )
    const failingClient = makeClient({ getSnapshot: failingGetSnapshot })
    const manager = new ReplicaManager({ client: failingClient, db: makeDb(), ttlSeconds: 0 })

    // ensureFresh → scheduleWithSingleFlight → doActualPull re-throws on failure
    await expect(manager.ensureFresh()).rejects.toThrow('ECONNREFUSED')
    expect(manager.getState().consecutiveFailures).toStrictEqual(1)
  })

  // ── 10. consecutiveFailures resets to 0 after success following failure ──
  it('resets consecutiveFailures to 0 after a successful pull following failures', async () => {
    const snapshot = makeSnapshot()
    const failThenSucceedGetSnapshot = vi.fn<() => Promise<BlueprintSnapshot>>()
      .mockRejectedValueOnce(new Error('timeout'))
      .mockResolvedValue(snapshot)

    const failingClient = makeClient({ getSnapshot: failThenSucceedGetSnapshot })
    const manager = new ReplicaManager({ client: failingClient, db: makeDb(), ttlSeconds: 0 })

    // First call fails → consecutiveFailures = 1
    await expect(manager.ensureFresh()).rejects.toThrow('timeout')
    expect(manager.getState().consecutiveFailures).toStrictEqual(1)

    // Second call succeeds → consecutiveFailures resets to 0
    await manager.ensureFresh()
    expect(manager.getState().consecutiveFailures).toStrictEqual(0)
  })

  // ── env TTL override ─────────────────────────────────────────────────────
  it('uses AK_BLUEPRINT_REPLICA_TTL_S env var when ttlSeconds is not provided', async () => {
    vi.stubEnv('AK_BLUEPRINT_REPLICA_TTL_S', '3600')

    const manager = new ReplicaManager({ client, db })

    // Force a pull to mark replica fresh
    await manager.forcePull()
    const callsBefore = (client.getSnapshot as ReturnType<typeof vi.fn>).mock.calls.length

    // With 3600s TTL, a fresh replica should NOT trigger another pull
    await manager.ensureFresh()
    const callsAfter = (client.getSnapshot as ReturnType<typeof vi.fn>).mock.calls.length
    expect(callsAfter).toStrictEqual(callsBefore)
  })
})
