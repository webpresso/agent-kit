/**
 * Shared shell-command identity primitives for hook dedup.
 *
 * These regexes recognise the materialized shell forms a managed wp-* hook
 * command can take across vendors: a raw `node_modules/.bin/*` path, both the
 * legacy `[ -x X ] && X || <fallback>` and current
 * `if [ -x X ]; then X; else <fallback>; fi` guarded launchers, and the
 * `.claude/hooks/managed` / `.codex/managed-hooks` launcher scripts. They are
 * the single source of truth for command-target extraction used by `merge.ts`
 * (dedup), the Claude/Codex bin extractors in `index.ts`, and
 * `codex-ownership.ts`.
 *
 * Keep them here, not copied per consumer: a change to one quoting/fallback
 * form must update every extractor at once, or dedup diverges asymmetrically
 * between vendors and managed hooks double-install on the next `wp setup`.
 */
export declare const DIRECT_NODE_MODULES_BIN_PATTERN: RegExp;
export declare const GUARDED_NODE_MODULES_BIN_PATTERN: RegExp;
export declare const IF_GUARDED_NODE_MODULES_BIN_PATTERN: RegExp;
export declare const DIRECT_CLAUDE_NODE_MODULES_BIN_PATTERN: RegExp;
export declare const GUARDED_CLAUDE_NODE_MODULES_BIN_PATTERN: RegExp;
export declare const IF_GUARDED_CLAUDE_NODE_MODULES_BIN_PATTERN: RegExp;
export declare const DIRECT_MANAGED_HOOK_LAUNCHER_PATTERN: RegExp;
export declare const GUARDED_MANAGED_HOOK_LAUNCHER_PATTERN: RegExp;
export declare const IF_GUARDED_MANAGED_HOOK_LAUNCHER_PATTERN: RegExp;
/**
 * Strip a single matching pair of outer shell quotes (`'...'` or `"..."`).
 * Returns the value unchanged when there is no matching outer pair.
 */
export declare function stripSingleShellQuotePair(value: string): string;
//# sourceMappingURL=shell-identity.d.ts.map