import matter from 'gray-matter';
function toSlug(heading) {
    return heading.toLowerCase().replace(/\s+/gu, '-');
}
export function parseDocument(fileContent) {
    const parsed = matter(fileContent);
    const frontmatter = parsed.data;
    const body = parsed.content;
    // Split on h2 boundaries (## heading) — no remark needed
    const sectionParts = body.split(/\n(?=## )/u);
    const sections = [];
    for (const part of sectionParts) {
        const trimmed = part.trimStart();
        if (!trimmed.startsWith('## ')) {
            // Content before first ## heading — skip or treat as preamble (ignored)
            continue;
        }
        const newlineIndex = trimmed.indexOf('\n');
        const headingLine = newlineIndex >= 0 ? trimmed.slice(3, newlineIndex).trim() : trimmed.slice(3).trim();
        const content = newlineIndex >= 0 ? trimmed.slice(newlineIndex + 1) : '';
        sections.push({
            slug: toSlug(headingLine),
            heading: headingLine,
            content,
        });
    }
    return { frontmatter, sections };
}
export function serializeDocument(frontmatter, sections) {
    const hasFrontmatter = Object.keys(frontmatter).length > 0;
    const fm = hasFrontmatter ? matter.stringify('', frontmatter).trimEnd() + '\n' : '';
    const body = [...sections.values()]
        .map(({ heading, content }) => {
        const trimmedContent = content.trimEnd();
        return trimmedContent.length > 0 ? `## ${heading}\n${trimmedContent}` : `## ${heading}`;
    })
        .join('\n\n');
    return fm + body + '\n';
}
//# sourceMappingURL=precedence.js.map