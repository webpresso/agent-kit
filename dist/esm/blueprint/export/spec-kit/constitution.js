import { readFileSync } from 'node:fs';
import path from 'node:path';
/**
 * Emit constitution.md — Repo-level principles from VISION.md + CLAUDE.md.
 * Pure function, <40 LOC.
 */
export function emitConstitution(parsed, repoRoot) {
    const visionSection = readFirstSection(path.join(repoRoot, 'VISION.md'));
    const claudeSection = readFirstBulletListOrSection(path.join(repoRoot, 'CLAUDE.md'));
    const sections = ['# Repository Constitution', ''];
    if (visionSection) {
        sections.push(visionSection, '');
    }
    else {
        sections.push(`## Vision\n\n${parsed.title}`, '');
    }
    sections.push('## Key Principles', '');
    if (claudeSection) {
        sections.push(claudeSection);
    }
    else {
        sections.push('_See CLAUDE.md for project conventions._');
    }
    return sections.join('\n');
}
function readFirstSection(filePath) {
    try {
        const content = readFileSync(filePath, 'utf-8');
        const lines = content.split('\n');
        // Skip frontmatter
        let start = 0;
        if (lines[0] === '---') {
            const end = lines.indexOf('---', 1);
            start = end > 0 ? end + 1 : 0;
        }
        const body = lines.slice(start).join('\n').trimStart();
        // Return up to the second ## heading or first 20 lines
        const match = body.match(/^(#{1,2} .+(?:\n(?!#{1,2} ).+)*)/);
        const fallback = body.split('\n').slice(0, 20).join('\n').trim();
        return match?.[1]?.trim() ?? (fallback.length > 0 ? fallback : null);
    }
    catch {
        return null;
    }
}
function readFirstBulletListOrSection(filePath) {
    try {
        const content = readFileSync(filePath, 'utf-8');
        // Find first ## heading and return that section (up to next ##)
        const match = content.match(/^## .+\n([\s\S]*?)(?=\n## |\n# |$)/m);
        if (match)
            return match[0].trim();
        // Fallback: first bullet list block
        const bullets = content.match(/(?:^- .+\n)+/m);
        return bullets ? bullets[0].trim() : null;
    }
    catch {
        return null;
    }
}
//# sourceMappingURL=constitution.js.map