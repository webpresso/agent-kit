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
// ---------------------------------------------------------------------------
// Module-level single-flight registry
//
// Keyed by `slug ?? '*'`. If 6 parallel pll agents all expire the TTL at
// the same instant, only one getSnapshot() call goes out — the rest await
// the same Promise<void>.
// ---------------------------------------------------------------------------
const inflight = new Map();
// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------
const DEFAULT_TTL_S = 30;
function getEnvTtl() {
    const raw = process.env["WP_BLUEPRINT_REPLICA_TTL_S"];
    if (!raw)
        return DEFAULT_TTL_S;
    const parsed = Number(raw);
    return Number.isFinite(parsed) && parsed >= 0 ? parsed : DEFAULT_TTL_S;
}
function isPlatformDisabled() {
    return process.env["WP_BLUEPRINT_PLATFORM_DISABLED"] === "1";
}
// ---------------------------------------------------------------------------
// ReplicaManager
// ---------------------------------------------------------------------------
export class ReplicaManager {
    opts;
    lastPulledAt = 0;
    pullCount = 0;
    consecutiveFailures = 0;
    constructor(opts) {
        this.opts = opts;
        this.initSchema();
    }
    /**
     * Check freshness and pull if stale.
     *
     * Single-flight: concurrent calls within the same process share the
     * in-flight pull promise keyed by slug.
     */
    async ensureFresh(opts) {
        if (isPlatformDisabled())
            return;
        const ttlMs = (this.opts.ttlSeconds ?? getEnvTtl()) * 1000;
        const ageMs = Date.now() - this.lastPulledAt;
        if (ageMs < ttlMs)
            return; // still fresh
        return this.scheduleWithSingleFlight(opts?.slug, () => this.doActualPull(opts?.slug));
    }
    /**
     * Force a pull regardless of TTL (e.g. used by `wp setup --sync`).
     * Does NOT participate in single-flight — each forcePull is independent.
     */
    async forcePull(opts) {
        return this.doActualPull(opts?.slug);
    }
    /** Current replica state for observability. */
    getState() {
        return {
            lastPulledAt: this.lastPulledAt,
            pullCount: this.pullCount,
            consecutiveFailures: this.consecutiveFailures,
        };
    }
    // ── Private ───────────────────────────────────────────────────────────────
    scheduleWithSingleFlight(slug, work) {
        const key = slug ?? "*";
        const existing = inflight.get(key);
        if (existing !== undefined)
            return existing;
        const pull = work().finally(() => {
            inflight.delete(key);
        });
        inflight.set(key, pull);
        return pull;
    }
    async doActualPull(slug) {
        try {
            await this.opts.client.getSnapshot(slug !== undefined ? { slug } : undefined);
            const now = Date.now();
            this.lastPulledAt = now;
            this.pullCount++;
            this.consecutiveFailures = 0;
            this.persistMeta(now);
        }
        catch (err) {
            this.consecutiveFailures++;
            this.persistFailure();
            throw err;
        }
    }
    // ── SQLite replica_meta schema ────────────────────────────────────────────
    initSchema() {
        this.opts.db.exec(`
      CREATE TABLE IF NOT EXISTS replica_meta (
        key   TEXT PRIMARY KEY,
        value TEXT NOT NULL
      )
    `);
        // Load persisted state if present
        const row = this.opts.db
            .prepare("SELECT key, value FROM replica_meta")
            .all();
        for (const { key, value } of row) {
            if (key === "last_pulled_at")
                this.lastPulledAt = Number(value);
            if (key === "pull_count")
                this.pullCount = Number(value);
            if (key === "consecutive_failures")
                this.consecutiveFailures = Number(value);
        }
    }
    persistMeta(now) {
        const upsert = this.opts.db.prepare("INSERT INTO replica_meta (key, value) VALUES (?, ?) ON CONFLICT(key) DO UPDATE SET value = excluded.value");
        const run = this.opts.db.transaction(() => {
            upsert.run("last_pulled_at", String(now));
            upsert.run("pull_count", String(this.pullCount));
            upsert.run("consecutive_failures", String(this.consecutiveFailures));
        });
        run();
    }
    persistFailure() {
        const upsert = this.opts.db.prepare("INSERT INTO replica_meta (key, value) VALUES (?, ?) ON CONFLICT(key) DO UPDATE SET value = excluded.value");
        upsert.run("consecutive_failures", String(this.consecutiveFailures));
    }
}
//# sourceMappingURL=replica.js.map