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
import type { Database } from "#db/sqlite.js";
import type { BlueprintPlatformClient } from "./types.js";
export interface ReplicaState {
    readonly lastPulledAt: number;
    readonly pullCount: number;
    readonly consecutiveFailures: number;
}
export interface ReplicaOptions {
    readonly ttlSeconds?: number;
    readonly client: BlueprintPlatformClient;
    readonly db: Database;
}
export declare class ReplicaManager {
    private readonly opts;
    private lastPulledAt;
    private pullCount;
    private consecutiveFailures;
    constructor(opts: ReplicaOptions);
    /**
     * Check freshness and pull if stale.
     *
     * Single-flight: concurrent calls within the same process share the
     * in-flight pull promise keyed by slug.
     */
    ensureFresh(opts?: {
        readonly slug?: string;
    }): Promise<void>;
    /**
     * Force a pull regardless of TTL (e.g. used by `wp setup --sync`).
     * Does NOT participate in single-flight — each forcePull is independent.
     */
    forcePull(opts?: {
        readonly slug?: string;
    }): Promise<void>;
    /** Current replica state for observability. */
    getState(): ReplicaState;
    private scheduleWithSingleFlight;
    private doActualPull;
    private initSchema;
    private persistMeta;
    private persistFailure;
}
//# sourceMappingURL=replica.d.ts.map