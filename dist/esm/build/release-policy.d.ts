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
export declare const PUBLISH_RUNTIME_MATRIX_ENV = "WP_PUBLISH_RUNTIME_MATRIX";
export declare const ROOT_RELEASE_PACKAGE_NAME = "@webpresso/agent-kit";
export type ReleasePackageCategory = "root" | "runtime-helper" | "session-memory-helper" | "generated-helper" | "workspace-github-release";
/**
 * Whether the release pipeline should build, stage, and publish the per-platform
 * native runtime matrix. Defaults to `true`; only an explicit
 * `WP_PUBLISH_RUNTIME_MATRIX=0` disables the matrix.
 */
export declare function shouldPublishRuntimeMatrix(env: NodeJS.ProcessEnv): boolean;
export declare function classifyReleasePackage(packageName: string): ReleasePackageCategory;
export declare function isWorkspaceGithubReleasePackage(packageName: string): boolean;
//# sourceMappingURL=release-policy.d.ts.map