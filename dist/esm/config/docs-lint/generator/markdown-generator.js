import { stringify as yamlStringify } from "yaml";
import { validateFrontmatter } from "./frontmatter-validator.js";
import { loadTemplate } from "./template-loader.js";
/**
 * Generates YAML frontmatter string
 */
function generateFrontmatter(frontmatter) {
    const cleanFrontmatter = {};
    for (const [key, value] of Object.entries(frontmatter)) {
        if (value !== undefined) {
            cleanFrontmatter[key] = value;
        }
    }
    if (!Object.keys(cleanFrontmatter).length) {
        return "";
    }
    return `---\n${yamlStringify(cleanFrontmatter)}---\n`;
}
/**
 * Generates markdown sections from SSOT data and LLM blocks
 */
function generateSections(ssotSections, llmBlocks) {
    const parts = [];
    for (const [sectionName, content] of Object.entries(ssotSections)) {
        parts.push(`## ${sectionName}\n\n${content}`);
    }
    for (const block of llmBlocks) {
        parts.push(`## ${block.section}\n\n${block.content}`);
    }
    return parts.join("\n\n");
}
/**
 * Processes raw markdown after deterministic generation.
 *
 * The folded runtime surface intentionally avoids the former sub-package-only
 * remark/unified dependencies until package manifest wiring is consolidated.
 * The generator already emits normalized markdown, so the no-op processor keeps
 * API behavior available without pulling CLI/template dependencies into this
 * task.
 */
function processMarkdown(rawMarkdown) {
    return {
        success: true,
        markdown: rawMarkdown,
    };
}
/**
 * Main document generation function.
 */
export function generateDoc(input) {
    const templateResult = loadTemplate(input.template);
    if (!templateResult.success) {
        return {
            success: false,
            errors: templateResult.errors,
        };
    }
    // Schema is guaranteed to exist when success is true
    const { schema } = templateResult;
    if (!schema) {
        return {
            success: false,
            errors: [{ code: "TEMPLATE_PARSE_ERROR", message: "Template schema is undefined" }],
        };
    }
    const frontmatterErrors = validateFrontmatter(input.ssot.frontmatter, schema);
    if (frontmatterErrors.length > 0) {
        return {
            success: false,
            errors: frontmatterErrors,
        };
    }
    const frontmatterStr = generateFrontmatter(input.ssot.frontmatter);
    const sectionsStr = generateSections(input.ssot.sections, input.llmBlocks);
    const rawMarkdown = `${frontmatterStr}\n${sectionsStr}\n`;
    return processMarkdown(rawMarkdown);
}
//# sourceMappingURL=markdown-generator.js.map