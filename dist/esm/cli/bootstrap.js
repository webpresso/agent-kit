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
import { NotInGitRepoError, getRepoKey } from "#paths/state-root.js";
import { logUpdateError } from "#cli/auto-update/log.js";
import { shouldSkipUpdateCheck } from "#cli/auto-update/skip.js";
import { runUpdateFlow } from "#cli/auto-update/run.js";
import { checkVersionSkew } from "#cli/auto-update/version-skew.js";
export { NotInGitRepoError };
const INFORMATIONAL_FLAGS = new Set(["--version", "-v", "--help", "-h"]);
/**
 * Runtime-lane subcommands whose dispatch must work from any cwd: Codex fires
 * a `hook` with cwd at a sibling repo, a freshly cloned / un-`git init`'d repo
 * still needs its pretool-guard, and the `mcp` server can run outside a
 * checkout. These lanes never consume git-repo state and already skip the
 * update flow, so a missing git repo must NOT hard-fail. A crashing
 * pretool-guard is worse than useless: the host hook wrapper mistranslates a
 * non-zero/non-2 exit into a misleading "wp not found" deny.
 */
const GIT_REPO_OPTIONAL_SUBCOMMANDS = new Set(["hook", "mcp"]);
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
 * Returns true when the invoked subcommand (argv[2]) is a runtime lane exempt
 * from the git-repo hard-fail.
 */
export function isGitRepoOptionalCommand(argv) {
    return argv[2] !== undefined && GIT_REPO_OPTIONAL_SUBCOMMANDS.has(argv[2]);
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
    // hook / mcp runtime lanes must degrade gracefully outside a git repo — they
    // never use repo state and already skip the update flow, so short-circuit
    // before the hard-fail rather than crash (see GIT_REPO_OPTIONAL_SUBCOMMANDS).
    if (isGitRepoOptionalCommand(argv))
        return;
    // D6 — hard-fail outside git repo. NotInGitRepoError propagates to cli.ts.
    getRepoKey(); // throws NotInGitRepoError if not in git; return value not needed here
    // D8 — skip update check when in CI, mcp mode, or explicitly opted out.
    if (shouldSkipUpdateCheck(process.env, argv))
        return;
    // Warn when global wp version differs from the repo-pinned @webpresso/agent-kit.
    const skewWarning = checkVersionSkew(version);
    if (skewWarning !== null) {
        process.stderr.write(`${skewWarning}\n`);
    }
    // D13 — awaited so cache write + deferred install spawn complete before exit.
    try {
        await runUpdateFlow(version);
    }
    catch (err) {
        logUpdateError(err);
    }
}
//# sourceMappingURL=bootstrap.js.map