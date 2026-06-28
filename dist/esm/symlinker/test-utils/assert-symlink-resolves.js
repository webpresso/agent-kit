import { existsSync, realpathSync } from "node:fs";
/**
 * Test helper enforcing the bc88 invariant: every emitted symlink under
 * `.agents/skills/` (or anywhere webpresso's symlinker writes) must resolve
 * to a real file on disk.
 *
 * The historical failure mode was `console.log('✅')` followed by a symlink
 * whose target doesn't exist — `lstatSync` succeeds (symlink exists), but
 * the file the symlink points to doesn't. Use this helper instead of
 * `expect(stat.isSymbolicLink()).toBe(true)` so dangling links fail tests.
 */
export function assertSymlinkResolves(linkPath) {
    let target;
    try {
        target = realpathSync(linkPath);
    }
    catch (cause) {
        throw new Error(`Dangling symlink: ${linkPath} (realpathSync failed)`, { cause });
    }
    if (!existsSync(target)) {
        throw new Error(`Dangling symlink: ${linkPath} → ${target} (target does not exist)`);
    }
}
//# sourceMappingURL=assert-symlink-resolves.js.map