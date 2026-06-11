export interface RuntimeTarget {
    readonly id: string;
    readonly bunTarget: string;
    readonly os: NodeJS.Platform;
    readonly cpu: NodeJS.Architecture;
    readonly packageName: string;
}
export declare const RUNTIME_BINARY_NAME = "wp";
export declare const RUNTIME_TARGETS: readonly RuntimeTarget[];
export declare function runtimeBinaryFilename(target: RuntimeTarget): string;
export declare function runtimePackageDirName(packageName: string): string;
export declare function resolveRuntimeTarget(platform?: NodeJS.Platform, arch?: NodeJS.Architecture): RuntimeTarget | undefined;
//# sourceMappingURL=runtime-targets.d.ts.map