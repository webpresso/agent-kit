export interface TestPresetOptions {
    name?: string;
    include?: string[];
    exclude?: string[];
    environment?: "node" | "happy-dom" | "jsdom" | "edge-runtime";
    globals?: boolean;
    restoreMocks?: boolean;
    coverage?: boolean;
}
export interface DefineConfigCompatible {
    test?: {
        name?: string;
        include?: string[];
        exclude?: string[];
        environment?: string;
        globals?: boolean;
        restoreMocks?: boolean;
        coverage?: {
            provider: "v8" | "istanbul";
            reporter: string[];
        };
    };
}
export declare function defineTestPreset(options?: TestPresetOptions): DefineConfigCompatible;
export declare function createNodeTestPreset(options?: TestPresetOptions): DefineConfigCompatible;
//# sourceMappingURL=vitest.d.ts.map