import { fixCodeBlockLanguages } from '#config/docs-lint/cli/fixers/code-language';
/**
 * Run markdownlint on a file.
 * @param fix - If true, return fixed content
 */
export function validateMarkdownlint(filePath, content, fix = false) {
    const errors = [];
    let fixedContent;
    if (fix) {
        const codeLanguageResult = fixCodeBlockLanguages(content, filePath, 0.7);
        if (codeLanguageResult.changes > 0) {
            fixedContent = codeLanguageResult.fixed;
        }
    }
    return { errors, fixedContent };
}
//# sourceMappingURL=markdownlint.js.map