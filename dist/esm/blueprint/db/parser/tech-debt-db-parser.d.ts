/**
 * Tech-Debt DB Parser
 *
 * Extracts structured data from tech-debt `h-NNN-<slug>.md` files for DB projection.
 * Reuses the existing `techDebtFrontmatterSchema` for validation.
 *
 * Fault-tolerant: malformed YAML logs to stderr and returns partial data; never throws.
 */
export interface ParsedTechDebtForDb {
    slug: string;
    filePath: string;
    status: string;
    severity: string;
    category: string;
    reviewCadence: string;
    lastReviewed: string | null;
    created: string | null;
    nextReview: string | null;
    basePriority: number | null;
    linkedBlueprints: string[];
    autoFiledHash: string | null;
    organization: string;
    visibility: 'public' | 'private';
    byteSize: number;
    contentHash: string;
}
/**
 * Parse a tech-debt `h-NNN-<slug>.md` file for DB projection.
 *
 * Fault-tolerant: invalid frontmatter logs to stderr and returns partial data.
 */
export declare function parseTechDebtForDb(content: string, filePath: string, slug: string): ParsedTechDebtForDb;
//# sourceMappingURL=tech-debt-db-parser.d.ts.map