import type { ValidationError } from '#types';
/**
 * Validate that required sections exist in the document.
 */
export declare function validateStructure(content: string, requiredSections: readonly string[], filePath: string): ValidationError[];
/**
 * Validate heading hierarchy (no skipped levels).
 */
export declare function validateHeadingHierarchy(content: string, filePath: string): ValidationError[];
