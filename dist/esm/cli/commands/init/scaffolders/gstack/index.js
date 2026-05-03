/**
 * `gstack` scaffolder preset.
 *
 * gstack is a user-global skill registry installed at `~/.claude/skills/gstack/`.
 * It ships skills like `/qa`, `/ship`, `/review`, `/investigate`, `/browse`
 * that webpresso/ingest-lens both mark as required for AI-assisted work.
 *
 * Detection is path-based, NOT PATH-based: gstack is not a CLI binary on
 * $PATH — it's a directory of skills consumed by Claude Code via
 * `~/.claude/skills/gstack/`. Install is a clone + `./setup --team`.
 *
 * Side-effect outside the consumer repo: writes to the user's home dir.
 * This is intentional — gstack is global by design.
 */
import { spawnSync } from 'node:child_process';
import { existsSync } from 'node:fs';
import { homedir } from 'node:os';
import path from 'node:path';
const GSTACK_REPO = 'https://github.com/garrytan/gstack.git';
function defaultInstallRoot() {
    return path.join(homedir(), '.claude', 'skills', 'gstack');
}
function runSetup(root, spawn) {
    const result = spawn('./setup', ['--team'], { cwd: root, stdio: 'inherit' });
    return { ok: result.status === 0, exitCode: result.status ?? -1 };
}
/**
 * Ensure gstack is installed and up-to-date.
 * - Not present: clone from main + setup.
 * - Already present: pull latest main + re-run setup.
 */
export function ensureGstack(input) {
    if (input.options.dryRun)
        return { kind: 'gstack-skipped-dry-run' };
    const spawn = input.spawn ?? spawnSync;
    const exists = input.exists ?? existsSync;
    const root = input.installRoot ?? defaultInstallRoot();
    const hasSetup = exists(path.join(root, 'setup'));
    const hasGitDir = exists(path.join(root, '.git'));
    if (hasSetup) {
        if (hasGitDir) {
            // Managed install — pull latest before rerunning setup.
            const pull = spawn('git', ['pull', '--ff-only', 'origin', 'main'], {
                cwd: root,
                stdio: 'inherit',
            });
            if (pull.status !== 0)
                return { kind: 'gstack-pull-failed', exitCode: pull.status ?? -1 };
        }
        const setup = runSetup(root, spawn);
        if (!setup.ok)
            return { kind: 'gstack-setup-failed', exitCode: setup.exitCode };
        return { kind: 'gstack-updated', root };
    }
    // Fresh install.
    const clone = spawn('git', ['clone', '--depth', '1', GSTACK_REPO, root], {
        stdio: 'inherit',
    });
    if (clone.status !== 0)
        return { kind: 'gstack-clone-failed', exitCode: clone.status ?? -1 };
    const setup = runSetup(root, spawn);
    if (!setup.ok)
        return { kind: 'gstack-setup-failed', exitCode: setup.exitCode };
    return { kind: 'gstack-installed', root };
}
//# sourceMappingURL=index.js.map