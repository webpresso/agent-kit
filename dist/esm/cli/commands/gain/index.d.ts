import type { CAC } from "cac";
export interface RunGainOptions {
    readonly cwd?: string;
    readonly indexDbPath?: string;
}
export declare function runGain(options?: RunGainOptions): number;
export declare function registerGainCommand(cli: CAC): void;
//# sourceMappingURL=index.d.ts.map