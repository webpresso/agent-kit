export interface ManagedRunnerResolution {
    readonly tool: string;
    readonly command: string;
    readonly args: readonly string[];
    readonly source: 'managed' | 'fallback';
}
export interface ResolveRunnerOptions {
    readonly fallbackCommand?: string;
    readonly fallbackArgs?: readonly string[];
    readonly filterOutput?: boolean;
}
export declare function resolveRunner(tool: string, options?: ResolveRunnerOptions): ManagedRunnerResolution;
//# sourceMappingURL=resolve-runner.d.ts.map