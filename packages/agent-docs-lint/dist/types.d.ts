import type { ZodSchema } from 'zod';
/**
 * Document types matching the 3-folder docs/ structure plus special types.
 *
 * Folder mapping:
 * - guide: docs/guides/ (tutorials, patterns, onboarding)
 * - system: docs/system/ (architecture, decisions, rules, infrastructure)
 * - research: docs/research/ (audits, evaluations, product vision)
 * - blueprint: webpresso/blueprints/ (full Blueprint validation)
 * - decision: docs/system/decisions/ (ADRs)
 * - unknown: fallback for untyped docs
 */
export type DocType = 'guide' | 'system' | 'research' | 'blueprint' | 'decision' | 'unknown';
export interface DocTypeConfig {
    type: DocType;
    pathPatterns: RegExp[];
    schema: ZodSchema;
    requiredSections?: string[];
}
export interface ValidationError {
    file: string;
    line?: number;
    column?: number;
    severity: 'error' | 'warning';
    source: 'schema' | 'markdownlint' | 'vale' | 'structure' | 'context-limits' | 'blueprint-format';
    message: string;
    ruleId?: string;
}
/**
 * Configuration for context file size limits.
 * Based on best practices from Anthropic and HumanLayer research.
 * @see https://www.humanlayer.dev/blog/writing-a-good-claude-md
 * @see https://www.anthropic.com/engineering/claude-code-best-practices
 */
export interface ContextFileLimits {
    /** Maximum lines before error */
    maxLines: number;
    /** Lines threshold for warning */
    warnLines: number;
    /** Maximum estimated tokens (chars/4) before error */
    maxTokens?: number;
    /** Token threshold for warning */
    warnTokens?: number;
    /** Description shown in error messages */
    description: string;
}
export interface ValidationResult {
    file: string;
    errors: ValidationError[];
    warnings: ValidationError[];
    valid: boolean;
}
export interface ParsedDocument {
    frontmatter: Record<string, unknown>;
    content: string;
    hasFrontmatter: boolean;
}
export interface MigrationResult {
    file: string;
    action: 'added' | 'updated' | 'skipped' | 'error';
    docType: DocType;
    message?: string;
}
