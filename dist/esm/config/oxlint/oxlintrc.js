/**
 * Resolved, consumer-ready oxlint configuration (Tier-1 DRY model).
 *
 * agent-kit ships ONE resolved `.oxlintrc.json` — generated from this builder
 * at build time into `dist/esm/config/oxlint/oxlintrc.json` — and `wp lint`
 * points oxlint at it via `--config`. Consumers therefore carry no
 * `oxlint.config.ts` and no `oxlint` dependency; the linter version, plugins,
 * rules, and standard ignores are all gated to @webpresso/agent-kit.
 *
 * Two oxlint resolution facts (verified against oxlint 1.67) make this work:
 * - `jsPlugins` are resolved relative to the CONFIG FILE's directory, so the
 *   specifiers below are sibling-relative (`./<plugin>.js`) to the shipped JSON
 *   — zero package-resolution machinery, no dependency on @webpresso/agent-kit
 *   being resolvable from the config's location.
 * - `ignorePatterns` are applied relative to the LINTED project (cwd), not the
 *   config-file directory, so `dist`/`node_modules`/etc. ignore the consumer's
 *   tree even though the config lives inside node_modules.
 */
import { rules } from './index.js';
/**
 * Compiled plugin module basenames shipped next to the generated oxlintrc.json.
 * Kept in lockstep with the plugin set in `index.ts` (guarded by the parity
 * test in `oxlintrc.test.ts`, which asserts one entry per registered plugin).
 */
export const OXLINT_PLUGIN_BASENAMES = [
    'code-safety',
    'foundation-purity',
    'graphql-conventions',
    'import-hygiene',
    'monorepo-paths',
    'query-patterns',
    'testing-quality',
    'tier-boundaries',
];
/** jsPlugins specifiers, sibling-relative to the shipped oxlintrc.json. */
export const OXLINT_JS_PLUGIN_FILES = OXLINT_PLUGIN_BASENAMES.map((name) => `./${name}.js`);
/**
 * Standard ignore patterns for every webpresso consumer: build output, vendored
 * deps, generated reports, and the regenerated agent-surface directories. These
 * are project-relative. Truly repo-specific extras belong in a consumer-local
 * `.oxlintignore`, never here.
 */
export const STANDARD_IGNORE_PATTERNS = [
    'dist',
    'node_modules',
    'reports',
    '.stryker-tmp',
    '.agent',
    '.agents',
    '.claude',
    '.codex',
    '.cursor',
    '.opencode',
    '.omx',
];
/**
 * Build the resolved oxlint config object that ships as `oxlintrc.json`. Pure:
 * the build-time generator serializes this return value verbatim, and the
 * parity test asserts it against the live `rules`/`plugins` exports.
 */
export function buildOxlintrc() {
    return {
        jsPlugins: OXLINT_JS_PLUGIN_FILES,
        rules,
        ignorePatterns: STANDARD_IGNORE_PATTERNS,
    };
}
//# sourceMappingURL=oxlintrc.js.map