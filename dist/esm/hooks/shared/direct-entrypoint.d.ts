/**
 * Return true when a module is being executed directly rather than imported.
 *
 * Bun single-file executables expose virtual `/$bunfs/...` paths while loading
 * bundled modules. Those paths are not real filesystem entries, so direct
 * `realpathSync` checks must degrade instead of throwing during native runtime
 * imports.
 */
export declare function isDirectEntrypoint(moduleUrl: string, argvPath?: string | undefined): boolean;
//# sourceMappingURL=direct-entrypoint.d.ts.map