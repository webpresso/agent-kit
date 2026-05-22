/**
 * ReplicaManager — pull-on-demand replica freshness guard.
 *
 * Checks a TTL before calling getSnapshot() and implements a single-flight
 * pattern so that concurrent calls within the same process share the
 * in-flight pull promise (no thundering herd).
 *
 * Design decisions resolved 2026-05-12:
 *  Q3: 30 s TTL default; configurable via WP_BLUEPRINT_REPLICA_TTL_S.
 *  CEO review § 7: single-flight via module-level Map<key, Promise<void>>.
 *  WP_BLUEPRINT_PLATFORM_DISABLED=1: ensureFresh is always a no-op.
 */

import type { Database } from '#db/sqlite.js'

import type { BlueprintPlatformClient } from './types.js'

// ---------------------------------------------------------------------------
// Public types
// ---------------------------------------------------------------------------

export interface ReplicaState {
  readonly lastPulledAt: number // unix ms; 0 = never pulled
  readonly pullCount: number
  readonly consecutiveFailures: number
}

export interface ReplicaOptions {
  readonly ttlSeconds?: number // default: WP_BLUEPRINT_REPLICA_TTL_S or 30
  readonly client: BlueprintPlatformClient
  readonly db: Database
}

// ---------------------------------------------------------------------------
// Module-level single-flight registry
//
// Keyed by `slug ?? '*'`. If 6 parallel pll agents all expire the TTL at
// the same instant, only one getSnapshot() call goes out — the rest await
// the same Promise<void>.
// ---------------------------------------------------------------------------

const inflight = new Map<string, Promise<void>>()

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

const DEFAULT_TTL_S = 30

function getEnvTtl(): number {
  const raw = process.env['WP_BLUEPRINT_REPLICA_TTL_S']
  if (!raw) return DEFAULT_TTL_S
  const parsed = Number(raw)
  return Number.isFinite(parsed) && parsed >= 0 ? parsed : DEFAULT_TTL_S
}

function isPlatformDisabled(): boolean {
  return process.env['WP_BLUEPRINT_PLATFORM_DISABLED'] === '1'
}

// ---------------------------------------------------------------------------
// ReplicaManager
// ---------------------------------------------------------------------------

export class ReplicaManager {
  private lastPulledAt = 0
  private pullCount = 0
  private consecutiveFailures = 0

  constructor(private readonly opts: ReplicaOptions) {
    this.initSchema()
  }

  /**
   * Check freshness and pull if stale.
   *
   * Single-flight: concurrent calls within the same process share the
   * in-flight pull promise keyed by slug.
   */
  async ensureFresh(opts?: { readonly slug?: string }): Promise<void> {
    if (isPlatformDisabled()) return

    const ttlMs = (this.opts.ttlSeconds ?? getEnvTtl()) * 1000
    const ageMs = Date.now() - this.lastPulledAt
    if (ageMs < ttlMs) return // still fresh

    return this.scheduleWithSingleFlight(opts?.slug, () => this.doActualPull(opts?.slug))
  }

  /**
   * Force a pull regardless of TTL (e.g. used by `wp setup --sync`).
   * Does NOT participate in single-flight — each forcePull is independent.
   */
  async forcePull(opts?: { readonly slug?: string }): Promise<void> {
    return this.doActualPull(opts?.slug)
  }

  /** Current replica state for observability. */
  getState(): ReplicaState {
    return {
      lastPulledAt: this.lastPulledAt,
      pullCount: this.pullCount,
      consecutiveFailures: this.consecutiveFailures,
    }
  }

  // ── Private ───────────────────────────────────────────────────────────────

  private scheduleWithSingleFlight(
    slug: string | undefined,
    work: () => Promise<void>,
  ): Promise<void> {
    const key = slug ?? '*'
    const existing = inflight.get(key)
    if (existing !== undefined) return existing

    const pull = work().finally(() => {
      inflight.delete(key)
    })
    inflight.set(key, pull)
    return pull
  }

  private async doActualPull(slug?: string): Promise<void> {
    try {
      await this.opts.client.getSnapshot(slug !== undefined ? { slug } : undefined)
      const now = Date.now()
      this.lastPulledAt = now
      this.pullCount++
      this.consecutiveFailures = 0
      this.persistMeta(now)
    } catch (err: unknown) {
      this.consecutiveFailures++
      this.persistFailure()
      throw err
    }
  }

  // ── SQLite replica_meta schema ────────────────────────────────────────────

  private initSchema(): void {
    this.opts.db.exec(`
      CREATE TABLE IF NOT EXISTS replica_meta (
        key   TEXT PRIMARY KEY,
        value TEXT NOT NULL
      )
    `)

    // Load persisted state if present
    const row = this.opts.db
      .prepare<[], { key: string; value: string }>('SELECT key, value FROM replica_meta')
      .all()

    for (const { key, value } of row) {
      if (key === 'last_pulled_at') this.lastPulledAt = Number(value)
      if (key === 'pull_count') this.pullCount = Number(value)
      if (key === 'consecutive_failures') this.consecutiveFailures = Number(value)
    }
  }

  private persistMeta(now: number): void {
    const upsert = this.opts.db.prepare<[string, string]>(
      'INSERT INTO replica_meta (key, value) VALUES (?, ?) ON CONFLICT(key) DO UPDATE SET value = excluded.value',
    )
    const run = this.opts.db.transaction(() => {
      upsert.run('last_pulled_at', String(now))
      upsert.run('pull_count', String(this.pullCount))
      upsert.run('consecutive_failures', String(this.consecutiveFailures))
    })
    run()
  }

  private persistFailure(): void {
    const upsert = this.opts.db.prepare<[string, string]>(
      'INSERT INTO replica_meta (key, value) VALUES (?, ?) ON CONFLICT(key) DO UPDATE SET value = excluded.value',
    )
    upsert.run('consecutive_failures', String(this.consecutiveFailures))
  }
}
