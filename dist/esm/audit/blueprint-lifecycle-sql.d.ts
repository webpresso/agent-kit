/**
 * `wp audit blueprint-lifecycle` — the single, deterministic blueprint-lifecycle
 * audit.
 *
 * The verdict is a pure function of `markdown@HEAD`: this builds an EPHEMERAL
 * in-memory SQLite projection from the repo's blueprint markdown
 * (`buildEphemeralProjection`), runs the relational checks against it, and
 * discards it. It also runs the structural markdown checks
 * (`auditBlueprintLifecycle` — type / status-vs-folder / `_overview.md` presence /
 * linking-frontmatter) and merges both result sets. No persistent on-disk
 * projection is read, so the audit can never hit a stale/missing/locked DB and
 * is identical across CLI, the `wp_audit` MCP tool, `wp doctor`, and CI.
 *
 * Relational checks (against the in-memory projection):
 * 1. Blueprints with status='in-progress' that have 0 tasks (invalid).
 * 2. Blueprints whose `status` column doesn't match the directory segment
 *    derived from `file_path`.
 * 3. Tasks in state 'in-progress' whose dependencies are not all done.
 * 4. Blueprints with progress_pct < 100 but status='completed'.
 */
import type { RepoAuditResult } from './repo-guardrails.js';
export interface BlueprintLifecycleAuditOptions {
    /** Opt-in: also audit `.omx/plans/` derived-handoff governance (`--legacy-omx`). */
    readonly includeOmxPlans?: boolean;
}
export declare function auditBlueprintLifecycleSql(cwd?: string, options?: BlueprintLifecycleAuditOptions): Promise<RepoAuditResult>;
//# sourceMappingURL=blueprint-lifecycle-sql.d.ts.map