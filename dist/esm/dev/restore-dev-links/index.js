#!/usr/bin/env bun
/**
 * Postinstall helper: restore the webpresso dev-link symlink
 * that `vp install` overwrites with the pnpm-store snapshot.
 *
 * Behavior:
 *   - State file absent           → silent exit 0 (CI / never linked)
 *   - State file present + source exists → re-create symlink, log loud
 *   - State file present + source missing → exit 1 with loud stderr
 *
 * No silent fallback to stale code — root-cause fix only. Consumer wires
 * this into their postinstall script:
 *
 *   "scripts": {
 *     "postinstall": "wp-restore-dev-links && <other postinstall steps>"
 *   }
 *
 * Reasoning for postinstall (not pnpm.overrides + link:): pnpm bakes overrides
 * into the lockfile, so a conditional `link:` would force --frozen-lockfile
 * to fail in CI. Postinstall is the only seam that runs deterministically
 * after install, doesn't touch the lockfile, and is observable enough to debug.
 */
import { lstatSync, mkdirSync, readlinkSync, realpathSync, renameSync, symlinkSync, unlinkSync, } from 'node:fs';
import { existsSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { STATE_FILE_RELATIVE_PATH, readDevLinkState } from '#dev/dev-link-state';
export function restoreDevLinks(options = {}) {
    const cwd = options.cwd ?? process.cwd();
    const stdout = options.stdout ?? process.stdout;
    const stderr = options.stderr ?? process.stderr;
    const state = readDevLinkState(cwd);
    if (state === null) {
        // Either absent OR malformed. We treat both as "no dev-link active" for the
        // restore path because acting on a malformed file is more dangerous than
        // ignoring it. The check-dev-link SessionStart hook will still surface
        // breakage to the operator at next session start.
        return { exitCode: 0, outcomes: [{ kind: 'no-state-file' }] };
    }
    const target = join(cwd, 'node_modules', state.package);
    const source = state.linkedFrom;
    if (!existsSync(join(source, 'package.json'))) {
        stderr.write(`wp-restore-dev-links: state file points at ${source} but no package.json found there.\n` +
            `  → Move the webpresso checkout back, or delete ${STATE_FILE_RELATIVE_PATH} to opt out.\n`);
        return {
            exitCode: 1,
            outcomes: [{ kind: 'source-missing', expectedSource: source }],
        };
    }
    const outcome = ensureSymlink(target, source);
    if (outcome.kind === 'already-linked') {
        stdout.write(`wp-restore-dev-links: ${state.package} → ${source} (already linked)\n`);
    }
    else {
        const previousLabel = outcome.previous ?? '<store snapshot>';
        stdout.write(`wp-restore-dev-links: ${state.package} → ${source} (was ${previousLabel})\n`);
    }
    return { exitCode: 0, outcomes: [outcome] };
}
function ensureSymlink(target, source) {
    mkdirSync(dirname(target), { recursive: true });
    let previous = null;
    if (lstatExists(target)) {
        const stat = lstatSync(target);
        if (stat.isSymbolicLink()) {
            const current = readlinkSync(target);
            if (current === source) {
                return { kind: 'already-linked', target, source };
            }
            previous = current;
            unlinkSync(target);
        }
        else {
            const backup = `${target}.store-snapshot.${timestamp()}`;
            renameSync(target, backup);
            previous = backup;
        }
    }
    symlinkSync(source, target, 'dir');
    return { kind: 'relinked', target, source, previous };
}
function lstatExists(p) {
    try {
        lstatSync(p);
        return true;
    }
    catch {
        return false;
    }
}
function pad2(n) {
    return String(n).padStart(2, '0');
}
function timestamp() {
    const d = new Date();
    return `${d.getFullYear()}${pad2(d.getMonth() + 1)}${pad2(d.getDate())}-${pad2(d.getHours())}${pad2(d.getMinutes())}${pad2(d.getSeconds())}`;
}
if (process.argv[1] &&
    realpathSync(fileURLToPath(import.meta.url)) === realpathSync(process.argv[1])) {
    const result = restoreDevLinks();
    process.exit(result.exitCode);
}
//# sourceMappingURL=index.js.map