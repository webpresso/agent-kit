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
export {};
//# sourceMappingURL=normalize-tsconfig-json-exports.d.ts.map