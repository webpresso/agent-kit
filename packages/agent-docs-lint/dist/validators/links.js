import { existsSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
/** External or special URL prefixes to skip */
const SKIPPED_PREFIXES = [
    'http://',
    'https://',
    'mailto:',
    'tel:',
    '#', // anchor-only links
    'file://', // file:// URIs (deep links, not relative paths)
    'plan://', // plan:// protocol for cross-plan references
];
/**
 * Check if href should be skipped (external or special URLs)
 */
function shouldSkipLink(href) {
    if (SKIPPED_PREFIXES.some((prefix) => href.startsWith(prefix))) {
        return true;
    }
    // Skip template placeholders like {source}.md or ${name}.md
    if (/[{$]/.test(href)) {
        return true;
    }
    return false;
}
/**
 * Check if href points to a markdown file (the only type we validate)
 */
function isValidMarkdownLink(href) {
    const pathWithoutAnchor = href.split('#')[0];
    return pathWithoutAnchor?.endsWith('.md') ?? false;
}
/**
 * Extract links from a single line
 */
function extractLinksFromLine(line, lineNumber) {
    const links = [];
    // Simpler regex that avoids catastrophic backtracking
    // Matches: [text](url) and ![alt](url)
    // Uses possessive-like pattern by not allowing backtracking on bracket content
    const linkRegex = /(!?\[[^\]]*\])\(([^)]+)\)/g;
    let match;
    match = linkRegex.exec(line);
    while (match !== null) {
        const isImage = match[1]?.startsWith('!');
        const href = match[2]?.trim();
        if (!href) {
            match = linkRegex.exec(line);
            continue;
        }
        if (shouldSkipLink(href)) {
            match = linkRegex.exec(line);
            continue;
        }
        if (!isValidMarkdownLink(href)) {
            match = linkRegex.exec(line);
            continue;
        }
        links.push({ href, line: lineNumber, isImage: isImage ?? false });
        match = linkRegex.exec(line);
    }
    return links;
}
/**
 * Extract markdown links from content.
 * Matches: [text](url) and ![alt](url)
 * Skips external URLs (http://, https://, mailto:, etc.)
 */
export function extractLinks(content) {
    const links = [];
    const lines = content.split('\n');
    let inCodeBlock = false;
    for (let i = 0; i < lines.length; i++) {
        const line = lines[i];
        if (!line)
            continue;
        // Track code block boundaries
        if (line.trim().startsWith('```')) {
            inCodeBlock = !inCodeBlock;
            continue;
        }
        // Skip content inside code blocks
        if (inCodeBlock)
            continue;
        links.push(...extractLinksFromLine(line, i + 1));
    }
    return links;
}
/**
 * Resolve link path relative to the document file.
 * Strips hash anchors before resolution.
 */
export function resolveLinkPath(href, fromFile) {
    // Strip hash anchor if present
    const [pathPart] = href.split('#');
    if (!pathPart)
        return '';
    // Resolve relative to the directory containing the document
    return resolve(dirname(fromFile), pathPart);
}
/**
 * Validate markdown links in a file.
 *
 * Checks:
 * - Internal link targets exist on the filesystem
 * - Relative paths resolve correctly
 *
 * Skips:
 * - External URLs (http, https, mailto, tel)
 * - Anchor-only links (#section)
 * - Links inside code blocks
 */
export function validateLinks(filePath, content) {
    const errors = [];
    const links = extractLinks(content);
    for (const link of links) {
        const resolvedPath = resolveLinkPath(link.href, filePath);
        if (!resolvedPath)
            continue;
        // Check if file exists
        if (!existsSync(resolvedPath)) {
            errors.push({
                file: filePath,
                line: link.line,
                severity: 'error',
                source: 'structure',
                message: `Broken ${link.isImage ? 'image' : 'link'}: ${link.href} (resolved to ${resolvedPath})`,
                ruleId: 'broken-link',
            });
        }
    }
    return errors;
}
