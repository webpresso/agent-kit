export type TestTargetType = 'all' | 'file' | 'package';
export interface ResolvedTestTarget {
    type: TestTargetType;
    values: string[];
}
export interface TestTargetInput {
    package?: readonly string[];
    file?: readonly string[];
    positional?: readonly string[];
}
export declare function looksLikeTestFilePath(target: string): boolean;
export declare function resolveTestTarget(input: TestTargetInput): ResolvedTestTarget;
//# sourceMappingURL=target-resolver.d.ts.map