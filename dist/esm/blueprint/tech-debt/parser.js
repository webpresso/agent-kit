/**
 * TechDebt Parser
 *
 * Parses technical debt markdown files with validated frontmatter.
 * Uses Zod schema for type-safe frontmatter validation.
 *
 * Key features:
 * - Extracts hazard ID from H1 heading (# H-XXX: Title)
 * - Extracts remediation steps from #### Step X: format
 * - Computes checkbox completion status (Git-Native SSoT)
 * - Validates frontmatter using techDebtFrontmatterSchema
 */
import matter from 'gray-matter';
import { extractCodeBlocks } from '#markdown/helpers';
import { techDebtFrontmatterSchema } from './schema.js';
/**
 * Parse markdown with frontmatter and validate against a Zod schema.
 * Throws ZodError if validation fails.
 */
function parseWithSchema(markdown, schema) {
    const { data: rawData, content } = matter(markdown);
    const data = schema.parse(rawData);
    return { data, content };
}
/**
 * Extract checkbox status from a section
 * Returns total count and checked count
 */
export function extractCheckboxStatus(section) {
    const checkboxRegex = /^- \[([ x])\]/gm;
    const matches = Array.from(section.matchAll(checkboxRegex));
    const total = matches.length;
    const checked = matches.filter((m) => m[1] === 'x').length;
    return { total, checked };
}
/**
 * Extract hazard ID from first H1 heading
 * Format: # H-001: Title
 * Returns: "H-001" or null if not found
 */
function extractHazardId(content) {
    const hazardMatch = content.match(/^#\s+H-(\d+):/m);
    if (!hazardMatch?.[1])
        return null;
    return `H-${hazardMatch[1]}`;
}
/**
 * Extract title from first H1 heading
 * Format: # H-001: Title → "Title"
 * Or: # Title → "Title"
 */
function extractTitle(content) {
    const h1Match = content.match(/^#\s+(?:H-\d+:\s*)?(.+)$/m);
    return (h1Match?.[1] ?? 'Untitled').trim();
}
/**
 * Extract remediation steps from markdown
 * Format: #### Step X: Title
 * Checkbox status is extracted from content under each step
 */
function extractRemediationSteps(content) {
    const stepRegex = /^####\s+Step\s+(\d+):\s*(.+)$/gm;
    const matches = Array.from(content.matchAll(stepRegex));
    if (!matches.length) {
        return [];
    }
    return matches.map((match, index) => {
        const id = match[1] ?? '';
        const stepStart = match.index ?? 0;
        const nextStepIndex = matches[index + 1]?.index ?? content.length;
        // Extract section between this step and next step (or end of content)
        const stepSection = content.slice(stepStart, nextStepIndex);
        const { checked: checkedCount } = extractCheckboxStatus(stepSection);
        return {
            id,
            title: (match[2] ?? '').trim(),
            checked: checkedCount > 0, // Step is checked if any of its checkboxes are checked
        };
    });
}
/**
 * Parse a technical debt markdown document
 *
 * @param markdown - Full markdown content with frontmatter
 * @param slug - Document slug (usually filename without extension)
 * @returns Parsed TechDebtItem with all fields
 * @throws ZodError if frontmatter validation fails
 */
export function parseTechDebt(markdown, slug) {
    // Parse and validate frontmatter using Zod schema
    // This throws ZodError if frontmatter is invalid
    const { data, content } = parseWithSchema(markdown, techDebtFrontmatterSchema);
    const hazardId = extractHazardId(content);
    const title = extractTitle(content);
    const diagrams = extractCodeBlocks(content, 'mermaid');
    const remediationSteps = extractRemediationSteps(content);
    // Convert date fields to string format for consistency
    const lastReviewed = data.last_reviewed instanceof Date
        ? (data.last_reviewed.toISOString().split('T')[0] ?? '')
        : String(data.last_reviewed ?? '');
    return {
        slug,
        hazardId,
        title,
        status: data.status,
        severity: data.severity,
        category: data.category,
        reviewCadence: data.review_cadence,
        lastReviewed,
        nextReview: data.nextReview, // Computed by Zod transform
        basePriority: data.basePriority, // Computed by Zod transform
        linkedBlueprints: data.linked_blueprints,
        diagrams,
        remediationSteps,
        raw: markdown,
    };
}
/**
 * Serialize a TechDebtItem back to markdown
 * Updates frontmatter fields while preserving content
 */
export function serializeTechDebt(item) {
    const { data, content } = matter(item.raw);
    // Update mutable frontmatter fields
    if (item.status)
        data.status = item.status;
    if (item.lastReviewed)
        data.last_reviewed = item.lastReviewed;
    // Remove computed fields (they are regenerated on parse)
    const { nextReview: _nextReview, basePriority: _basePriority, ...cleanedData } = data;
    return matter.stringify(content, cleanedData);
}
//# sourceMappingURL=parser.js.map