import type { SsotData, TemplateSchema, ValidationError } from './types';
/**
 * Validates frontmatter against template schema
 */
export declare function validateFrontmatter(frontmatter: SsotData['frontmatter'], schema: TemplateSchema): ValidationError[];
