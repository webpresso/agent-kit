/**
 * Decide whether to skip the auto-update check entirely for this invocation.
 *
 * Returning `true` means: bypass the *whole* update flow — no registry probe,
 * no banner, no spawn. This is for invocations where running the flow would be
 * either useless or actively harmful:
 *
 *   - `--version` / `-v` / `--help` / `-h` — informational verbs that should
 *     never trigger background work.
 *   - `mcp` subcommand — JSON-RPC stdio mode; stderr writes would corrupt the
 *     transport.
 *   - `WP_SKIP_UPDATE_CHECK=1` — explicit user opt-out of the whole flow.
 *   - `CI=true` (and the broader set of CI signals via ci-info-style env
 *     probing) — non-interactive environments don't want surprise spawns.
 *
 * `setup` / `init` intentionally DO NOT skip the update check: setup is the
 * command users run when they want their agent surfaces refreshed, so it should
 * also detect and schedule an webpresso package refresh when a newer version is
 * available.
 *
 * `WP_SKIP_AUTO_INSTALL=1` does **not** appear here — that variable only
 * disables the install step. The notify side of the flow still runs so users
 * get a banner. That check belongs in the installer module.
 */
export const INFORMATIONAL_FLAGS = new Set(['--version', '-v', '--help', '-h']);
export const CI_ENV_KEYS = [
    'CI',
    'CONTINUOUS_INTEGRATION',
    'BUILD_NUMBER',
    'RUN_ID',
    'GITHUB_ACTIONS',
    'GITLAB_CI',
    'CIRCLECI',
    'TRAVIS',
    'APPVEYOR',
    'BUILDKITE',
    'DRONE',
    'JENKINS_URL',
];
const SKIP_SUBCOMMANDS = new Set(['mcp', 'hook']);
export function shouldSkipUpdateCheck(env, argv) {
    if (hasInformationalFlag(argv))
        return true;
    if (argv[2] !== undefined && SKIP_SUBCOMMANDS.has(argv[2]))
        return true;
    if (env.WP_SKIP_UPDATE_CHECK === '1')
        return true;
    if (isPackageLifecycleEnvironment(env))
        return true;
    if (isCiEnvironment(env))
        return true;
    return false;
}
/**
 * Whether the installer step should be suppressed (still allow the notify-only
 * banner). Separate from `shouldSkipUpdateCheck` so users can keep notifications
 * but block automatic install.
 */
export function shouldSkipAutoInstall(env) {
    return env.WP_SKIP_AUTO_INSTALL === '1';
}
function hasInformationalFlag(argv) {
    // Skip argv[0] (runtime) and argv[1] (script path). Inspect the rest.
    for (let i = 2; i < argv.length; i++) {
        const arg = argv[i];
        if (arg !== undefined && INFORMATIONAL_FLAGS.has(arg))
            return true;
    }
    return false;
}
function isCiEnvironment(env) {
    // Match the convention used by `is-ci` / `ci-info`: `CI` set to any
    // truthy-looking value counts. Some CI vendors set `CI=1` rather than
    // `CI=true`, so don't anchor on a specific value.
    if (env.CI !== undefined && env.CI !== '' && env.CI !== 'false' && env.CI !== '0')
        return true;
    for (const key of CI_ENV_KEYS) {
        if (key === 'CI')
            continue;
        const value = env[key];
        if (value !== undefined && value !== '' && value !== 'false' && value !== '0')
            return true;
    }
    return false;
}
function isPackageLifecycleEnvironment(env) {
    const lifecycleEvent = env.npm_lifecycle_event;
    const packageJsonPath = env.npm_package_json;
    return Boolean((lifecycleEvent && lifecycleEvent.trim().length > 0) ||
        (packageJsonPath && packageJsonPath.trim().length > 0));
}
//# sourceMappingURL=skip.js.map