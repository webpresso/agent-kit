/**
 * Extract section headings from markdown content.
 */
function extractHeadings(content) {
    const headings = [];
    const lines = content.split('\n');
    for (let i = 0; i < lines.length; i++) {
        const line = lines[i];
        if (!line)
            continue;
        const match = line.match(/^(#{1,6})\s+(.+)$/);
        if (match?.[1] && match[2]) {
            headings.push({
                level: match[1].length,
                text: match[2].trim(),
                line: i + 1,
            });
        }
    }
    return headings;
}
/**
 * Validate that required sections exist in the document.
 */
export function validateStructure(content, requiredSections, filePath) {
    const errors = [];
    const headings = extractHeadings(content);
    const headingTexts = new Set(headings.map((h) => h.text.toLowerCase()));
    for (const section of requiredSections) {
        // Check for exact match or partial match (case-insensitive)
        const found = Array.from(headingTexts).some((h) => h === section.toLowerCase() ||
            h.includes(section.toLowerCase()) ||
            section.toLowerCase().includes(h));
        if (!found) {
            errors.push({
                file: filePath,
                severity: 'warning',
                source: 'structure',
                message: `Missing recommended section: "${section}"`,
                ruleId: 'required-section',
            });
        }
    }
    return errors;
}
/**
 * Validate heading hierarchy (no skipped levels).
 */
export function validateHeadingHierarchy(content, filePath) {
    const errors = [];
    const headings = extractHeadings(content);
    let previousLevel = 0;
    for (const heading of headings) {
        // Allow jumping from 0 to any level (first heading)
        if (previousLevel === 0) {
            previousLevel = heading.level;
            continue;
        }
        // Allow going up (smaller number) any amount
        // Only flag if we skip levels going down (e.g., H2 to H4)
        if (heading.level > previousLevel + 1) {
            errors.push({
                file: filePath,
                line: heading.line,
                severity: 'warning',
                source: 'structure',
                message: `Skipped heading level: H${previousLevel} to H${heading.level}`,
                ruleId: 'heading-hierarchy',
            });
        }
        previousLevel = heading.level;
    }
    return errors;
}
