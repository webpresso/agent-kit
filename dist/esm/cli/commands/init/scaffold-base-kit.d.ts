import { type MergeOptions, type MergeResult } from './merge.js';
export interface ScaffoldBaseKitInput {
    catalogDir: string;
    repoRoot: string;
    options: MergeOptions;
}
export interface RuntimeContractGuidance {
    keepLocalAuthoringDeps: string[];
    reviewForRemovalDeps: string[];
}
interface PackageJsonLike {
    dependencies?: Record<string, string>;
    devDependencies?: Record<string, string>;
    [key: string]: unknown;
}
export declare function collectRuntimeContractGuidance(packageJson: PackageJsonLike | null | undefined): RuntimeContractGuidance;
export declare const BASE_KIT_QUALITY_TARGETS: string[];
export declare function scaffoldBaseKit(input: ScaffoldBaseKitInput): MergeResult[];
export {};
//# sourceMappingURL=scaffold-base-kit.d.ts.map