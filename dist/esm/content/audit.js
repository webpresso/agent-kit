/**
 * Shared audit runner for consumer-rule + consumer-skill content.
 *
 * Single entry point parameterized by `kind`. Performs:
 *   1. Frontmatter schema validation (rule or skill schema by kind).
 *   2. Filename / dir name vs. frontmatter slug consistency.
 *   3. Duplicate slug detection within consumer-source records.
 *   4. Catalog ↔ consumer slug collisions (hard fail per locked decision #3).
 *   5. `related` ref resolution against the union of canonical + consumer
 *      slugs across both kinds.
 *   6. `last_reviewed` staleness (>= staleReviewDays) → warning.
 *
 * Wave 0 left `record.parsedFrontmatter` as `unknown`; this audit is the first
 * caller to wire the schemas to the loader output.
 */
import { basename, dirname } from 'node:path';
import { z } from 'zod';
import { loadContent } from './loader.js';
import { ruleFrontmatterSchema, skillFrontmatterSchema, } from './schema.js';
const DEFAULT_STALE_DAYS = 180;
const MS_PER_DAY = 24 * 60 * 60 * 1000;
function schemaFor(kind) {
    return (kind === 'rule' ? ruleFrontmatterSchema : skillFrontmatterSchema);
}
function diskSlug(record) {
    if (record.kind === 'rule') {
        return basename(record.filePath).replace(/\.md$/, '');
    }
    // skill: SKILL.md sits inside <slug>/ — use the parent dir name
    return basename(dirname(record.filePath));
}
export function auditContent(options) {
    const { catalogDir, consumerRoot, kind, staleReviewDays = DEFAULT_STALE_DAYS } = options;
    // Always load both kinds so `related` cross-kind refs resolve. We filter
    // findings to the requested kind below.
    const { records, collisions } = loadContent({ catalogDir, consumerRoot });
    const findings = [];
    // Build the universe of known slugs across both kinds + sources for `related`.
    const knownSlugs = new Set();
    for (const r of records)
        knownSlugs.add(r.slug);
    const schema = schemaFor(kind);
    const recordsOfKind = records.filter((r) => r.kind === kind);
    // Track parsed frontmatter for each record we successfully validate.
    const parsedByRecord = new Map();
    for (const record of recordsOfKind) {
        const parseResult = schema.safeParse(record.rawFrontmatter);
        if (!parseResult.success) {
            for (const issue of parseResult.error.issues) {
                const fieldPath = issue.path.length > 0 ? ` (${issue.path.join('.')})` : '';
                findings.push({
                    severity: 'error',
                    kind: record.kind,
                    slug: record.slug,
                    filePath: record.filePath,
                    message: `Schema validation failed${fieldPath}: ${issue.message}`,
                });
            }
            continue;
        }
        parsedByRecord.set(record, parseResult.data);
    }
    // Check 2: filename / dir vs. frontmatter slug.
    for (const [record, fm] of parsedByRecord) {
        const onDisk = diskSlug(record);
        if (fm.slug !== onDisk) {
            const what = record.kind === 'rule' ? 'filename stem' : 'directory name';
            findings.push({
                severity: 'error',
                kind: record.kind,
                slug: record.slug,
                filePath: record.filePath,
                message: `Frontmatter slug "${fm.slug}" does not match ${what} "${onDisk}"`,
            });
        }
    }
    // Check 3: duplicate consumer-source slug within the audited kind. Dedup on
    // the union of disk slug and parsed frontmatter slug — either flavor of
    // collision is a problem.
    const consumerByEffectiveSlug = new Map();
    for (const record of recordsOfKind) {
        if (record.source !== 'consumer')
            continue;
        const fm = parsedByRecord.get(record);
        const effective = fm?.slug ?? record.slug;
        const list = consumerByEffectiveSlug.get(effective) ?? [];
        list.push(record);
        consumerByEffectiveSlug.set(effective, list);
    }
    for (const [slug, dupes] of consumerByEffectiveSlug) {
        if (dupes.length < 2)
            continue;
        for (const dup of dupes) {
            findings.push({
                severity: 'error',
                kind,
                slug,
                filePath: dup.filePath,
                message: `Duplicate consumer slug "${slug}" — also defined in ${dupes
                    .filter((d) => d !== dup)
                    .map((d) => d.filePath)
                    .join(', ')}`,
            });
        }
    }
    // Check 4: catalog collisions (loader-supplied), filtered to this kind.
    for (const collision of collisions) {
        if (collision.kind !== kind)
            continue;
        findings.push({
            severity: 'error',
            kind: collision.kind,
            slug: collision.slug,
            filePath: collision.consumer,
            message: `Catalog collision: consumer slug "${collision.slug}" shadows canonical at ` +
                `${collision.canonical}. Rename the consumer entry.`,
        });
    }
    // Check 5: broken `related` refs.
    for (const [record, fm] of parsedByRecord) {
        for (const ref of fm.related ?? []) {
            if (knownSlugs.has(ref))
                continue;
            findings.push({
                severity: 'error',
                kind: record.kind,
                slug: record.slug,
                filePath: record.filePath,
                message: `Broken \`related\` ref: "${ref}" does not resolve to any known rule or skill`,
            });
        }
    }
    // Check 6: stale last_reviewed (warning).
    const todayStr = new Date().toISOString().slice(0, 10);
    const todayMs = Date.parse(`${todayStr}T00:00:00Z`);
    for (const [record, fm] of parsedByRecord) {
        const reviewedMs = Date.parse(`${fm.last_reviewed}T00:00:00Z`);
        if (Number.isNaN(reviewedMs))
            continue;
        const ageDays = (todayMs - reviewedMs) / MS_PER_DAY;
        if (ageDays >= staleReviewDays) {
            findings.push({
                severity: 'warning',
                kind: record.kind,
                slug: record.slug,
                filePath: record.filePath,
                message: `last_reviewed ${fm.last_reviewed} is ${Math.floor(ageDays)} days old ` +
                    `(threshold: ${staleReviewDays})`,
            });
        }
    }
    const passed = !findings.some((f) => f.severity === 'error');
    return { findings, passed };
}
//# sourceMappingURL=audit.js.map