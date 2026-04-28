#!/usr/bin/env tsx
/**
 * Internal Markdown Link Checker
 *
 * Validates that internal doc links (./foo.md, ../bar.md, docs/x.md)
 * point to files that actually exist.
 *
 * Usage:
 *   tsx check-internal-links.ts                    # Check all docs
 *   tsx check-internal-links.ts file1.md file2.md  # Check specific files
 */
import { existsSync, readFileSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { glob } from 'tinyglobby';
// Match markdown links: [text](path.md) or [text](path.md#anchor)
const LINK_PATTERN = /\[([^\]]*)\]\(([^)]+\.md(?:#[^)]*)?)\)/g;
/**
 * Check if a link should be skipped
 */
function shouldSkipRawLink(rawLink) {
    if (rawLink.startsWith('http://') || rawLink.startsWith('https://'))
        return true;
    if (rawLink.startsWith('file://'))
        return true;
    if (/[{$]/.test(rawLink))
        return true;
    return false;
}
/**
 * Resolve a link path to an absolute path
 */
function resolveLinkTarget(linkPath, fileDir) {
    if (linkPath.startsWith('/')) {
        return join(process.cwd(), linkPath);
    }
    return resolve(fileDir, linkPath);
}
/**
 * Process a single match and return a link object if valid
 */
function processLinkMatch(match, fileDir, lineNumber) {
    const rawLink = match[2];
    if (!rawLink)
        return null;
    if (shouldSkipRawLink(rawLink))
        return null;
    const linkPath = rawLink.split('#')[0];
    if (!linkPath)
        return null;
    return {
        link: rawLink,
        target: resolveLinkTarget(linkPath, fileDir),
        line: lineNumber,
    };
}
function extractLinks(content, filePath) {
    const links = [];
    const lines = content.split('\n');
    const fileDir = dirname(filePath);
    for (let i = 0; i < lines.length; i++) {
        const line = lines[i];
        if (!line)
            continue;
        const regex = new RegExp(LINK_PATTERN.source, LINK_PATTERN.flags);
        let match;
        match = regex.exec(line);
        while (match !== null) {
            const linkObj = processLinkMatch(match, fileDir, i + 1);
            if (linkObj) {
                links.push(linkObj);
            }
            match = regex.exec(line);
        }
    }
    return links;
}
function checkFile(filePath) {
    const broken = [];
    try {
        const content = readFileSync(filePath, 'utf-8');
        const links = extractLinks(content, filePath);
        for (const { link, target, line } of links) {
            if (!existsSync(target)) {
                broken.push({
                    file: filePath,
                    line,
                    link,
                    target,
                });
            }
        }
    }
    catch {
        // Skip unreadable files
    }
    return broken;
}
/**
 * Get files to check based on args or glob
 */
function getFilesToCheck(args) {
    if (args.length > 0) {
        return Promise.resolve(args.map((f) => resolve(process.cwd(), f)));
    }
    return glob(['docs/**/*.md', 'CLAUDE.md', '.agent/rules/agent-guide.md', 'README.md', '.claude/**/*.md'], {
        cwd: process.cwd(),
        ignore: ['**/node_modules/**', '.claude/worktrees/**', '.tmp/**'],
        absolute: true,
    });
}
/**
 * Group broken links by file
 */
function groupBrokenLinksByFile(allBroken) {
    const byFile = new Map();
    for (const broken of allBroken) {
        const relPath = broken.file.replace(`${process.cwd()}/`, '');
        const existing = byFile.get(relPath) || [];
        existing.push(broken);
        byFile.set(relPath, existing);
    }
    return byFile;
}
/**
 * Print broken links report
 */
function printBrokenLinksReport(byFile) {
    for (const [file, links] of byFile) {
        console.log(`  ${file}:`);
        for (const { line, link } of links) {
            console.log(`    L${line}: ${link}`);
        }
        console.log();
    }
}
async function main() {
    const args = process.argv.slice(2);
    const files = await getFilesToCheck(args);
    let allBroken = [];
    for (const file of files) {
        if (!existsSync(file))
            continue;
        allBroken = allBroken.concat(checkFile(file));
    }
    if (!allBroken.length) {
        if (!args.length) {
            console.log(`✓ No broken internal links (checked ${files.length} files)`);
        }
        process.exit(0);
    }
    console.log(`\n❌ Found ${allBroken.length} broken internal link(s):\n`);
    printBrokenLinksReport(groupBrokenLinksByFile(allBroken));
    process.exit(1);
}
if (import.meta.main) {
    main().catch((error) => {
        console.error('Error checking internal links:', error);
        process.exit(1);
    });
}
