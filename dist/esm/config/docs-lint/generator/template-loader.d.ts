import type { TemplateSchema, ValidationError } from "./types.js";
/**
 * Result of loading a template
 */
export interface LoadTemplateResult {
    success: boolean;
    schema?: TemplateSchema;
    errors?: ValidationError[];
}
/**
 * Loads a template schema from templates/{name}.yaml
 */
export declare function loadTemplate(templateName: string): LoadTemplateResult;
/**
 * Gets list of available template names
 */
export declare function getAvailableTemplates(): string[];
//# sourceMappingURL=template-loader.d.ts.map