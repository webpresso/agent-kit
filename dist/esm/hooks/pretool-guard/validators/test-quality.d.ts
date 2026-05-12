import type { ToolInput, ValidationResult } from '#hooks/shared/types';
export declare const MUTATION_GAMING_PATTERNS: Array<{
    pattern: RegExp;
    description: string;
    fileLevel?: boolean;
}>;
export declare const TAUTOLOGICAL_PATTERNS: Array<{
    pattern: RegExp;
    description: string;
}>;
export declare function findTautologicalAssertions(content: string): Array<{
    line: number;
    pattern: string;
    match: string;
}>;
export declare function findMutationGamingPatterns(content: string, filePath?: string): Array<{
    line: number;
    pattern: string;
    match: string;
}>;
export declare function validateTestQuality(input: ToolInput): ValidationResult;
//# sourceMappingURL=test-quality.d.ts.map