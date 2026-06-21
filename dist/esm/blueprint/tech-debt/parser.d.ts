/**
 * TechDebt Parser
 *
 * Parses technical debt markdown files with validated frontmatter.
 * Uses Zod schema for type-safe frontmatter validation.
 *
 * Key features:
 * - Extracts hazard ID from H1 heading (# H-XXX: Title)
 * - Extracts remediation steps from #### Step X: format
 * - Computes checkbox completion status (Git-Native SSoT)
 * - Validates frontmatter using techDebtFrontmatterSchema
 */
/**
 * Extract checkbox status from a section
 * Returns total count and checked count
 */
export declare function extractCheckboxStatus(section: string): {
    total: number;
    checked: number;
};
export interface RemediationStep {
    id: string;
    title: string;
    checked: boolean;
}
export interface TechDebtItem {
    slug: string;
    hazardId: string | null;
    title: string;
    status: string;
    severity: string;
    category?: string;
    reviewCadence?: string;
    lastReviewed?: string;
    nextReview: string;
    basePriority: number;
    linkedBlueprints?: string[];
    diagrams: string[];
    remediationSteps: RemediationStep[];
    raw: string;
}
/**
 * Parse a technical debt markdown document
 *
 * @param markdown - Full markdown content with frontmatter
 * @param slug - Document slug (usually filename without extension)
 * @returns Parsed TechDebtItem with all fields
 * @throws ZodError if frontmatter validation fails
 */
export declare function parseTechDebt(markdown: string, slug: string): TechDebtItem;
/**
 * Serialize a TechDebtItem back to markdown
 * Updates frontmatter fields while preserving content
 */
export declare function serializeTechDebt(item: TechDebtItem): string;
//# sourceMappingURL=parser.d.ts.map