/**
 * Shared shell-command identity primitives for hook dedup.
 *
 * These regexes recognise the materialized shell forms a managed wp-* hook
 * command can take across vendors: a raw `node_modules/.bin/*` path, the
 * `[ -x X ] && X || <fallback>` guarded launcher, and the
 * `.claude/hooks/managed` / `.codex/managed-hooks` launcher scripts. They are
 * the single source of truth for command-target extraction used by `merge.ts`
 * (dedup), the Claude/Codex bin extractors in `index.ts`, and
 * `codex-ownership.ts`.
 *
 * Keep them here, not copied per consumer: a change to one quoting/fallback
 * form must update every extractor at once, or dedup diverges asymmetrically
 * between vendors and managed hooks double-install on the next `wp setup`.
 */
export const DIRECT_NODE_MODULES_BIN_PATTERN = /^(?:\.\/|\/.*\/)?node_modules\/\.bin\/([\w-]+)$/u;
export const GUARDED_NODE_MODULES_BIN_PATTERN = /^\[ -x (["']?)((?:\.\/|\/.*\/)?node_modules\/\.bin\/([\w-]+))\1 \] && \1\2\1 \|\| (?:true|printf .+)$/u;
export const DIRECT_CLAUDE_NODE_MODULES_BIN_PATTERN = /^["']?\$CLAUDE_PROJECT_DIR\/node_modules\/\.bin\/([\w-]+)["']?$/u;
export const GUARDED_CLAUDE_NODE_MODULES_BIN_PATTERN = /^\[ -x (["']?)\$CLAUDE_PROJECT_DIR\/node_modules\/\.bin\/([\w-]+)\1 \] && \1\$CLAUDE_PROJECT_DIR\/node_modules\/\.bin\/\2\1 \|\| (?:true|printf .+)$/u;
export const DIRECT_MANAGED_HOOK_LAUNCHER_PATTERN = /^(?:["']?)((?:\$CLAUDE_PROJECT_DIR\/\.claude\/hooks\/managed|(?:\.\/|\/.*\/)?\.claude\/hooks\/managed|(?:\.\/|\/.*\/)?\.codex\/managed-hooks)\/((?:wp|ak)-[\w-]+)\.sh)(?:["']?)$/u;
export const GUARDED_MANAGED_HOOK_LAUNCHER_PATTERN = /^\[ -x (["']?)((?:\$CLAUDE_PROJECT_DIR\/\.claude\/hooks\/managed|(?:\.\/|\/.*\/)?\.claude\/hooks\/managed|(?:\.\/|\/.*\/)?\.codex\/managed-hooks)\/((?:wp|ak)-[\w-]+)\.sh)\1 \] && \1\2\1 \|\| (?:true|printf .+)$/u;
/**
 * Strip a single matching pair of outer shell quotes (`'...'` or `"..."`).
 * Returns the value unchanged when there is no matching outer pair.
 */
export function stripSingleShellQuotePair(value) {
    if (value.length < 2)
        return value;
    const first = value[0];
    const last = value[value.length - 1];
    if ((first === '"' && last === '"') || (first === "'" && last === "'")) {
        return value.slice(1, -1);
    }
    return value;
}
//# sourceMappingURL=shell-identity.js.map