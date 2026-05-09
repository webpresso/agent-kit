import type { Failure, TransformContext, TransformResult } from './index.js';
export type NumericTransformTier = 1 | 2 | 3;
export declare function createTransformResult(rawOutput: string, compactOutput: string, context: TransformContext, options: {
    readonly tier: NumericTransformTier;
    readonly failures?: readonly Failure[];
    readonly legacyTier?: 'passthrough' | 'registered';
}): TransformResult;
//# sourceMappingURL=metadata.d.ts.map