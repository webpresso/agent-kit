import type { DocType, DocTypeConfig } from '#types';
import type { ZodSchema } from 'zod';
export { baseFrontmatter } from './common';
export { decisionFrontmatter } from './decision';
export { implementationPlanFrontmatter, implementationPlanSections } from './implementation-plan';
/**
 * Simplified schema registry - only 6 types.
 * guide, system, research, and unknown all use baseFrontmatter (all fields optional).
 * Only blueprint and decision have stricter validation.
 */
export declare const schemaRegistry: Record<DocType, ZodSchema>;
/**
 * Configuration for each doc type including path patterns and required sections.
 * Simplified to 5 types with broader path matching.
 */
export declare const docTypeConfigs: DocTypeConfig[];
/**
 * Normalize a type value to a valid DocType.
 * Returns 'unknown' for unrecognized values.
 */
export declare function normalizeDocType(typeValue: string | undefined): DocType;
/**
 * Detect doc type from file path.
 * Returns 'unknown' if no pattern matches.
 */
export declare function detectDocType(filePath: string): DocType;
/**
 * Get the schema for a doc type.
 * Falls back to baseFrontmatter for unknown types.
 */
export declare function getSchema(docType: DocType): ZodSchema;
/**
 * Get the config for a doc type.
 */
export declare function getConfig(docType: DocType): DocTypeConfig | undefined;
