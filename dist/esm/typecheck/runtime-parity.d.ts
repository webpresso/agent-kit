export declare const RUNTIME_TYPECHECK_PARITY_TIMEOUT_MS = 60000;
export declare const RUNTIME_TYPECHECK_PARITY_ROOT_SCOPE = "@parity/root";
export declare const RUNTIME_TYPECHECK_PARITY_WORKSPACE_SCOPE = "@parity/widget";
export declare const RUNTIME_TYPECHECK_PARITY_ROOT_FILE = "src/root.ts";
export declare const RUNTIME_TYPECHECK_PARITY_WORKSPACE_FILE = "packages/widget/src/widget.ts";
export type RuntimeTypecheckParityProbeOptions = {
    readonly command: string;
    readonly args?: readonly string[];
    readonly env?: NodeJS.ProcessEnv;
    readonly timeoutMs?: number;
    readonly workspaceRoot?: string;
};
export type RuntimeTypecheckParityProbeResult = {
    readonly ok: boolean;
    readonly failures: readonly string[];
    readonly helpOutput: string;
    readonly fileOutput: string;
    readonly expectedScopes: readonly string[];
    readonly workspaceRoot: string;
};
export declare function formatResolvedTypecheckScopes(expectedScopes: readonly string[]): string;
export declare function findTypecheckHelpSurfaceGaps(output: string): string[];
export declare function findResolvedTypecheckScopeGaps(output: string, expectedScopes: readonly string[]): string[];
export declare function formatRuntimeTypecheckParityFailures(result: Pick<RuntimeTypecheckParityProbeResult, 'failures'>): string;
export declare function probeRuntimeTypecheckParity(options: RuntimeTypecheckParityProbeOptions): RuntimeTypecheckParityProbeResult;
//# sourceMappingURL=runtime-parity.d.ts.map