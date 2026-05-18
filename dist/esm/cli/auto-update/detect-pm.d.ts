/**
 * Package-manager detection for the auto-update installer.
 *
 * Returns the `{manager, command}` tuple that the installer can use to
 * re-install `@webpresso/agent-kit` globally, OR returns `{abort: <reason>}`
 * when no safe install command can be inferred (e.g. devDep install, Volta
 * shim, unknown manager). The caller turns `abort` into a notify-only outcome.
 *
 * Detection priority:
 *   0. Source/git install — argv1 resolves into the webpresso/agent-kit clone
 *      → `git -C <repo> pull` (works for symlink dev installs).
 *   1. `process.env.npm_config_user_agent` — most reliable; set by the
 *      manager whenever the CLI is launched via the manager's run wrapper.
 *   2. Realpath walk of `argv0` looking for store markers (`.pnpm-store`,
 *      `.bun/install`, `.volta/tools`, `.yarn/global`, Homebrew prefix).
 *   3. Confirm the install is global; abort if it's a devDep consumer.
 *   4. Volta / asdf shim → abort with a manual-command hint.
 *   5. Unknown → abort.
 */
export type ManagerName = 'npm' | 'pnpm' | 'yarn' | 'bun' | 'git';
export interface DetectSuccess {
    manager: ManagerName;
    command: string[];
}
export interface DetectAbort {
    abort: string;
}
export type DetectResult = DetectSuccess | DetectAbort;
export declare const GH_PACKAGE_NAME = "@webpresso/agent-kit";
export declare const GH_PACKAGES_REGISTRY = "https://npm.pkg.github.com";
/**
 * Detect whether argv1 is a symlink pointing into the webpresso/agent-kit
 * source clone. Returns the git worktree root if so, null otherwise.
 * Exported for testability.
 */
export declare function detectGitInstall(argv1: string): string | null;
/**
 * Detect the package manager that owns the running `webpresso` binary.
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
 * Returns the manager name if the leading token matches a known manager.
 * Exported for testability.
 */
export declare function parseUserAgent(userAgent: string): Exclude<ManagerName, 'git'> | null;
/**
 * Look for known package-manager store markers in a realpath. The walk is a
 * substring check against path segments to avoid false positives in user
 * directory names.
 * Exported for testability.
 */
export declare function matchStoreMarker(realpath: string): Exclude<ManagerName, 'git'> | null;
/**
 * Detect Volta / asdf shim layouts. These intercept the binary lookup such
 * that an in-place `npm install -g` won't pick up. Returns a user-facing
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