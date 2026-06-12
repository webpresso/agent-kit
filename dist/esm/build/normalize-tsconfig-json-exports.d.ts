type ExportEntry = string | {
    import?: string | {
        default?: string;
        types?: string;
    };
    default?: string;
};
type PackageManifest = {
    exports?: Record<string, ExportEntry>;
};
export declare function normalizeTsconfigJsonExports(manifest: PackageManifest): PackageManifest;
/**
 * Write `content` to `destPath` atomically via a temp file + rename so
 * concurrent readers (e.g. bun resolving #-subpath imports) never see a
 * truncated or empty intermediate state.
 */
export declare function atomicWriteFile(destPath: string, content: string): void;
export {};
//# sourceMappingURL=normalize-tsconfig-json-exports.d.ts.map