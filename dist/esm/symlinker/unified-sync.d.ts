/**
 * Unified rule + skill sync.
 *
 * Source of truth: catalog (`<pkg>/dist/catalog/agent/{rules,skills}/`) UNION
 * consumer (`<repo>/agent-{rules,skills}/`). The loader returns a
 * source-tagged record list; this module projects that list into per-IDE
 * surfaces according to `DEFAULT_UNIFIED_CONSUMERS`.
 *
 * Per-consumer strategy:
 *   - 'symlink':   relative symlink (file for rules, dir for skills).
 *   - 'copy':      atomic copy (file for rules, recursive copy for skills).
 *   - 'transform': apply the consumer's transform function to the record body
 *                  and atomic-write the result at the target path.
 *
 * Prune: any file/dir under a consumer's dir whose name matches the unified
 * filename pattern but is not in the expected set is removed. This propagates
 * deletions in `agent-rules/` and `agent-skills/` to per-IDE cleanup.
 *
 * `--check` mode (dry-run): produce a list of (target, status) pairs and
 * return the count of mismatches; perform no writes.
 */
import { type ContentKind } from "#content/loader";
import { type UnifiedConsumerConfig } from "./consumers.js";
export interface UnifiedSyncOptions {
    readonly catalogDir: string;
    readonly consumerRoot: string;
    /** Optional kind filter. Default: rules + skills. */
    readonly kinds?: readonly ContentKind[];
    /** When true, report mismatches without writing. */
    readonly check?: boolean;
    /** Override consumer registry (testing). Takes precedence over `hosts`. */
    readonly consumers?: readonly UnifiedConsumerConfig[];
    /**
     * Selected agent hosts (`hosts.selected` from `.webpressorc.json`). When
     * `consumers` is not given, the active consumer set is host-gated via
     * `selectUnifiedConsumers`: plugin hosts (Claude, Codex) get no skill-dir
     * projection, OpenCode gets `.opencode/skills`. Undefined → plugin-first
     * default (no host skill dirs).
     */
    readonly hosts?: readonly string[];
    /**
     * Optional allowlist of skill slugs. When provided, only `kind === 'skill'`
     * records whose slug is in this set are projected. Rules are unaffected.
     * Used by `wp setup` to gate Tier-3 skills behind opt-in selection while
     * still letting all canonical rules flow through.
     */
    readonly allowedSkillSlugs?: ReadonlySet<string>;
    /**
     * Optional set of skill slugs that must NOT be pruned even though they are
     * absent from the projected record set. Used by `wp setup` for skills that
     * are produced by separate scaffolders (e.g. the rendered
     * generated skills that are produced outside the catalog.
     */
    readonly preserveSkillSlugs?: ReadonlySet<string>;
}
export interface UnifiedSyncMismatch {
    readonly consumerId: string;
    readonly targetPath: string;
    readonly reason: string;
}
export interface UnifiedSyncResult {
    /** Number of writes performed (or, in check mode, mismatches detected). */
    readonly fixCount: number;
    /** Mismatches surfaced in check mode. Empty in non-check mode. */
    readonly mismatches: readonly UnifiedSyncMismatch[];
}
export declare function isSymlinkPointingTo(linkPath: string, expectedAbs: string): boolean;
/**
 * Main entrypoint. See module docstring.
 */
export declare function runUnifiedSync(options: UnifiedSyncOptions): UnifiedSyncResult;
//# sourceMappingURL=unified-sync.d.ts.map