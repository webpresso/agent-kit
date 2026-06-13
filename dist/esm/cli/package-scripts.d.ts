export interface PackageJsonLike {
    readonly scripts?: Record<string, unknown>;
    readonly dependencies?: Record<string, unknown>;
    readonly devDependencies?: Record<string, unknown>;
    readonly optionalDependencies?: Record<string, unknown>;
}
export declare function readPackageJson(cwd: string): PackageJsonLike | undefined;
export declare function getPackageScript(cwd: string, name: string): string | undefined;
export declare function packageHasDependency(cwd: string, dependencyName: string): boolean;
export declare function packageUsesVitest(cwd: string): boolean;
export declare function isRecursiveWpScript(script: string, verb: string): boolean;
//# sourceMappingURL=package-scripts.d.ts.map