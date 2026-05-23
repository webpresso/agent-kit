/**
 * Pre-flight hook for the CLI.
 *
 * Ordered bootstrap per D6 + D8 + D19:
 *   1. Short-circuit on informational verbs (--version / --help / -v / -h)
 *      so those always work outside a git repo.
 *   2. Hard-fail outside a git repo — propagates NotInGitRepoError to cli.ts
 *      for formatted error output + exit 2.
 *   3. Skip auto-update when env/argv say so (CI, mcp, WP_SKIP_UPDATE_CHECK).
 *   4. Fire-and-forget runUpdateFlow — errors sink to logUpdateError (D13).
 */
import { NotInGitRepoError, getRepoKey } from '#paths/state-root.js';
import { logUpdateError } from '#cli/auto-update/log.js';
import { shouldSkipUpdateCheck } from '#cli/auto-update/skip.js';
import { runUpdateFlow } from '#cli/auto-update/run.js';
export { NotInGitRepoError };
const INFORMATIONAL_FLAGS = new Set(['--version', '-v', '--help', '-h']);
/**
 * Returns true when argv contains an informational flag anywhere after the
 * first two entries (runtime + script path).
 */
export function isInformationalVerb(argv) {
    for (let i = 2; i < argv.length; i++) {
        const arg = argv[i];
        if (arg !== undefined && INFORMATIONAL_FLAGS.has(arg))
            return true;
    }
    return false;
}
/**
 * Run CLI bootstrap. Throws NotInGitRepoError if not inside a git repo
 * (except for informational verbs). Fire-and-forget auto-update check.
 *
 * @param version  Package version string (e.g. "0.16.0") — passed from cli.ts
 *                 so the caller owns the version read, not bootstrap.
 * @param argv     Normalized process.argv (defaults to process.argv).
 */
export async function bootstrapAk(version, argv = process.argv) {
    // D19 — informational verbs short-circuit before any git repo check.
    if (isInformationalVerb(argv))
        return;
    // D6 — hard-fail outside git repo. NotInGitRepoError propagates to cli.ts.
    getRepoKey(); // throws NotInGitRepoError if not in git; return value not needed here
    // D8 — skip update check when in CI, mcp mode, or explicitly opted out.
    if (shouldSkipUpdateCheck(process.env, argv))
        return;
    // D13 — awaited so cache write + deferred install spawn complete before exit.
    try {
        await runUpdateFlow(version);
    }
    catch (err) {
        logUpdateError(err);
    }
}
//# sourceMappingURL=bootstrap.js.map