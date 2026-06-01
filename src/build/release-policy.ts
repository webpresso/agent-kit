/**
 * Release-time policy decisions for the publish pipeline.
 *
 * The per-platform native runtime packages (`@webpresso/agent-kit-runtime-*`)
 * are a deferred capability: they are not yet created on the registry, the main
 * package declares no `optionalDependencies` on them, and the plugin manifest
 * still launches via the node entrypoint rather than a staged native `bin/wp`.
 *
 * Until that native-distribution work is intentionally activated, the release
 * MUST NOT attempt to publish the matrix: a first-time `npm publish` of a
 * never-created scoped package returns 404, which previously aborted the entire
 * release before the main `@webpresso/agent-kit` package published (the root
 * cause of the 0.22.x publish stall).
 *
 * The matrix publish is therefore gated behind an explicit opt-in. When the
 * native-distribution feature lands, the release workflow sets
 * `WP_PUBLISH_RUNTIME_MATRIX=1` (after bootstrapping the scoped packages on the
 * registry) to turn it back on.
 */
export const PUBLISH_RUNTIME_MATRIX_ENV = 'WP_PUBLISH_RUNTIME_MATRIX'

/**
 * Whether the release pipeline should build, stage, and publish the per-platform
 * native runtime matrix. Defaults to `false` (matrix deferred); enabled only
 * when `WP_PUBLISH_RUNTIME_MATRIX=1` is set explicitly.
 */
export function shouldPublishRuntimeMatrix(env: NodeJS.ProcessEnv): boolean {
  return env[PUBLISH_RUNTIME_MATRIX_ENV] === '1'
}
