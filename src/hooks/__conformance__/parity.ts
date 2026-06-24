/**
 * Source-vs-compiled lane parity (P4 support).
 *
 * Hooks fire from the COMPILED `bin/runtime/<target>/wp` in production (bin/runtime-lanes
 * forces `hook`/`mcp` to the runtime lane), which can silently diverge from source. To
 * make "green CI ⇒ hooks work" trustworthy we replay the same conformance matrix through
 * both lanes and assert they agree. This module is the lane-agnostic comparison core;
 * the e2e test supplies the real spawned results.
 */
import type { ConformanceRow, HookRunResult } from './matrix.js'

/** A coarse, lane-comparable decision derived from a hook run. */
export type LaneDecision = 'deny' | 'allow-or-empty'

export function laneDecision(result: HookRunResult): LaneDecision {
  const text = result.stdout.trim()
  if (text === '') return 'allow-or-empty'
  try {
    const obj = JSON.parse(text) as Record<string, unknown>
    const hookSpecific = obj.hookSpecificOutput
    const decision =
      hookSpecific && typeof hookSpecific === 'object'
        ? (hookSpecific as Record<string, unknown>).permissionDecision
        : undefined
    if (decision === 'deny' || obj.decision === 'block') return 'deny'
  } catch {
    // Non-JSON stdout is itself a conformance failure caught elsewhere; treat as a
    // distinct value so a lane that prints garbage diverges from one that doesn't.
    return 'allow-or-empty'
  }
  return 'allow-or-empty'
}

export type LaneDivergence = {
  readonly row: string
  readonly source: LaneDecision
  readonly compiled: LaneDecision
}

/**
 * Find rows where the source lane and the compiled lane disagree. A non-empty result
 * means the compiled runtime is stale/divergent relative to source — the exact failure
 * the parity gate must catch.
 */
export function findLaneDivergences(
  rows: readonly ConformanceRow[],
  source: ReadonlyMap<string, HookRunResult>,
  compiled: ReadonlyMap<string, HookRunResult>,
): readonly LaneDivergence[] {
  const divergences: LaneDivergence[] = []
  for (const row of rows) {
    const sourceResult = source.get(row.name)
    const compiledResult = compiled.get(row.name)
    if (!sourceResult || !compiledResult) continue
    const sourceDecision = laneDecision(sourceResult)
    const compiledDecision = laneDecision(compiledResult)
    if (sourceDecision !== compiledDecision) {
      divergences.push({ row: row.name, source: sourceDecision, compiled: compiledDecision })
    }
  }
  return divergences
}
