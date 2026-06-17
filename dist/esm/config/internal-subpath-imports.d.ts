type PackageImports = Record<string, string>;
export type VitestAliasEntry = {
    find: RegExp;
    replacement: string;
};
export declare function readCanonicalPackageImports(packageJsonPath?: string): PackageImports;
export declare function getSourcePackageImports(imports: PackageImports): PackageImports;
export declare function createVitestAliasEntriesFromPackageImports(imports?: PackageImports, repoRoot?: string): VitestAliasEntry[];
export declare function resolveVitestAliasSpecifier(specifier: string, aliases: readonly VitestAliasEntry[]): string | null;
export {};
//# sourceMappingURL=internal-subpath-imports.d.ts.map