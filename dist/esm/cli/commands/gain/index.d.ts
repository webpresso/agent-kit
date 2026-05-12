import type { CAC } from 'cac';
export type ContextModeStats = {
    readonly sessions: number;
    readonly events: number;
    readonly compacts: number;
};
export declare function queryContextModeStats(sessionDirs?: readonly string[]): ContextModeStats | null;
export declare function runGain(sessionDirs?: readonly string[]): number;
export declare function registerGainCommand(cli: CAC): void;
//# sourceMappingURL=index.d.ts.map