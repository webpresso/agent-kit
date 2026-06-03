import { baseFrontmatter } from './common.js';
import { decisionFrontmatter } from './decision.js';
import { implementationPlanFrontmatter, implementationPlanSections } from './implementation-plan.js';
export { baseFrontmatter } from './common.js';
export { decisionFrontmatter } from './decision.js';
export { implementationPlanFrontmatter, implementationPlanSections } from './implementation-plan.js';
const BLUEPRINTS_ROOT = 'webpresso/blueprints';
/**
 * Simplified schema registry - only 6 types.
 * guide, system, research, and unknown all use baseFrontmatter (all fields optional).
 * Only blueprint and decision have stricter validation.
 */
export const schemaRegistry = {
    guide: baseFrontmatter,
    system: baseFrontmatter,
    research: baseFrontmatter,
    blueprint: implementationPlanFrontmatter,
    decision: decisionFrontmatter,
    unknown: baseFrontmatter,
};
/**
 * Configuration for each doc type including path patterns and required sections.
 * Simplified to 5 types with broader path matching.
 */
export const docTypeConfigs = [
    {
        type: 'blueprint',
        pathPatterns: [new RegExp(`^${BLUEPRINTS_ROOT}/`)],
        schema: implementationPlanFrontmatter,
        requiredSections: [...implementationPlanSections],
    },
    {
        type: 'decision',
        pathPatterns: [
            /^docs\/architecture\/decisions\//,
            /^docs\/decisions\//,
            /^docs\/system\/decisions\//,
        ],
        schema: decisionFrontmatter,
    },
    {
        type: 'system',
        pathPatterns: [/^docs\/system\//],
        schema: baseFrontmatter,
    },
    {
        type: 'research',
        pathPatterns: [/^docs\/research\//],
        schema: baseFrontmatter,
    },
    {
        type: 'guide',
        pathPatterns: [
            /^docs\//,
            /^\.agent\/rules\/agent-guide\.md$/,
            /^AGENTS\.md$/,
            /^CLAUDE\.md$/,
            /^GEMINI\.md$/,
            /^README\.md$/,
            /README\.md$/,
            /^\.claude\//,
        ],
        schema: baseFrontmatter,
    },
];
/**
 * Normalize a type value to a valid DocType.
 * Returns 'unknown' for unrecognized values.
 */
export function normalizeDocType(typeValue) {
    if (!typeValue)
        return 'unknown';
    // Check if it's already a valid DocType
    const validTypes = ['guide', 'system', 'research', 'blueprint', 'decision', 'unknown'];
    if (validTypes.includes(typeValue)) {
        return typeValue;
    }
    return 'unknown';
}
/**
 * Detect doc type from file path.
 * Returns 'unknown' if no pattern matches.
 */
export function detectDocType(filePath) {
    // Normalize path separators
    const normalizedPath = filePath.replace(/\\/g, '/');
    for (const config of docTypeConfigs) {
        for (const pattern of config.pathPatterns) {
            if (pattern.test(normalizedPath)) {
                return config.type;
            }
        }
    }
    return 'unknown';
}
/**
 * Get the schema for a doc type.
 * Falls back to baseFrontmatter for unknown types.
 */
export function getSchema(docType) {
    return schemaRegistry[docType] ?? baseFrontmatter;
}
/**
 * Get the config for a doc type.
 */
export function getConfig(docType) {
    return docTypeConfigs.find((c) => c.type === docType);
}
//# sourceMappingURL=index.js.map