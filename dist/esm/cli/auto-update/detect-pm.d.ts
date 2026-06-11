/**
 * Install-topology detection for the auto-update installer.
 *
 * Returns the `{topology, command}` tuple that the installer can use to
 * re-install `@webpresso/agent-kit` globally, OR returns `{abort: <reason>}`
 * when no safe install command can be inferred (e.g. devDep install, Volta
 * shim, unknown topology). The caller turns `abort` into a notify-only outcome.
 *
 * Detection priority:
 *   0. Source/git install — argv1 resolves into the canonical source clone
 *      → `git -C <repo> pull` (works for symlink dev installs).
 *   1. `process.env.npm_config_user_agent` — most reliable hint when the CLI
 *      is launched through a wrapper. We collapse it into vp / pnpm / generic
 *      global-node topologies rather than treating every package manager as a
 *      product-level lane.
 *   2. Realpath walk of `argv0` looking for store markers (`.pnpm-store`,
 *      `.bun/install`, `.volta/tools`, `.yarn/global`, generic global-node
 *      prefixes).
 *   3. Confirm the install is global; abort if it's a devDep consumer.
 *   4. Volta / asdf shim → abort with a manual-command hint.
 *   5. Unknown → abort.
 */
export type InstallTopology = 'global-node' | 'pnpm' | 'vp' | 'git';
export interface DetectSuccess {
    topology: InstallTopology;
    command: string[];
}
export interface DetectAbort {
    abort: string;
}
export type DetectResult = DetectSuccess | DetectAbort;
export declare const PUBLIC_PACKAGE_NAME = "@webpresso/agent-kit";
export declare const PUBLIC_NPM_REGISTRY = "https://registry.npmjs.org";
/**
 * Canonical global-install command for the public agent-kit.
 *
 * No `--registry` flag: npmjs.org is already the default registry, and a global
 * `--registry` does NOT override a scoped `@webpresso:registry` mapping
 * (npm/pnpm resolve the scope first). The flag was therefore redundant when no
 * scope override exists and ineffective when one does. To force-public inside a
 * repo that scopes `@webpresso` to a private registry, use the scoped form
 * `--@webpresso:registry=${PUBLIC_NPM_REGISTRY}` instead.
 *
 * Exported so the `wp setup` self-update scaffolder reuses the exact same
 * command (single source of truth — see `ensureAgentKitGlobal`).
 */
export declare function buildVpGlobalInstallCommand(): [string, ...string[]];
export declare function formatLegacyCommandReplacementMessage(legacyCommand: string): string | null;
/**
 * Detect whether argv1 is a symlink pointing into a supported source clone.
 * Returns the git worktree root if so, null otherwise.
 * Exported for testability.
 */
export declare function detectGitInstall(argv1: string): string | null;
/**
 * Detect the install topology that owns the running `wp` / agent-kit binary.
 * Pure function modulo `realpathSync` and `execFileSync` — call sites mock
 * those for tests.
 */
export declare function detect(env: NodeJS.ProcessEnv, argv0: string): DetectResult;
/**
 * Parse the `npm_config_user_agent` string. Format examples:
 *   npm/10.2.4 node/v22.0.0 darwin x64 workspaces/false
 *   pnpm/10.33.0 npm/? node/v22.0.0 darwin arm64
 *   yarn/1.22.22 npm/? node/v22.0.0 darwin arm64
 *   bun/1.1.0 npm/? node/v22.0.0 darwin arm64
 *
 * Returns the install topology implied by the leading token when it maps to a
 * behaviorally distinct lane. `pnpm` remains explicit because its store/layout
 * matters; npm/bun/yarn collapse into `global-node`.
 * Exported for testability.
 */
export declare function parseUserAgent(userAgent: string): Exclude<InstallTopology, 'git'> | null;
/**
 * Look for known install topology markers in a realpath. The walk is a
 * substring check against path segments to avoid false positives in user
 * directory names.
 * Exported for testability.
 */
export declare function matchStoreMarker(realpath: string): Exclude<InstallTopology, 'git'> | null;
/**
 * Detect Volta / asdf shim layouts. These intercept the binary lookup such
 * that an in-place `vp install -g` won't pick up. Returns a user-facing
 * abort reason or null.
 * Exported for testability.
 */
export declare function detectShim(realpath: string): string | null;
/**
 * Cheap confirmation that the binary lives outside of a project-local
 * `node_modules/.bin` (devDep consumer). The `is-installed-globally` npm
 * package is the upstream choice; we inline an equivalent check so this
 * module can be tested without that dep installed.
 * Exported for testability.
 */
export declare function confirmInstalledGlobally(realpath: string, env: NodeJS.ProcessEnv): boolean;
//# sourceMappingURL=detect-pm.d.ts.map