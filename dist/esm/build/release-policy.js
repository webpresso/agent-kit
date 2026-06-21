/**
 * Release-time policy decisions for the native runtime publish pipeline.
 *
 * The canonical package surface now includes the per-platform
 * `@webpresso/agent-kit-runtime-*` packages plus the staged native `bin/wp`
 * launcher, so release publishes the runtime matrix by default. Operators may
 * still set `WP_PUBLISH_RUNTIME_MATRIX=0` to force a diagnostics-only dry lane
 * when debugging a broken registry/bootstrap environment, but the normal
 * shipping path is "publish the matrix".
 */
export const PUBLISH_RUNTIME_MATRIX_ENV = 'WP_PUBLISH_RUNTIME_MATRIX';
export const ROOT_RELEASE_PACKAGE_NAME = '@webpresso/agent-kit';
const RUNTIME_HELPER_PACKAGE_PREFIX = '@webpresso/agent-kit-runtime-';
const SESSION_MEMORY_HELPER_PACKAGE_PREFIX = '@webpresso/agent-kit-session-memory-';
const GENERATED_HELPER_PACKAGE_PREFIX = `${ROOT_RELEASE_PACKAGE_NAME}-`;
/**
 * Whether the release pipeline should build, stage, and publish the per-platform
 * native runtime matrix. Defaults to `true`; only an explicit
 * `WP_PUBLISH_RUNTIME_MATRIX=0` disables the matrix.
 */
export function shouldPublishRuntimeMatrix(env) {
    return env[PUBLISH_RUNTIME_MATRIX_ENV] !== '0';
}
export function classifyReleasePackage(packageName) {
    if (packageName === ROOT_RELEASE_PACKAGE_NAME)
        return 'root';
    if (packageName.startsWith(RUNTIME_HELPER_PACKAGE_PREFIX))
        return 'runtime-helper';
    if (packageName.startsWith(SESSION_MEMORY_HELPER_PACKAGE_PREFIX))
        return 'session-memory-helper';
    if (packageName.startsWith(GENERATED_HELPER_PACKAGE_PREFIX))
        return 'generated-helper';
    return 'workspace-github-release';
}
export function isWorkspaceGithubReleasePackage(packageName) {
    return classifyReleasePackage(packageName) === 'workspace-github-release';
}
//# sourceMappingURL=release-policy.js.map