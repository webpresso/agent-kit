/**
 * Pre-flight hook for the CLI.
 *
 * Ordered bootstrap per D6 + D8 + D19:
 *   1. Short-circuit on informational verbs (--version / --help / -v / -h)
 *      so those always work outside a git repo.
 *   2. Hard-fail outside a git repo — propagates NotInGitRepoError to cli.ts
 *      for formatted error output + exit 2.
 *   3. Warn on version skew between global wp and the repo-pinned
 *      @webpresso/agent-kit in pnpm-workspace.yaml catalog.
 *   4. Skip auto-update when env/argv say so (CI, mcp, WP_SKIP_UPDATE_CHECK).
 *   5. Fire-and-forget runUpdateFlow — errors sink to logUpdateError (D13).
 */
import { NotInGitRepoError } from '#paths/state-root.js';
export { NotInGitRepoError };
/**
 * Returns true when argv contains an informational flag anywhere after the
 * first two entries (runtime + script path).
 */
export declare function isInformationalVerb(argv: string[]): boolean;
/**
 * Run CLI bootstrap. Throws NotInGitRepoError if not inside a git repo
 * (except for informational verbs). Fire-and-forget auto-update check.
 *
 * @param version  Package version string (e.g. "0.16.0") — passed from cli.ts
 *                 so the caller owns the version read, not bootstrap.
 * @param argv     Normalized process.argv (defaults to process.argv).
 */
export declare function bootstrapAk(version: string, argv?: string[]): Promise<void>;
//# sourceMappingURL=bootstrap.d.ts.map