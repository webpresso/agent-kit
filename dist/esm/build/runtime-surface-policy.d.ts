export declare const AGENT_KIT_TARBALL_SIZE_BUDGET_BYTES = 29704296;
export declare const AGENT_KIT_TARBALL_UNPACKED_SIZE_BUDGET_BYTES = 86643227;
export interface TarballSizeBudgetInput {
    readonly size?: number;
    readonly unpackedSize?: number;
}
export interface TarballSizeBudgetResult {
    readonly sizeOk: boolean;
    readonly unpackedOk: boolean;
    readonly size: number;
    readonly unpackedSize: number;
}
export declare function evaluateAgentKitTarballSizeBudget(packSummary: TarballSizeBudgetInput): TarballSizeBudgetResult;
//# sourceMappingURL=runtime-surface-policy.d.ts.map