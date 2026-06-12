export interface ParsedDocument {
    frontmatter: Record<string, unknown>;
    content: string;
    hasFrontmatter: boolean;
}
/**
 * Parse a markdown file and extract frontmatter.
 * Uses gray-matter for YAML frontmatter parsing.
 */
export declare function parseFrontmatter(content: string): ParsedDocument;
/**
 * Generate YAML frontmatter string from an object.
 */
export declare function generateFrontmatter(data: Record<string, unknown>): string;
/**
 * Add or update frontmatter in a markdown document.
 * Returns the new document content.
 */
export declare function updateFrontmatter(content: string, newData: Record<string, unknown>): string;
//# sourceMappingURL=frontmatter.d.ts.map