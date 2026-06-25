export interface SessionMemoryNativeTarget {
    readonly id: string;
    readonly os: NodeJS.Platform;
    readonly cpu: NodeJS.Architecture;
    readonly packageName: string;
    readonly addonFilename: "session_memory_napi.node";
}
export declare const SESSION_MEMORY_NATIVE_ADDON_FILENAME = "session_memory_napi.node";
export declare const SESSION_MEMORY_NATIVE_TARGETS: readonly SessionMemoryNativeTarget[];
export declare function resolveSessionMemoryNativeTarget(platform?: NodeJS.Platform, arch?: NodeJS.Architecture): SessionMemoryNativeTarget | undefined;
export declare function sessionMemoryNativePackageDirName(packageName: string): string;
//# sourceMappingURL=native-targets.d.ts.map