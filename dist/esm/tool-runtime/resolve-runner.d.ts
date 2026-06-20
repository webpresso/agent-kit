export interface ManagedRunnerResolution {
    readonly tool: string;
    readonly command: string;
    readonly args: readonly string[];
    readonly source: 'managed' | 'fallback';
}
export type ManagedRunnerOutputPolicy = 'rtk-filtered' | 'structured';
export interface ResolveRunnerOptions {
    readonly fallbackCommand?: string;
    readonly fallbackArgs?: readonly string[];
    readonly nodeExecPath?: string;
    /** @deprecated Use {@link outputPolicy} for explicit output routing. */
    readonly filterOutput?: boolean;
    readonly outputPolicy?: ManagedRunnerOutputPolicy;
}
export declare function setRtkAvailabilityProbeForTest(value: boolean | null): void;
export declare function resolveOutputPolicy(outputPolicy: ManagedRunnerOutputPolicy | undefined, filterOutput: boolean | undefined): ManagedRunnerOutputPolicy;
export declare function resolveRunner(tool: string, options?: ResolveRunnerOptions): ManagedRunnerResolution;
//# sourceMappingURL=resolve-runner.d.ts.map