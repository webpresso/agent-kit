export interface WorkspaceReleasePackage {
    readonly name: string;
    readonly workspaceDependencies: readonly string[];
}
/**
 * Order workspace packages so local dependencies build/publish before their dependents.
 * Fails closed on cycles rather than silently falling back to a broken order.
 */
export declare function orderWorkspacePackagesForRelease<T extends WorkspaceReleasePackage>(packages: readonly T[]): T[];
//# sourceMappingURL=workspace-release-order.d.ts.map