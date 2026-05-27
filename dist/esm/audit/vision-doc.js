/**
 * `wp audit vision` — enforce VISION.md structure, length, and freshness.
 *
 * Every repo that runs `wp setup` should have a concise VISION.md at root that
 * defines the project's purpose and boundaries. This audit gates structure
 * (frontmatter + required H2 sections), length (lines + words), and warns on
 * staleness. Composes into `wp audit quality` so it runs in consumers' CI by
 * default.
 *
 * The companion scaffolder (`wp setup --with vision`) drops a starter file
 * from `catalog/vision/VISION.md.tmpl`.
 */
import { existsSync, readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { parseFrontmatter, } from './repo-guardrails.js';
const DEFAULT_REQUIRED_SECTIONS = [
    { label: 'Problem', synonyms: ['the problem', 'problem'] },
    { label: 'North star', synonyms: ['north star', 'vision', 'goal'] },
    {
        label: 'Boundaries',
        synonyms: ['boundaries', 'out of scope', 'non-goals', 'non goals', 'scope', 'in scope'],
    },
    { label: 'Principles', synonyms: ['design principles', 'principles'] },
];
const DEFAULT_MAX_LINES = 100;
const DEFAULT_MAX_WORDS = 1500;
const DEFAULT_STALE_AFTER_DAYS = 365;
const ISO_DATE = /^\d{4}-\d{2}-\d{2}$/;
export function auditVision(rootDirectory = process.cwd(), options = {}) {
    const root = resolve(rootDirectory);
    const relativeName = options.visionPath ?? 'VISION.md';
    const visionPath = resolve(root, relativeName);
    const violations = [];
    if (!existsSync(visionPath)) {
        return {
            ok: false,
            title: 'VISION.md',
            checked: 0,
            violations: [
                {
                    file: relativeName,
                    message: `${relativeName} is required at repo root — run \`wp setup --with vision\` to scaffold one.`,
                },
            ],
        };
    }
    const content = readFileSync(visionPath, 'utf8');
    const frontmatter = parseFrontmatter(content);
    const body = stripFrontmatter(content);
    const type = frontmatter.type;
    if (type !== 'vision') {
        violations.push({
            file: relativeName,
            message: type
                ? `Frontmatter type must be 'vision' (got ${JSON.stringify(type)})`
                : `Missing required frontmatter field: type (must be 'vision')`,
        });
    }
    const lastUpdated = frontmatter.last_updated;
    if (!lastUpdated) {
        violations.push({
            file: relativeName,
            message: `Missing required frontmatter field: last_updated (YYYY-MM-DD)`,
        });
    }
    else if (!ISO_DATE.test(lastUpdated) || Number.isNaN(Date.parse(lastUpdated))) {
        violations.push({
            file: relativeName,
            message: `last_updated must be a YYYY-MM-DD date (got ${JSON.stringify(lastUpdated)})`,
        });
    }
    else {
        const staleAfter = options.staleAfterDays ?? DEFAULT_STALE_AFTER_DAYS;
        if (staleAfter > 0) {
            const ageDays = Math.floor((Date.now() - Date.parse(lastUpdated)) / 86_400_000);
            if (ageDays > staleAfter) {
                console.warn(`[vision-warn] ${relativeName}: last_updated is ${ageDays} days old (>${staleAfter}). Consider refreshing.`);
            }
        }
    }
    const maxLines = options.maxLines ?? DEFAULT_MAX_LINES;
    const maxWords = options.maxWords ?? DEFAULT_MAX_WORDS;
    const bodyLines = body.split(/\r?\n/).length;
    const bodyWords = body.split(/\s+/).filter((word) => word.length > 0).length;
    if (bodyLines > maxLines) {
        violations.push({
            file: relativeName,
            message: `Body is ${bodyLines} lines; cap is ${maxLines}. VISION.md must stay concise.`,
        });
    }
    if (bodyWords > maxWords) {
        violations.push({
            file: relativeName,
            message: `Body is ${bodyWords} words; cap is ${maxWords}. VISION.md must stay concise.`,
        });
    }
    const firstHeading = /^#\s+(.+)$/m.exec(body);
    if (!firstHeading) {
        violations.push({
            file: relativeName,
            message: `Missing H1 (e.g. '# <name> Vision')`,
        });
    }
    else if (!/vision/i.test(firstHeading[1] ?? '')) {
        violations.push({
            file: relativeName,
            message: `H1 must contain 'Vision' (got ${JSON.stringify(firstHeading[1])})`,
        });
    }
    const requiredSections = options.requiredSections ?? DEFAULT_REQUIRED_SECTIONS;
    const presentH2s = new Set([...body.matchAll(/^##\s+(.+?)\s*$/gm)].map((match) => (match[1] ?? '').trim().toLowerCase()));
    for (const section of requiredSections) {
        const matched = section.synonyms.some((synonym) => presentH2s.has(synonym.toLowerCase()));
        if (!matched) {
            violations.push({
                file: relativeName,
                message: `Missing required section: '## ${section.label}' (or one of: ${section.synonyms.join(', ')})`,
            });
        }
    }
    return {
        ok: violations.length === 0,
        title: 'VISION.md',
        checked: 1,
        violations,
    };
}
function stripFrontmatter(markdown) {
    if (!markdown.startsWith('---'))
        return markdown;
    const end = markdown.indexOf('\n---', 3);
    if (end === -1)
        return markdown;
    return markdown.slice(end + 4).replace(/^\s*\n/, '');
}
//# sourceMappingURL=vision-doc.js.map