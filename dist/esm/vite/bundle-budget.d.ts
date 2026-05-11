export interface BundleBudgetAsset {
    path: string;
    bytes: number;
}
export interface BundleBudgetLimits {
    maxJsAssetBytes?: number;
    maxHtmlEagerJsAssetBytes?: number;
    maxHtmlEagerJsTotalBytes?: number;
}
export interface AnalyzeBundleBudgetOptions extends BundleBudgetLimits {
    assets: readonly BundleBudgetAsset[];
    html?: string;
    ignore?: readonly (RegExp | string)[];
}
export type BundleBudgetViolationKind = 'js-asset-too-large' | 'html-eager-js-asset-too-large' | 'html-eager-js-total-too-large' | 'html-referenced-asset-missing';
export interface BundleBudgetViolation {
    kind: BundleBudgetViolationKind;
    path?: string;
    bytes: number;
    limit?: number;
    message: string;
}
export interface BundleBudgetResult {
    ok: boolean;
    assets: readonly BundleBudgetAsset[];
    jsAssets: readonly BundleBudgetAsset[];
    htmlEagerJsAssets: readonly BundleBudgetAsset[];
    htmlEagerJsTotalBytes: number;
    htmlEagerJsReferences: readonly string[];
    violations: readonly BundleBudgetViolation[];
    limits: BundleBudgetLimits;
}
export declare function analyzeBundleBudget(options: AnalyzeBundleBudgetOptions): BundleBudgetResult;
export declare function extractHtmlEagerJsReferences(html: string): string[];
export declare function formatBundleBudgetReport(result: BundleBudgetResult): string;
export declare function formatBytes(bytes: number): string;
//# sourceMappingURL=bundle-budget.d.ts.map