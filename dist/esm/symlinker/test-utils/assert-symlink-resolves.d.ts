/**
 * Test helper enforcing the bc88 invariant: every emitted symlink under
 * `.agents/skills/` (or anywhere agent-kit's symlinker writes) must resolve
 * to a real file on disk.
 *
 * The historical failure mode was `console.log('✅')` followed by a symlink
 * whose target doesn't exist — `lstatSync` succeeds (symlink exists), but
 * the file the symlink points to doesn't. Use this helper instead of
 * `expect(stat.isSymbolicLink()).toBe(true)` so dangling links fail tests.
 */
export declare function assertSymlinkResolves(linkPath: string): void;
//# sourceMappingURL=assert-symlink-resolves.d.ts.map