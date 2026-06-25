/**
 * Compiled plugin module basenames shipped next to the generated oxlintrc.json.
 * Kept in lockstep with the plugin set in `index.ts` (guarded by the parity
 * test in `oxlintrc.test.ts`, which asserts one entry per registered plugin).
 */
export declare const OXLINT_PLUGIN_BASENAMES: readonly ["code-safety", "foundation-purity", "graphql-conventions", "import-hygiene", "monorepo-paths", "query-patterns", "testing-quality", "tier-boundaries"];
/** jsPlugins specifiers, sibling-relative to the shipped oxlintrc.json. */
export declare const OXLINT_JS_PLUGIN_FILES: readonly string[];
/**
 * Standard ignore patterns for every webpresso consumer: build output, vendored
 * deps, generated reports, and the regenerated agent-surface directories. These
 * are project-relative. Truly repo-specific extras belong in a consumer-local
 * `.oxlintignore`, never here.
 */
export declare const STANDARD_IGNORE_PATTERNS: readonly string[];
export interface ResolvedOxlintRc {
    readonly jsPlugins: readonly string[];
    readonly rules: Readonly<Record<string, "error">>;
    readonly ignorePatterns: readonly string[];
}
/**
 * Build the resolved oxlint config object that ships as `oxlintrc.json`. Pure:
 * the build-time generator serializes this return value verbatim, and the
 * parity test asserts it against the live `rules`/`plugins` exports.
 */
export declare function buildOxlintrc(): ResolvedOxlintRc;
//# sourceMappingURL=oxlintrc.d.ts.map