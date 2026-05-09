/**
 * Tech-debt subcommand dispatch.
 *
 * Handles: new, list, review
 *
 * Note: list and review use direct file scanning (not TechDebtService) because
 * the service uses README.md file pattern for subdirectory-based layout, while
 * the h-NNN-*.md flat file layout is what we write via `ak tech-debt new`.
 */
import { existsSync, readdirSync, readFileSync } from 'node:fs';
import { mkdir, writeFile } from 'node:fs/promises';
import path from 'node:path';
import matter from 'gray-matter';
import { resolveTechDebtRoot } from '#utils/tech-debt-root';
import { categorySchema, reviewCadenceSchema, severitySchema, techDebtFrontmatterSchema, techDebtStatusSchema, } from '#tech-debt/index';
const STATUS_DIRS = ['accepted', 'needs-remediation', 'monitoring', 'resolved'];
/**
 * Convert a title to kebab-case for file naming.
 */
function toKebab(title) {
    return title
        .toLowerCase()
        .replace(/[^a-z0-9]+/g, '-')
        .replace(/^-|-$/g, '');
}
/**
 * Find the next available h-NNN number across all status subdirectories.
 */
function nextHazardNumber(techDebtRoot) {
    if (!existsSync(techDebtRoot))
        return 1;
    let maxN = 0;
    for (const statusDir of STATUS_DIRS) {
        const dir = path.join(techDebtRoot, statusDir);
        if (!existsSync(dir))
            continue;
        try {
            for (const file of readdirSync(dir)) {
                const match = /^h-(\d+)-/.exec(file);
                if (match?.[1]) {
                    const n = parseInt(match[1], 10);
                    if (n > maxN)
                        maxN = n;
                }
            }
        }
        catch {
            // ignore unreadable dirs
        }
    }
    return maxN + 1;
}
/**
 * Format a hazard number as zero-padded 3-digit string.
 */
function formatHazardNumber(n) {
    return String(n).padStart(3, '0');
}
/**
 * Generate the markdown content for a new tech-debt file.
 */
function generateTechDebtContent(title, options) {
    const today = new Date().toISOString().slice(0, 10);
    return [
        '---',
        'type: tech-debt',
        `status: ${options.status}`,
        `severity: ${options.severity}`,
        `category: ${options.category}`,
        `review_cadence: ${options.reviewCadence}`,
        `last_reviewed: '${today}'`,
        `created: '${today}'`,
        'linked_blueprints: []',
        'affected_modules: []',
        '---',
        '',
        `# ${title}`,
        '',
        '<!-- Describe the technical debt, its impact, and remediation approach. -->',
        '',
    ].join('\n');
}
/**
 * Extract the title from the markdown body (first H1).
 */
function extractTitle(markdownBody, fallback) {
    const match = /^#\s+(.+)$/m.exec(markdownBody);
    return match?.[1]?.trim() ?? fallback;
}
/**
 * Scan all tech-debt .md files from the status subdirectories.
 */
function scanTechDebtItems(techDebtRoot) {
    const items = [];
    if (!existsSync(techDebtRoot))
        return items;
    for (const statusDir of STATUS_DIRS) {
        const dir = path.join(techDebtRoot, statusDir);
        if (!existsSync(dir))
            continue;
        let entries;
        try {
            entries = readdirSync(dir).filter((f) => f.endsWith('.md'));
        }
        catch {
            continue;
        }
        for (const filename of entries.sort()) {
            const filePath = path.join(dir, filename);
            const slug = `${statusDir}/${filename.replace(/\.md$/, '')}`;
            try {
                const raw = readFileSync(filePath, 'utf8');
                const parsed = matter(raw);
                const result = techDebtFrontmatterSchema.safeParse(parsed.data);
                if (!result.success) {
                    const firstError = result.error.issues[0];
                    items.push({
                        slug,
                        title: parsed.data?.['title'] || filename,
                        status: parsed.data?.['status'] || statusDir,
                        severity: parsed.data?.['severity'] || 'unknown',
                        category: parsed.data?.['category'],
                        filePath,
                        malformed: firstError
                            ? `${firstError.path.join('.')}: ${firstError.message}`
                            : 'Invalid frontmatter',
                    });
                    continue;
                }
                items.push({
                    slug,
                    title: extractTitle(parsed.content, filename),
                    status: result.data.status,
                    severity: result.data.severity,
                    category: result.data.category,
                    nextReview: result.data.nextReview,
                    filePath,
                });
            }
            catch (err) {
                items.push({
                    slug,
                    title: filename,
                    status: statusDir,
                    severity: 'unknown',
                    filePath,
                    malformed: err instanceof Error ? err.message : String(err),
                });
            }
        }
    }
    return items;
}
async function handleNew(title, options) {
    const cwd = options.cwd ?? process.cwd();
    const techDebtRoot = resolveTechDebtRoot(cwd);
    // Validate inputs
    const severityResult = severitySchema.safeParse(options.severity ?? 'medium');
    if (!severityResult.success) {
        throw new Error(`Invalid severity: ${options.severity}. Must be one of: critical, high, medium, low`);
    }
    const categoryResult = categorySchema.safeParse(options.category ?? 'complexity');
    if (!categoryResult.success) {
        throw new Error(`Invalid category: ${options.category}. Must be one of: complexity, testing, mutation, duplication, dependency, security, documentation`);
    }
    const cadenceResult = reviewCadenceSchema.safeParse(options.reviewCadence ?? 'quarterly');
    if (!cadenceResult.success) {
        throw new Error(`Invalid review-cadence: ${options.reviewCadence}. Must be one of: weekly, biweekly, monthly, quarterly`);
    }
    const statusResult = techDebtStatusSchema.safeParse(options.status ?? 'accepted');
    if (!statusResult.success) {
        throw new Error(`Invalid status: ${options.status}. Must be one of: accepted, needs-remediation, monitoring, resolved`);
    }
    const severity = severityResult.data;
    const category = categoryResult.data;
    const reviewCadence = cadenceResult.data;
    const status = statusResult.data;
    // Extra validation: critical must have weekly cadence
    if (severity === 'critical' && reviewCadence !== 'weekly') {
        throw new Error('Critical severity technical debt must have weekly review cadence');
    }
    const kebabTitle = toKebab(title);
    const n = nextHazardNumber(techDebtRoot);
    const filename = `h-${formatHazardNumber(n)}-${kebabTitle}.md`;
    const statusDir = path.join(techDebtRoot, status);
    const filePath = path.join(statusDir, filename);
    if (options.dryRun) {
        console.log(`Would create: ${filePath}`);
        return;
    }
    await mkdir(statusDir, { recursive: true });
    const content = generateTechDebtContent(title, { status, severity, category, reviewCadence });
    await writeFile(filePath, content, { flag: 'wx' }); // O_EXCL: fail if exists
    console.log(`Created: ${filePath}`);
}
async function handleList(options) {
    const cwd = options.cwd ?? process.cwd();
    const techDebtRoot = resolveTechDebtRoot(cwd);
    let items = scanTechDebtItems(techDebtRoot);
    if (options.status) {
        items = items.filter((item) => item.status === options.status);
    }
    if (options.severity) {
        items = items.filter((item) => item.severity === options.severity);
    }
    if (options.category) {
        items = items.filter((item) => item.category === options.category);
    }
    if (items.length === 0) {
        console.log(`No tech-debt items found (root: ${techDebtRoot})`);
        return;
    }
    console.log(`Tech-debt items (${items.length}):`);
    for (const item of items) {
        const overdue = item.nextReview && new Date(item.nextReview) < new Date() ? ' [OVERDUE]' : '';
        const malformed = item.malformed ? ` [MALFORMED: ${item.malformed}]` : '';
        console.log(`  ${item.slug} [${item.status}] [${item.severity}]${overdue}${malformed}`);
        console.log(`    ${item.title}`);
    }
}
async function handleReview(options) {
    const cwd = options.cwd ?? process.cwd();
    const techDebtRoot = resolveTechDebtRoot(cwd);
    const items = scanTechDebtItems(techDebtRoot);
    const now = new Date();
    const overdueItems = items.filter((item) => item.nextReview && new Date(item.nextReview) < now && !item.malformed);
    if (overdueItems.length === 0) {
        console.log(`No overdue tech-debt reviews (root: ${techDebtRoot})`);
        return;
    }
    console.log(`Overdue tech-debt reviews (${overdueItems.length}):`);
    for (const item of overdueItems) {
        console.log(`  ${item.slug} [${item.status}] [${item.severity}] next review: ${item.nextReview ?? 'unknown'}`);
        console.log(`    ${item.title}`);
    }
    throw Object.assign(new Error(`${overdueItems.length} overdue tech-debt item(s) require review`), { exitCode: 1 });
}
export async function executeTechDebtSubcommand(subcommand, args, options) {
    switch (subcommand) {
        case 'new': {
            const title = args[0] ?? '';
            if (!title) {
                throw new Error('Usage: ak tech-debt new "<title>" --severity <s> --category <c>');
            }
            await handleNew(title, options);
            return;
        }
        case 'list': {
            await handleList(options);
            return;
        }
        case 'review': {
            await handleReview(options);
            return;
        }
        default: {
            throw new Error(`Unknown tech-debt subcommand: ${subcommand}\n\nUse one of: new, list, review`);
        }
    }
}
//# sourceMappingURL=router-dispatch.js.map