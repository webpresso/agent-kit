/**
 * Generic content loader for canonical (catalog) + consumer
 * (`agent-rules/`, `agent-skills/`) trees.
 *
 * Returns a deterministically-sorted, source-tagged list of frontmatter
 * records. Slug collisions between canonical and consumer are surfaced as a
 * separate `collisions` array — the caller decides how to merge or pick a
 * winner.
 *
 * NOTE: `parsedFrontmatter` is intentionally typed as `unknown` here. The
 * real schema lives in `src/content/schema.ts` (Task 1.2, runs in parallel).
 * Once that lands, Task 2.x will swap the stub `RawFrontmatter` type below
 * for the schema-validated record. Until then, the loader returns the raw
 * gray-matter object in both `rawFrontmatter` and `parsedFrontmatter` so the
 * shape stays stable for downstream callers writing tests against it.
 */
import { existsSync, readFileSync, readdirSync, realpathSync, statSync } from "node:fs";
import { join, relative } from "node:path";
import matter from "gray-matter";
const DEFAULT_KINDS = ["rule", "skill"];
const CONSUMER_DIR_BY_KIND = {
    rule: "agent-rules",
    skill: "agent-skills",
};
const CATALOG_DIR_BY_KIND = {
    rule: "rules",
    skill: "skills",
};
export function loadContent(options) {
    const { catalogDir, consumerRoot, kinds = DEFAULT_KINDS } = options;
    if (!existsSync(catalogDir)) {
        throw new Error(`loadContent: catalogDir does not exist: ${catalogDir}. ` +
            `Catalog dir is required (this is a misconfiguration, not a graceful path).`);
    }
    // Absorb pnpm `.pnpm/<version>/` instability — pin to the realpath once.
    const resolvedCatalog = realpathSync(catalogDir);
    const resolvedConsumer = consumerRoot !== undefined && existsSync(consumerRoot) ? realpathSync(consumerRoot) : undefined;
    const records = [];
    const collisions = [];
    for (const kind of kinds) {
        const canonicalRecords = readKind({
            kind,
            root: join(resolvedCatalog, CATALOG_DIR_BY_KIND[kind]),
            source: "canonical",
        });
        const consumerRecords = resolvedConsumer !== undefined
            ? readKind({
                kind,
                root: join(resolvedConsumer, CONSUMER_DIR_BY_KIND[kind]),
                source: "consumer",
            })
            : [];
        const canonicalBySlug = new Map(canonicalRecords.map((r) => [r.slug, r]));
        for (const consumerRec of consumerRecords) {
            const canonicalRec = canonicalBySlug.get(consumerRec.slug);
            if (canonicalRec !== undefined) {
                collisions.push({
                    slug: consumerRec.slug,
                    kind,
                    canonical: canonicalRec.filePath,
                    consumer: consumerRec.filePath,
                });
            }
        }
        records.push(...canonicalRecords, ...consumerRecords);
    }
    records.sort((a, b) => {
        if (a.kind !== b.kind)
            return a.kind < b.kind ? -1 : 1;
        if (a.slug !== b.slug)
            return a.slug < b.slug ? -1 : 1;
        // Stable secondary key: canonical before consumer for same slug.
        if (a.source !== b.source)
            return a.source === "canonical" ? -1 : 1;
        return 0;
    });
    return { records, collisions };
}
function readKind(args) {
    const { kind, root, source } = args;
    if (!existsSync(root))
        return [];
    const stat = statSync(root);
    if (!stat.isDirectory())
        return [];
    return kind === "rule" ? readRules(root, source) : readSkills(root, source);
}
function readRules(root, source) {
    const out = [];
    for (const entry of readdirSync(root, { withFileTypes: true })) {
        if (!entry.isFile())
            continue;
        if (!entry.name.endsWith(".md"))
            continue;
        // Skip directory-documentation files. README.md exists in both the
        // canonical catalog and the consumer-owned agent-rules/ scaffolder
        // surface; treating it as a rule would produce a spurious slug
        // collision and would also try to project it into per-IDE surfaces.
        if (entry.name === "README.md")
            continue;
        const filePath = realpathSync(join(root, entry.name));
        const slug = entry.name.replace(/\.md$/, "");
        const parsed = matter(readFileSync(filePath, "utf8"));
        const raw = { ...parsed.data };
        out.push({
            kind: "rule",
            slug,
            source,
            filePath,
            rawFrontmatter: raw,
            parsedFrontmatter: raw,
            body: parsed.content.trimStart(),
            assetPaths: [],
        });
    }
    return out;
}
function readSkills(root, source) {
    const out = [];
    for (const entry of readdirSync(root, { withFileTypes: true })) {
        if (!entry.isDirectory())
            continue;
        const skillDir = join(root, entry.name);
        const skillFile = join(skillDir, "SKILL.md");
        if (!existsSync(skillFile))
            continue;
        const filePath = realpathSync(skillFile);
        const parsed = matter(readFileSync(filePath, "utf8"));
        const raw = { ...parsed.data };
        const assetPaths = collectSkillAssets(skillDir);
        out.push({
            kind: "skill",
            slug: entry.name,
            source,
            filePath,
            rawFrontmatter: raw,
            parsedFrontmatter: raw,
            body: parsed.content.trimStart(),
            assetPaths,
        });
    }
    return out;
}
function collectSkillAssets(skillDir) {
    const resolvedDir = realpathSync(skillDir);
    const assets = [];
    walk(resolvedDir, (absPath) => {
        if (absPath === join(resolvedDir, "SKILL.md"))
            return;
        assets.push(relative(resolvedDir, absPath));
    });
    assets.sort();
    return assets;
}
function walk(dir, visit) {
    for (const entry of readdirSync(dir, { withFileTypes: true })) {
        const abs = join(dir, entry.name);
        if (entry.isDirectory()) {
            walk(abs, visit);
        }
        else if (entry.isFile()) {
            visit(abs);
        }
    }
}
//# sourceMappingURL=loader.js.map