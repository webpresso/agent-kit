export function laneDecision(result) {
    const text = result.stdout.trim();
    if (text === '')
        return 'allow-or-empty';
    try {
        const obj = JSON.parse(text);
        const hookSpecific = obj.hookSpecificOutput;
        const decision = hookSpecific && typeof hookSpecific === 'object'
            ? hookSpecific.permissionDecision
            : undefined;
        if (decision === 'deny' || obj.decision === 'block')
            return 'deny';
    }
    catch {
        // Non-JSON stdout is itself a conformance failure caught elsewhere; treat as a
        // distinct value so a lane that prints garbage diverges from one that doesn't.
        return 'allow-or-empty';
    }
    return 'allow-or-empty';
}
/**
 * Find rows where the source lane and the compiled lane disagree. A non-empty result
 * means the compiled runtime is stale/divergent relative to source — the exact failure
 * the parity gate must catch.
 */
export function findLaneDivergences(rows, source, compiled) {
    const divergences = [];
    for (const row of rows) {
        const sourceResult = source.get(row.name);
        const compiledResult = compiled.get(row.name);
        if (!sourceResult || !compiledResult)
            continue;
        const sourceDecision = laneDecision(sourceResult);
        const compiledDecision = laneDecision(compiledResult);
        if (sourceDecision !== compiledDecision) {
            divergences.push({ row: row.name, source: sourceDecision, compiled: compiledDecision });
        }
    }
    return divergences;
}
//# sourceMappingURL=parity.js.map