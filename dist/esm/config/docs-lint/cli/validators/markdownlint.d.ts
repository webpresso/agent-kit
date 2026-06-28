import type { ValidationError } from "#config/docs-lint/index";
export interface MarkdownlintResult {
    errors: ValidationError[];
    fixedContent?: string;
}
/**
 * Run markdownlint on a file.
 * @param fix - If true, return fixed content
 */
export declare function validateMarkdownlint(filePath: string, content: string, fix?: boolean): MarkdownlintResult;
//# sourceMappingURL=markdownlint.d.ts.map