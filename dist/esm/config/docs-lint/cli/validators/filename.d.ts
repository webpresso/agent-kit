import type { ValidationError } from '#config/docs-lint/index';
/**
 * Validate that a documentation filename follows lowercase kebab-case convention.
 *
 * Rules:
 * - Filenames must be all lowercase
 * - Words must be separated by hyphens (not underscores)
 * - Special files like `_overview.md` are allowed
 * - Date-prefixed files are allowed (e.g., 2026-01-07-audit.md)
 */
export declare function validateFilename(filePath: string): ValidationError[];
//# sourceMappingURL=filename.d.ts.map