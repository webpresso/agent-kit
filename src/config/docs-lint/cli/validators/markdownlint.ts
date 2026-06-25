import type { ValidationError } from "#config/docs-lint/index";

import { fixCodeBlockLanguages } from "#config/docs-lint/cli/fixers/code-language";

export interface MarkdownlintResult {
  errors: ValidationError[];
  fixedContent?: string;
}

/**
 * Run markdownlint on a file.
 * @param fix - If true, return fixed content
 */
export function validateMarkdownlint(
  filePath: string,
  content: string,
  fix = false,
): MarkdownlintResult {
  const errors: ValidationError[] = [];
  let fixedContent: string | undefined;

  if (fix) {
    const codeLanguageResult = fixCodeBlockLanguages(content, filePath, 0.7);

    if (codeLanguageResult.changes > 0) {
      fixedContent = codeLanguageResult.fixed;
    }
  }

  return { errors, fixedContent };
}
