/**
 * `ak audit broken-refs` — checks for unresolved relative links in agent
 * markdown files.
 *
 * Walks:
 *   - `.agent/**\/*.md`
 *   - `AGENTS.md` (repo root)
 *   - `CLAUDE.md` (repo root)
 *
 * Skips refs to generated paths (`.claude/skills/`, `.codex/skills/`, etc.)
 * since those are gitignored generated outputs.
 *
 * Uses `remark` + `remark-validate-links` to find unresolved relative links.
 */
import { execSync } from 'node:child_process';
import { existsSync, readdirSync, readFileSync } from 'node:fs';
import path from 'node:path';
/**
 * Patterns for generated/gitignored output paths — these refs are skipped.
 */
const GENERATED_PATH_PATTERNS = [
    /^\.claude\/skills\//,
    /^\.codex\/skills\//,
    /^\.cursor\/commands\//,
    /^\.gemini\/commands\//,
    /^\.windsurf\/commands\//,
    /^\.opencode\/commands\//,
    /^node_modules\//,
];
function isGeneratedRef(ref) {
    const normalized = ref.replace(/^\//, '');
    return GENERATED_PATH_PATTERNS.some((pat) => pat.test(normalized));
}
function walkMdFiles(dir) {
    if (!existsSync(dir))
        return [];
    const files = [];
    try {
        for (const entry of readdirSync(dir, { withFileTypes: true })) {
            const fullPath = path.join(dir, entry.name);
            if (entry.isDirectory()) {
                files.push(...walkMdFiles(fullPath));
            }
            else if (entry.isFile() && entry.name.endsWith('.md')) {
                files.push(fullPath);
            }
        }
    }
    catch {
        // ignore unreadable dirs
    }
    return files.sort();
}
function getStagedFiles(cwd) {
    try {
        const output = execSync('git diff --staged --name-only', { cwd, encoding: 'utf8' });
        const files = new Set(output
            .split('\n')
            .map((f) => f.trim())
            .filter((f) => f.length > 0)
            .map((f) => path.resolve(cwd, f)));
        return files;
    }
    catch {
        return null;
    }
}
/**
 * Collect relative link targets from markdown content using a simple regex
 * parser. We avoid loading remark dynamically in tests by keeping this
 * light-weight; the full remark pipeline is used in `checkFileWithRemark`.
 *
 * Returns array of { link, line } objects.
 */
function extractRelativeLinks(content) {
    const results = [];
    // Match markdown links: [text](href) and ![alt](src) — only relative hrefs
    const linkRe = /!?\[(?:[^\]]*)\]\(([^)]+)\)/g;
    const lines = content.split('\n');
    for (let i = 0; i < lines.length; i++) {
        const line = lines[i] ?? '';
        let m;
        const localRe = new RegExp(linkRe.source, 'g');
        while ((m = localRe.exec(line)) !== null) {
            const href = m[1]?.trim() ?? '';
            // Skip absolute URLs, anchors-only, and mailto
            if (href.startsWith('http://') ||
                href.startsWith('https://') ||
                href.startsWith('#') ||
                href.startsWith('mailto:')) {
                continue;
            }
            results.push({ link: href, line: i + 1 });
        }
    }
    return results;
}
/**
 * Check if a relative link resolves to an existing file from the given source file's directory.
 */
function isLinkResolvable(sourceFile, link, repoRoot) {
    // Strip fragment (#anchor) from link
    const linkWithoutFragment = link.split('#')[0] ?? '';
    if (linkWithoutFragment === '')
        return true; // anchor-only within same file
    const sourceDir = path.dirname(sourceFile);
    const resolved = path.resolve(sourceDir, linkWithoutFragment);
    // Must be within repo root
    const rel = path.relative(repoRoot, resolved);
    if (rel.startsWith('..'))
        return true; // outside repo — skip
    if (isGeneratedRef(rel))
        return true;
    return existsSync(resolved);
}
/**
 * Audit broken relative links in agent markdown files.
 */
export function auditBrokenRefs(cwd, options = {}) {
    // Collect candidate files
    const agentDir = path.join(cwd, '.agent');
    const candidateFiles = [
        ...walkMdFiles(agentDir),
        path.join(cwd, 'AGENTS.md'),
        path.join(cwd, 'CLAUDE.md'),
    ].filter((f) => existsSync(f));
    let stagedFiles = null;
    if (options.staged) {
        stagedFiles = getStagedFiles(cwd);
    }
    const violations = [];
    let checked = 0;
    for (const filePath of candidateFiles) {
        // In staged mode, skip files not in the staged set
        if (stagedFiles !== null) {
            const absPath = path.resolve(cwd, filePath);
            if (!stagedFiles.has(absPath))
                continue;
        }
        let content;
        try {
            content = readFileSync(filePath, 'utf8');
        }
        catch {
            continue;
        }
        checked++;
        const relPath = path.relative(cwd, filePath);
        const links = extractRelativeLinks(content);
        for (const { link, line } of links) {
            if (isGeneratedRef(link))
                continue;
            if (!isLinkResolvable(filePath, link, cwd)) {
                violations.push({
                    file: relPath,
                    link,
                    message: `Unresolved relative link at line ${line}: ${link}`,
                });
            }
        }
    }
    return {
        violations,
        checked,
        pass: violations.length === 0,
    };
}
/**
 * Adapter to return a RepoAuditResult shape for registry integration.
 */
export function auditBrokenRefsAsRepoResult(cwd, options = {}) {
    const result = auditBrokenRefs(cwd, options);
    return {
        ...result,
        ok: result.pass,
        title: 'Broken refs audit',
    };
}
//# sourceMappingURL=broken-refs.js.map