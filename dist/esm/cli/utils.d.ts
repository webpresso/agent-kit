/**
 * CLI-wide helper utilities.
 *
 * Inlined from webpresso/apps/cli-wp/src/cli-utils.ts (argv normalization,
 * unknown-command formatting) and webpresso/packages/cli/cli-utils
 * (getProjectRoot) so this package has no @webpresso/* runtime dependencies.
 */
/**
 * Markers used to detect a project root, in priority order; first hit wins.
 */
export declare const PROJECT_ROOT_MARKERS: readonly [".webpressorc.json", "pnpm-workspace.yaml", "package.json", "webpresso/config.yaml"];
interface GetProjectRootOptions {
    /** Directory to start searching from (default: process.cwd()) */
    startDir?: string;
}
/**
 * Walks upward from startDir looking for any marker in
 * `PROJECT_ROOT_MARKERS` (priority order). Throws if nothing is found.
 */
export declare function findProjectRoot(startDir: string): string;
export declare function getProjectRoot(options?: GetProjectRootOptions): string;
/**
 * Normalize process.argv for cac compatibility.
 *
 * When invoked through a script-style wrapper that inserts `--` before
 * `<args>`, the separator lands in argv[2] and prevents cac from seeing the
 * command. Strip it when it appears immediately after the script path.
 */
export declare function normalizeArgv(argv: string[]): string[];
/**
 * Format error message for unknown commands with suggestions.
 */
export declare function formatUnknownCommandError(input: string | undefined, commands: readonly string[], binName?: string): string;
/**
 * Resolve the webpresso package.json and return its version.
 *
 * Caller must pass `import.meta.url` from a file that lives at
 * `<packageRoot>/src/cli/cli.ts` (source) or `<packageRoot>/dist/cli.js`
 * (bundled). We walk upward until we find a `package.json` whose `name`
 * is `webpresso`, to be robust against both layouts without
 * having to know how many `..` segments to append.
 */
export declare function readPackageVersion(metaUrl: string): string;
export {};
//# sourceMappingURL=utils.d.ts.map