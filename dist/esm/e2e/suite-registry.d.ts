import type { E2eSuiteDefinition, ResolvedE2eFile } from './types.js';
export interface NormalizeE2ePathOptions {
    extraRootPatterns?: readonly RegExp[];
}
export declare function defineE2eSuite<TSuite extends E2eSuiteDefinition>(suite: TSuite): TSuite;
export declare function normalizeE2ePath(filePath: string, options?: NormalizeE2ePathOptions): string;
export declare function resolveE2eSuiteId(name: string, suites: readonly E2eSuiteDefinition[]): string | null;
export declare function resolveE2eSuiteForPath(filePath: string, suites: readonly E2eSuiteDefinition[], normalizeOptions?: NormalizeE2ePathOptions): ResolvedE2eFile | null;
//# sourceMappingURL=suite-registry.d.ts.map