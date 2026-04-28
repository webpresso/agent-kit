/**
 * Documentation Generator
 *
 * AST-aware Markdown generator for documentation synthesis.
 * Combines deterministic SSOT sections with AI-generated narrative using unified/remark.
 */
export { validateFrontmatter } from './frontmatter-validator.js';
export { generateDoc } from './markdown-generator.js';
export { getAvailableTemplates, loadTemplate } from './template-loader.js';
export type { FrontmatterField, GenerateDocInput, GenerateDocResult, LlmBlock, SectionDefinition, SsotData, TemplateSchema, ValidationError, ValidationErrorCode, } from './types.js';
