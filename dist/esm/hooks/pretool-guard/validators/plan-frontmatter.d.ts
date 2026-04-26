import type { ToolInput, ValidationResult } from '../../shared/types.js';
interface Violation {
    field: string;
    message: string;
}
export declare function extractFrontmatterBlock(content: string): string | null;
export declare function parseFrontmatter(yamlBlock: string): Record<string, unknown> | null;
export declare function collectFieldViolations(data: Record<string, unknown>): Violation[];
export declare function countTaskHeadings(content: string): number;
export declare function detectWrongTaskFormat(content: string): number;
export declare function validatePlanFrontmatter(input: ToolInput): ValidationResult;
export {};
//# sourceMappingURL=plan-frontmatter.d.ts.map