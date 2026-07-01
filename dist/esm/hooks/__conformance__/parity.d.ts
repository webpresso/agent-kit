/**
 * Source-vs-compiled lane parity (P4 support).
 *
 * Hooks fire from the COMPILED `bin/runtime/<target>/wp` in production (bin/runtime-lanes
 * forces `hook`/`mcp` to the runtime lane), which can silently diverge from source. To
 * make "green CI ⇒ hooks work" trustworthy we replay the same conformance matrix through
 * both lanes and assert they agree. This module is the lane-agnostic comparison core;
 * the e2e test supplies the real spawned results.
 */
import type { ConformanceRow, HookRunResult } from "./matrix.js";
/** A coarse, lane-comparable decision derived from a hook run. */
export type LaneDecision = "deny" | "allow-or-empty";
export declare function laneDecision(result: HookRunResult): LaneDecision;
export type LaneDivergence = {
    readonly row: string;
    readonly source: LaneDecision;
    readonly compiled: LaneDecision;
};
/**
 * Find rows where the source lane and the compiled lane disagree. A non-empty result
 * means the compiled runtime is stale/divergent relative to source — the exact failure
 * the parity gate must catch.
 */
export declare function findLaneDivergences(rows: readonly ConformanceRow[], source: ReadonlyMap<string, HookRunResult>, compiled: ReadonlyMap<string, HookRunResult>): readonly LaneDivergence[];
//# sourceMappingURL=parity.d.ts.map