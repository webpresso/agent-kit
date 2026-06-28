import type { BundleBudgetLimits } from "./bundle-budget.js";
export interface AnalyzeViteDistBundleBudgetOptions extends BundleBudgetLimits {
    distDir: string;
    htmlEntry?: string;
    ignore?: readonly (RegExp | string)[];
}
export interface BundleBudgetCliOptions extends BundleBudgetLimits {
    distDir: string;
    htmlEntry: string;
    ignore: readonly string[];
}
export declare function analyzeViteDistBundleBudget(options: AnalyzeViteDistBundleBudgetOptions): import("./bundle-budget.js").BundleBudgetResult;
export declare function parseBundleBudgetCliArgs(argv: readonly string[]): BundleBudgetCliOptions;
export declare function runBundleBudgetCli(argv?: readonly string[]): Promise<number>;
export declare function bundleBudgetCliHelp(): string;
//# sourceMappingURL=local.d.ts.map