/**
 * `wp audit hook-vendor-drift` — compares CAPABILITY_MATRIX event declarations
 * against the events actually present in installed vendor hook files.
 *
 * Exits 1 when any finding has severity='error' (undocumented events in
 * installed hooks that are not in CAPABILITY_MATRIX). Warnings are
 * informational: matrix says 'full' but the event is absent from installed
 * hooks. Useful as a CI gate to catch vendor-docs drift after re-verification
 * (Hookbridge sync pattern).
 */
export type DriftFinding = {
    readonly event: string;
    readonly vendor: 'claude' | 'codex';
    readonly expected: string;
    readonly actual: string;
    readonly severity: 'error' | 'warning';
};
export type DriftReport = {
    readonly findings: readonly DriftFinding[];
    readonly exitCode: 0 | 1;
};
/**
 * Compare CAPABILITY_MATRIX against the events found in installed vendor hook
 * files. Returns findings for any mismatch.
 *
 * installedEvents: map of vendor key → set of event names present in their
 * hooks file.
 */
export declare function detectDrift(installedEvents: Readonly<Record<string, ReadonlySet<string>>>): readonly DriftFinding[];
export declare function auditHookVendorDrift(options: {
    repoRoot: string;
    fix?: boolean;
}): Promise<DriftReport>;
//# sourceMappingURL=hook-vendor-drift.d.ts.map