/**
 * Lightweight list of the compiled `wp_*` MCP tool names, in registry order.
 *
 * Kept as a plain literal with **no** tool-module imports so that consumers on
 * latency-sensitive paths (the SessionStart hook, via
 * `#hooks/shared/instruction-surfaces`) do not pull the whole MCP tool graph
 * (zod schemas, runners) into their import graph. Parity with the real surface
 * is enforced by `_names.test.ts` against `COMPILED_TOOL_REGISTRY`, so this list
 * cannot silently drift.
 */
export declare const WP_TOOL_NAMES: readonly ["wp_audit", "wp_audits", "wp_bench", "wp_ci_act", "wp_e2e", "wp_format", "wp_gain", "wp_lint", "wp_pr_status", "wp_qa", "wp_release_readiness", "wp_session_batch_execute", "wp_session_capture", "wp_session_doctor", "wp_session_execute", "wp_session_execute_file", "wp_session_fetch_and_index", "wp_session_index", "wp_session_purge", "wp_session_retrieve", "wp_session_restore", "wp_session_search", "wp_session_snapshot", "wp_session_stats", "wp_test", "wp_typecheck", "wp_worker_tail", "wp_worktree"];
//# sourceMappingURL=_names.d.ts.map