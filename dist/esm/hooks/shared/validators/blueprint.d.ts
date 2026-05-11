export interface BlueprintValidationResult {
    valid: boolean;
    reason?: string;
    details?: {
        hasPlan?: boolean;
        planPath?: string;
        skipReason?: string;
    };
}
export declare function shouldSkipFile(filePath: string): boolean;
export declare function getSkipReason(filePath: string): string;
export declare function validateBlueprint(filePath: string | undefined, options?: {
    bypassEnabled?: boolean;
}): BlueprintValidationResult;
export declare function parseFrontmatter(content: string): Record<string, unknown> | null;
export declare function isActivePlan(frontmatter: Record<string, unknown> | null): boolean;
//# sourceMappingURL=blueprint.d.ts.map