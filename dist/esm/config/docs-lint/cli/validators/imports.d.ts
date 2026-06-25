import type { ValidationError } from "#config/docs-lint/index";
/**
 * Extract all @imports from content.
 * Only matches standalone @path references, not decorators or code.
 *
 * Skips:
 * - Lines inside fenced code blocks (```...```)
 * - Lines with parentheses/brackets (decorators like @migrations([))
 * - Lines that look like npm packages (@org/package)
 */
export declare function extractImports(content: string): Array<{
    path: string;
    line: number;
}>;
/**
 * Resolve import path relative to the importing file
 */
export declare function resolveImportPath(importPath: string, fromFile: string, projectRoot: string): string;
/**
 * Validate @imports in a markdown file
 *
 * Checks:
 * - Import paths resolve to existing files
 * - No circular dependencies
 * - Import depth doesn't exceed MAX_IMPORT_DEPTH
 *
 * Inspired by @felixgeelhaar/cclint
 */
export declare function validateImports(filePath: string, content: string, projectRoot: string): ValidationError[];
//# sourceMappingURL=imports.d.ts.map