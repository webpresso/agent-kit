/**
 * Validate internal plan links.
 */
/**
 * Validate internal plan links.
 */
export declare function validatePlanLinks(markdown: string, filePath: string): {
    valid: boolean;
    brokenLinks: string[];
};
/**
 * Check for CHANGELOG.md in completed plans.
 */
export declare function checkChangelog(filePath: string): {
    hasChangelog: boolean;
    warning?: string;
};
//# sourceMappingURL=links.d.ts.map