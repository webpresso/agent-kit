import type { ValidationError } from '#config/docs-lint/index';
/**
 * Extract markdown links from content.
 * Matches: [text](url) and ![alt](url)
 * Skips external URLs (http://, https://, mailto:, etc.)
 */
export declare function extractLinks(content: string): Array<{
    href: string;
    line: number;
    isImage: boolean;
}>;
/**
 * Resolve link path relative to the document file.
 * Strips hash anchors before resolution.
 */
export declare function resolveLinkPath(href: string, fromFile: string): string;
/**
 * Validate markdown links in a file.
 *
 * Checks:
 * - Internal link targets exist on the filesystem
 * - Relative paths resolve correctly
 *
 * Skips:
 * - External URLs (http, https, mailto, tel)
 * - Anchor-only links (#section)
 * - Links inside code blocks
 */
export declare function validateLinks(filePath: string, content: string): ValidationError[];
//# sourceMappingURL=links.d.ts.map