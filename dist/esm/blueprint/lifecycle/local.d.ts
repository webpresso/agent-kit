import type { BlueprintLifecycleIntent, BlueprintLifecycleResult } from './engine.js';
export interface ResolvedBlueprintFile {
    path: string;
    slug: string;
}
export interface BlueprintLifecycleWriteResult extends BlueprintLifecycleResult {
    moved: boolean;
    path: string;
    slug: string;
}
export declare function relativeBlueprintSlug(slug: string): string;
export declare function isValidBlueprintSlug(slug: string): boolean;
export declare function resolveBlueprintFile(projectRoot: string, slug: string): Promise<ResolvedBlueprintFile>;
export declare function applyBlueprintLifecycleToFile(projectRoot: string, slug: string, intent: BlueprintLifecycleIntent): Promise<BlueprintLifecycleWriteResult>;
//# sourceMappingURL=local.d.ts.map