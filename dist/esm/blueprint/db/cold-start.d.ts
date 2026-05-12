export interface ColdStartResult {
    rebuilt: boolean;
    blueprintsCount: number;
    techDebtCount: number;
    durationMs: number;
}
export declare function coldStartIfNeeded(cwd: string): Promise<ColdStartResult>;
//# sourceMappingURL=cold-start.d.ts.map