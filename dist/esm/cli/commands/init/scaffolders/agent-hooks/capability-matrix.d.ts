/**
 * Capability matrix — per-vendor, per-event hook support data.
 *
 * Documents what each agent CLI supports for each hook event, based on
 * official docs. Used by T13 (status), T14 (deny), and T22 (audit) to
 * explain gaps and emit correct per-vendor configurations.
 *
 * cursor column reflects the emitted Cursor hooks.json surface plus the
 * documented third-party compatibility caveats (opt-in compat, required
 * `version: 1`, and unmapped events: PermissionRequest and Notification
 * are NOT mapped in Cursor's third-party compatibility table).
 *
 * opencode column reflects the JS plugin API surface (opencode.ai/docs/plugins/):
 * - session.created / experimental.session.compacting → SessionStart context refresh (full)
 * - tool.execute.before / after → PreToolUse / PostToolUse (full)
 * - PermissionRequest is a degraded native callback; no managed permission hook is emitted
 * - experimental.session.compacting refreshes context; no managed PreCompact snapshot hook is emitted
 * - No UserPromptSubmit, Stop, SubagentStart/Stop, SessionEnd, PostCompact equivalent
 */
export type SupportLevel = 'full' | 'partial' | 'unmapped' | 'unsupported';
export type VendorCapability = {
    readonly event: string;
    readonly claude: SupportLevel;
    readonly codex: SupportLevel;
    readonly cursor: SupportLevel;
    readonly opencode: SupportLevel;
    readonly notes?: string;
};
export type CapabilityMatrixHost = 'claude' | 'codex' | 'cursor' | 'opencode';
export type ReplacementParitySupportLevel = 'full' | 'degraded' | 'unsupported';
export type ReplacementParityCapabilityCrosswalk = {
    readonly capability: string;
    readonly events: readonly string[];
    readonly hosts: readonly CapabilityMatrixHost[];
    readonly notes: string;
};
export type ReplacementParityRowLike = {
    readonly capability: string;
    readonly hostScope: string;
    readonly supportLevel: ReplacementParitySupportLevel;
    readonly status?: string;
};
/**
 * Canonical capability matrix for all hook events across supported agent CLIs.
 *
 * claude/codex are Tier 1 CLIs (see supported-agent-clis.md).
 * cursor/opencode are Tier 2 CLIs — best-effort, documented degradations.
 */
export declare const CAPABILITY_MATRIX: readonly VendorCapability[];
export declare const REPLACEMENT_PARITY_CAPABILITY_CROSSWALK: readonly ReplacementParityCapabilityCrosswalk[];
export interface ReplacementParityCrosswalkViolation {
    readonly capability: string;
    readonly message: string;
}
export declare function replacementParitySupportCeiling(crosswalk: ReplacementParityCapabilityCrosswalk): ReplacementParitySupportLevel;
export declare function validateReplacementParityCapabilityCrosswalk(rows: readonly ReplacementParityRowLike[], crosswalks?: readonly ReplacementParityCapabilityCrosswalk[]): ReplacementParityCrosswalkViolation[];
//# sourceMappingURL=capability-matrix.d.ts.map