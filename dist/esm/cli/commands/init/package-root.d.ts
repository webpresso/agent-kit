export interface ResolveAgentKitPackageRootOptions {
    readonly moduleUrl?: string;
    readonly execPath?: string;
    readonly argv0?: string;
    readonly argv1?: string;
    readonly pathEnv?: string;
    readonly pathExtEnv?: string;
    readonly platform?: NodeJS.Platform;
    readonly requireCatalog?: boolean;
}
export declare function isAgentKitPackageRoot(dir: string, options?: {
    readonly requireCatalog?: boolean;
}): boolean;
export declare function findAgentKitPackageRoot(startPath: string | undefined, options?: {
    readonly requireCatalog?: boolean;
    readonly platform?: NodeJS.Platform;
}): string | null;
export declare function resolveAgentKitPackageRoot(options?: ResolveAgentKitPackageRootOptions): string | null;
export declare function resolveAgentKitPackageRootOrThrow(errorMessage: string, options?: ResolveAgentKitPackageRootOptions): string;
//# sourceMappingURL=package-root.d.ts.map