type DependencySection = 'dependencies' | 'devDependencies' | 'optionalDependencies' | 'peerDependencies';
type PackageManifest = Record<string, unknown> & Partial<Record<DependencySection, Record<string, string>>>;
type WorkspaceCatalogs = {
    catalog?: Record<string, string>;
    catalogs?: Record<string, Record<string, string>>;
    workspacePackages?: Record<string, string>;
};
interface PackedManifestOptions {
    assertBlueprintMigrationAssets?: boolean;
    includeRuntimeOptionalDependencies?: boolean;
    workspaceRoot?: string;
}
export declare function readWorkspaceCatalogs(workspacePath: string): WorkspaceCatalogs;
export declare function resolveCatalogSpecifier(dependencyName: string, version: string, workspaceCatalogs: WorkspaceCatalogs): string;
export declare function createPackedManifest(manifest: PackageManifest, workspaceCatalogs: WorkspaceCatalogs, options?: PackedManifestOptions): PackageManifest;
export declare function preparePackedManifest(rootDir: string, options?: PackedManifestOptions): void;
export declare function restorePackedManifest(rootDir: string): void;
export {};
//# sourceMappingURL=package-manifest.d.ts.map