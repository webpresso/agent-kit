/**
 * Persists decision-trace artifacts to the repo's `.webpresso/decision-traces/`
 * directory. Used by BlueprintService to record lifecycle events.
 *
 * Inlined so this package has no external runtime dependencies.
 */
import { existsSync, mkdirSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
function sanitizeTimestamp(isoTimestamp) {
    return isoTimestamp.replaceAll(':', '-');
}
export function emitTraceArtifact(projectRoot, artifact) {
    const traceDir = join(projectRoot, '.webpresso', 'decision-traces');
    if (!existsSync(traceDir)) {
        mkdirSync(traceDir, { recursive: true });
    }
    const filename = `${sanitizeTimestamp(artifact.timestamp)}-${artifact.source_kind}.json`;
    const filePath = join(traceDir, filename);
    writeFileSync(filePath, JSON.stringify(artifact, null, 2), 'utf-8');
    return filePath;
}
export function generateBlueprintLifecycleTrace(blueprintSlug, action, details) {
    return {
        timestamp: new Date().toISOString(),
        source_kind: 'blueprint_lifecycle',
        source_id: `blueprint-${blueprintSlug}-${Date.now()}`,
        trace_type: action,
        subject_kind: 'blueprint',
        subject_id: blueprintSlug,
        context: details,
        decision: action,
        outcome: 'success',
        evidence: {},
        status: 'success',
    };
}
//# sourceMappingURL=decision-trace-artifacts.js.map