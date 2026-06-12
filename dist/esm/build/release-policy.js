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
/**
 * Whether the release pipeline should build, stage, and publish the per-platform
 * native runtime matrix. Defaults to `true`; only an explicit
 * `WP_PUBLISH_RUNTIME_MATRIX=0` disables the matrix.
 */
export function shouldPublishRuntimeMatrix(env) {
    return env[PUBLISH_RUNTIME_MATRIX_ENV] !== '0';
}
//# sourceMappingURL=release-policy.js.map