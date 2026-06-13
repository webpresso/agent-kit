/**
 * `wp audit hook-surface` — enforces the single-rewriter-per-matcher invariant.
 *
 * From Anthropic's official hooks docs (May 2026):
 *   "When multiple PreToolUse hooks return updatedInput to rewrite a tool's
 *   arguments, the last one to finish wins. Since hooks run in parallel, the
 *   order is non-deterministic. Avoid having more than one hook modify the
 *   same tool's input."
 *
 * This audit collects hooks from:
 *   - ~/.claude/settings.json          (user-level)
 *   - $CLAUDE_PROJECT_DIR/.claude/settings.json  (project-level)
 *
 * It classifies each hook as a **rewriter** or a **validator**, then flags any
 * event+matcher combination that has more than one rewriter registered.
 *
 * Known rewriters (hardcoded, expandable):
 *   - `rtk hook claude` → Bash rewriter
 *   - any hook path ending in `pretooluse.mjs`
 */
import type { RepoAuditResult } from './repo-guardrails.js';
/** A normalised hook entry carrying runtime, event, command, and optional matcher. */
export type HookEntry = {
    readonly runtime: string;
    readonly event: string;
    readonly command: string;
    readonly matcher?: string;
};
/** A drift violation: the same owner+command appears >1 time for the same runtime+event. */
export type DriftViolation = {
    readonly key: string;
    readonly count: number;
    readonly entries: readonly HookEntry[];
};
export interface HookSurfaceViolation {
    readonly event: string;
    readonly matcher: string;
    readonly rewriters: readonly string[];
    readonly reason: string;
}
export interface HookSurfaceDetails {
    readonly ok: boolean;
    readonly violations: readonly HookSurfaceViolation[];
}
export interface HookSurfaceResult {
    readonly passed: boolean;
    readonly kind: 'hook-surface';
    readonly details: HookSurfaceDetails;
}
/**
 * Determines the canonical owner of a hook command using priority-ordered
 * pattern matching. Returns one of: 'webpresso', 'omx',
 * 'rtk', 'gstack', or 'unknown'.
 */
export declare function extractOwner(command: string): string;
/**
 * Detects drift violations where the same owner+command appears more than once
 * for the same runtime+event combination. Cross-owner same-event composition
 * is NOT a violation — only same-owner/same-command duplication is.
 *
 * Pure function — no filesystem I/O.
 */
export declare function detectDrift(entries: readonly HookEntry[]): DriftViolation[];
export interface HookSurfaceOptions {
    /** Repository root. Falls back to CLAUDE_PROJECT_DIR env var when omitted. */
    readonly projectDir?: string;
    /**
     * Override path to the user-level settings file.
     * Defaults to ~/.claude/settings.json.
     * Useful in tests to avoid reading real user settings.
     */
    readonly userSettingsPath?: string;
}
/**
 * Run the hook-surface audit.
 */
export declare function auditHookSurface(projectDirOrOpts?: string | HookSurfaceOptions): HookSurfaceResult;
/**
 * Adapter returning a RepoAuditResult shape for registry integration.
 */
export declare function auditHookSurfaceAsRepoResult(projectDirOrOpts?: string | HookSurfaceOptions): RepoAuditResult;
//# sourceMappingURL=hook-surface.d.ts.map