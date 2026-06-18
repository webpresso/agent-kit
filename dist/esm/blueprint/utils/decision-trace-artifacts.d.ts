export interface DecisionTraceArtifact {
    timestamp: string;
    source_kind: string;
    source_id: string;
    trace_type: string;
    subject_kind: string;
    subject_id: string;
    context: Record<string, unknown>;
    decision: string;
    outcome: string;
    evidence: Record<string, unknown>;
    status: string;
}
export declare function emitTraceArtifact(projectRoot: string, artifact: DecisionTraceArtifact): string;
export declare function generateBlueprintLifecycleTrace(blueprintSlug: string, action: string, details: Record<string, unknown>): DecisionTraceArtifact;
//# sourceMappingURL=decision-trace-artifacts.d.ts.map