/**
 * Parser for legacy bold metadata blocks used in implementation plans.
 * Converts **Key**: Value format to frontmatter-compatible object.
 */
interface BoldMetadata {
    status?: string;
    complexity?: string;
    last_updated?: string;
    [key: string]: string | undefined;
}
/**
 * Detect if content contains bold metadata block.
 */
export declare function hasBoldMetadata(content: string): boolean;
/**
 * Parse bold metadata block from content.
 * Returns parsed metadata and the content without the metadata block.
 */
export declare function parseBoldMetadata(content: string): {
    metadata: BoldMetadata;
    contentWithoutMetadata: string;
};
/**
 * Convert bold metadata values to frontmatter-compatible format.
 */
export declare function normalizeBoldMetadata(metadata: BoldMetadata): Record<string, unknown>;
export {};
