/**
 * Documentation Generator
 *
 * AST-aware Markdown generator for documentation synthesis.
 * Combines deterministic SSOT sections with AI-generated narrative using unified/remark.
 */
export { validateFrontmatter } from './frontmatter-validator';
export { generateDoc } from './markdown-generator';
export { getAvailableTemplates, loadTemplate } from './template-loader';
export type { FrontmatterField, GenerateDocInput, GenerateDocResult, LlmBlock, SectionDefinition, SsotData, TemplateSchema, ValidationError, ValidationErrorCode, } from './types';
