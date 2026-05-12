/**
 * Package-manager detection for the auto-update installer.
 *
 * Returns the `{manager, command}` tuple that the installer can use to
 * re-install `webpresso` globally, OR returns `{abort: <reason>}` when no
 * safe install command can be inferred (e.g. devDep install, Volta shim,
 * unknown manager). The caller turns `abort` into a notify-only outcome.
 *
 * Detection priority (per plan Architecture decision 3):
 *   1. `process.env.npm_config_user_agent` — most reliable; set by the
 *      manager whenever the CLI is launched via the manager's run wrapper.
 *   2. Realpath walk of `argv0` looking for store markers (`.pnpm-store`,
 *      `.bun/install`, `.volta/tools`, `.yarn/global`, Homebrew prefix).
 *   3. Confirm the install is global; abort if it's a devDep consumer.
 *   4. Volta / asdf shim → abort with a manual-command hint.
 *   5. Unknown → abort.
 */
import { realpathSync } from 'node:fs';
import { delimiter, sep } from 'node:path';
export const PACKAGE_NAME = 'webpresso';
const INSTALL_COMMANDS = {
    npm: ['npm', 'install', '-g', PACKAGE_NAME],
    pnpm: ['pnpm', 'add', '-g', PACKAGE_NAME],
    yarn: ['yarn', 'global', 'add', PACKAGE_NAME],
    bun: ['bun', 'add', '-g', PACKAGE_NAME],
};
/**
 * Detect the package manager that owns the running `webpresso` binary.
 * Pure function modulo `realpathSync` — call sites mock that for tests.
 */
export function detect(env, argv0) {
    // Priority 1 — user-agent string set by the package manager.
    const userAgent = env.npm_config_user_agent;
    if (userAgent !== undefined && userAgent !== '') {
        const fromUa = parseUserAgent(userAgent);
        if (fromUa !== null) {
            return { manager: fromUa, command: INSTALL_COMMANDS[fromUa] };
        }
    }
    // Priority 2 — realpath walk of argv0 for store markers.
    const realpath = safeRealpath(argv0);
    if (realpath !== null) {
        // Priority 4 (run before 2 success) — Volta / asdf shims.
        const shim = detectShim(realpath);
        if (shim !== null) {
            return { abort: shim };
        }
        const fromPath = matchStoreMarker(realpath);
        if (fromPath !== null) {
            if (!confirmInstalledGlobally(realpath, env)) {
                return {
                    abort: `webpresso is not a global install (path ${realpath}); auto-install disabled.`,
                };
            }
            return { manager: fromPath, command: INSTALL_COMMANDS[fromPath] };
        }
    }
    // Priority 5 — give up; the caller falls back to notify-only.
    return {
        abort: 'Unable to detect a package manager for webpresso; auto-install disabled.',
    };
}
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
export function parseUserAgent(userAgent) {
    const trimmed = userAgent.trim();
    if (trimmed.length === 0)
        return null;
    const head = trimmed.split(/\s+/, 1)[0];
    if (head === undefined)
        return null;
    const slash = head.indexOf('/');
    const name = (slash === -1 ? head : head.slice(0, slash)).toLowerCase();
    if (name === 'npm' || name === 'pnpm' || name === 'yarn' || name === 'bun') {
        return name;
    }
    return null;
}
/**
 * Look for known package-manager store markers in a realpath. The walk is a
 * substring check against path segments to avoid false positives in user
 * directory names.
 * Exported for testability.
 */
export function matchStoreMarker(realpath) {
    const segments = splitPathSegments(realpath);
    // pnpm: any path under `<store>/.pnpm/...` or containing `.pnpm-store`.
    if (segments.some((seg) => seg === '.pnpm' || seg === '.pnpm-store' || seg === 'pnpm-global')) {
        return 'pnpm';
    }
    // bun: installs under `~/.bun/install/global/...`.
    if (segments.includes('.bun') && (segments.includes('install') || segments.includes('global'))) {
        return 'bun';
    }
    // yarn classic global dir is `~/.yarn/global/`.
    // yarn 2+ uses `.yarn/berry` or `.yarn/cache` for installs.
    if (segments.includes('.yarn') && (segments.includes('global') || segments.includes('berry'))) {
        return 'yarn';
    }
    // Homebrew (`/usr/local/Cellar/node/...`, `/opt/homebrew/Cellar/...`) and
    // npm prefix (`/usr/local/lib/node_modules`, `~/.npm-global`) → npm.
    if (segments.includes('Cellar'))
        return 'npm';
    if (segments.includes('node_modules') && segments.includes('lib'))
        return 'npm';
    if (segments.includes('.npm-global'))
        return 'npm';
    if (segments.includes('.npm') && segments.includes('node_modules'))
        return 'npm';
    return null;
}
/**
 * Detect Volta / asdf shim layouts. These intercept the binary lookup such
 * that an in-place `npm install -g` won't pick up. Returns a user-facing
 * abort reason or null.
 * Exported for testability.
 */
export function detectShim(realpath) {
    const segments = splitPathSegments(realpath);
    if (segments.includes('.volta')) {
        return 'webpresso is managed by Volta; run `volta install webpresso` to upgrade.';
    }
    if (segments.includes('.asdf')) {
        return 'webpresso is managed by asdf; run `asdf reshim nodejs` after upgrading the runtime.';
    }
    return null;
}
/**
 * Cheap confirmation that the binary lives outside of a project-local
 * `node_modules/.bin` (devDep consumer). The `is-installed-globally` npm
 * package is the upstream choice; we inline an equivalent check so this
 * module can be tested without that dep installed.
 * Exported for testability.
 */
export function confirmInstalledGlobally(realpath, env) {
    const segments = splitPathSegments(realpath);
    // If the realpath sits inside a project's node_modules and does NOT match
    // a known global prefix (`.pnpm-store`, `.bun/install/global`, `.yarn/global`,
    // `Cellar`, `lib/node_modules`), call it a devDep install.
    const insideNodeModules = segments.includes('node_modules');
    if (!insideNodeModules)
        return true;
    // Global prefixes contain node_modules but are still global.
    if (segments.includes('Cellar'))
        return true;
    if (segments.includes('lib') && segments.includes('node_modules'))
        return true;
    if (segments.includes('.npm-global'))
        return true;
    if (segments.includes('.pnpm') || segments.includes('.pnpm-store'))
        return true;
    if (segments.includes('.bun'))
        return true;
    if (segments.includes('.yarn') && segments.includes('global'))
        return true;
    // Compare against env-provided prefixes when available.
    const prefix = env.npm_config_prefix ?? env.PNPM_HOME ?? env.BUN_INSTALL;
    if (prefix !== undefined && prefix !== '' && realpath.startsWith(prefix))
        return true;
    return false;
}
function safeRealpath(p) {
    try {
        return realpathSync(p);
    }
    catch {
        return null;
    }
}
function splitPathSegments(p) {
    // Strip drive letter / leading separator, split on the OS separator, drop
    // empties. Works for both POSIX (`/`) and Windows (`\\`) layouts.
    const normalized = p.replace(/\\/g, sep);
    const stripped = normalized.startsWith(sep) ? normalized.slice(sep.length) : normalized;
    return stripped.split(sep).filter((s) => s.length > 0 && s !== delimiter);
}
//# sourceMappingURL=detect-pm.js.map