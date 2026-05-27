import matter from 'gray-matter';
import { existsSync, readFileSync, readdirSync } from 'node:fs';
import { join, relative, resolve, sep } from 'node:path';
const BLUEPRINT_STATUSES = [
    'draft',
    'planned',
    'in-progress',
    'parked',
    'completed',
    'archived',
];
const BLUEPRINT_STATUS_PATTERN = BLUEPRINT_STATUSES.join('|');
const ACTIVE_BLUEPRINT_STATUSES = new Set(['draft', 'planned', 'in-progress', 'parked']);
const LOCAL_BLUEPRINT_REFERENCE_PATTERN = new RegExp(String.raw `^(?:blueprints/)?(?:${BLUEPRINT_STATUS_PATTERN})/[A-Za-z0-9._-]+(?:/_overview\.md)?$`);
const GITHUB_URL_PATTERN = /https?:\/\/github\.com\//i;
const ABSOLUTE_FILE_REFERENCE_PATTERN = /(?:^|[\s(])(?:\/|[A-Za-z]:[\\/]|file:\/\/)/i;
const LEGACY_CROSS_REPO_LABEL_PATTERN = /cross-repo:/i;
export function auditRoadmapLinks(rootDirectory = process.cwd(), options = {}) {
    const root = resolve(rootDirectory);
    const blueprintsRoot = resolve(root, options.blueprintsRoot ?? 'blueprints');
    const records = readBlueprintRecords(root, blueprintsRoot);
    const violations = [];
    const byKey = indexBlueprints(records);
    const roadmaps = records.filter((record) => record.type === 'parent-roadmap');
    const localChildrenByRoadmap = new Map();
    for (const child of records.filter((record) => record.type !== 'parent-roadmap' && record.parentRoadmap)) {
        const isCrossRepoParentReference = !isLocalParentRoadmapReference(child.parentRoadmap ?? '');
        if (ACTIVE_BLUEPRINT_STATUSES.has(child.status) && isCrossRepoParentReference) {
            violations.push({
                file: child.file,
                message: 'Active blueprint parent_roadmap must reference a local roadmap slug/path; use cross_repo_depends_on plus GitHub links for cross-repo relationships',
            });
            continue;
        }
        const parent = resolveParentRoadmap(child.parentRoadmap ?? '', byKey);
        if (!parent) {
            if (options.failOrphans === true && !isCrossRepoParentReference) {
                violations.push({
                    file: child.file,
                    message: `Blueprint declares parent_roadmap ${JSON.stringify(child.parentRoadmap)} but no local parent-roadmap resolves to it`,
                });
            }
            continue;
        }
        const children = localChildrenByRoadmap.get(parent.key) ?? [];
        children.push(child);
        localChildrenByRoadmap.set(parent.key, children);
    }
    for (const roadmap of roadmaps) {
        const quickReference = extractExecutionWaveSection(roadmap.raw);
        const waveMapChildren = extractWaveMapChildren(quickReference);
        const localChildren = localChildrenByRoadmap.get(roadmap.key) ?? [];
        if (ACTIVE_BLUEPRINT_STATUSES.has(roadmap.status) &&
            containsCrossRepoWaveMapReference(quickReference)) {
            violations.push({
                file: roadmap.file,
                message: 'Parent-roadmap execution-wave maps may list local child blueprints only; move cross-repo references to Cross-Plan References and use GitHub links there',
            });
        }
        if (waveMapChildren.size === 0 && localChildren.length === 0) {
            violations.push({
                file: roadmap.file,
                message: 'Roadmap declares no children in its wave map',
            });
            continue;
        }
        for (const childRef of waveMapChildren) {
            const child = resolveBlueprintReference(childRef, byKey);
            if (!child) {
                violations.push({
                    file: roadmap.file,
                    message: `Roadmap wave map references missing child blueprint ${JSON.stringify(childRef)}`,
                });
                continue;
            }
            if (child.key === roadmap.key)
                continue;
            const claimedParent = child.parentRoadmap
                ? resolveParentRoadmap(child.parentRoadmap, byKey)
                : undefined;
            if (claimedParent?.key !== roadmap.key) {
                violations.push({
                    file: child.file,
                    message: `Child blueprint is listed in ${roadmap.slug} but parent_roadmap does not resolve back to that roadmap`,
                });
            }
        }
        for (const child of localChildren) {
            if (!waveMapChildren.has(child.key) &&
                !waveMapChildren.has(child.name) &&
                !waveMapChildren.has(child.slug)) {
                violations.push({
                    file: child.file,
                    message: `Child blueprint declares parent_roadmap ${roadmap.slug} but is not listed in the roadmap wave map`,
                });
            }
        }
    }
    return {
        ok: violations.length === 0,
        title: 'Roadmap links',
        checked: roadmaps.length,
        violations,
    };
}
function readBlueprintRecords(root, blueprintsRoot) {
    if (!existsSync(blueprintsRoot))
        return [];
    const records = [];
    for (const status of BLUEPRINT_STATUSES) {
        const statusRoot = join(blueprintsRoot, status);
        if (!existsSync(statusRoot))
            continue;
        for (const entry of readdirSync(statusRoot, { withFileTypes: true })) {
            if (!entry.isDirectory())
                continue;
            const overviewPath = join(statusRoot, entry.name, '_overview.md');
            if (!existsSync(overviewPath))
                continue;
            const raw = readFileSync(overviewPath, 'utf8');
            const data = matter(raw).data;
            const type = data.type === 'parent-roadmap' ? 'parent-roadmap' : 'blueprint';
            const parentRoadmap = typeof data.parent_roadmap === 'string' && data.parent_roadmap.trim()
                ? data.parent_roadmap.trim()
                : undefined;
            const key = `${status}/${entry.name}`;
            records.push({
                file: relativePath(root, overviewPath),
                key,
                name: entry.name,
                ...(parentRoadmap ? { parentRoadmap } : {}),
                raw,
                slug: key,
                status,
                type,
            });
        }
    }
    return records.toSorted((left, right) => left.slug.localeCompare(right.slug));
}
function indexBlueprints(records) {
    const byKey = new Map();
    for (const record of records) {
        byKey.set(record.key, record);
        byKey.set(record.slug, record);
        byKey.set(record.name, record);
        byKey.set(`blueprints/${record.key}`, record);
        byKey.set(`blueprints/${record.key}/_overview.md`, record);
        byKey.set(`${record.key}/_overview.md`, record);
    }
    return byKey;
}
function extractWaveMapChildren(markdown) {
    const refs = new Set();
    const pathPattern = new RegExp(String.raw `(?:blueprints/)?(${BLUEPRINT_STATUS_PATTERN})/([A-Za-z0-9._-]+)(?:/_overview\.md)?`, 'g');
    for (const match of markdown.matchAll(pathPattern)) {
        const status = match[1];
        const slug = match[2];
        if (!status || !slug)
            continue;
        refs.add(`${status}/${slug}`);
    }
    return refs;
}
function extractExecutionWaveSection(markdown) {
    const lines = markdown.split(/\r?\n/);
    const start = lines.findIndex((line) => /^## Quick Reference \(Execution Waves\)\s*$/.test(line));
    if (start === -1)
        return '';
    const body = [];
    for (let index = start + 1; index < lines.length; index += 1) {
        const line = lines[index] ?? '';
        if (/^##\s+/.test(line))
            break;
        body.push(line);
    }
    return body.join('\n');
}
function containsCrossRepoWaveMapReference(markdown) {
    return (GITHUB_URL_PATTERN.test(markdown) ||
        ABSOLUTE_FILE_REFERENCE_PATTERN.test(markdown) ||
        LEGACY_CROSS_REPO_LABEL_PATTERN.test(markdown));
}
function resolveBlueprintReference(reference, byKey) {
    const normalized = normalizeReference(reference);
    return byKey.get(normalized) ?? byKey.get(lastSegment(normalized));
}
function resolveParentRoadmap(parentRoadmap, byKey) {
    for (const candidate of parentRoadmapCandidates(parentRoadmap)) {
        const record = byKey.get(candidate);
        if (record?.type === 'parent-roadmap')
            return record;
    }
    return undefined;
}
function parentRoadmapCandidates(parentRoadmap) {
    const trimmed = normalizeReference(parentRoadmap);
    if (!trimmed)
        return [];
    const candidates = new Set([trimmed, lastSegment(trimmed)]);
    const tail = trimmed
        .split(/->|→/u)
        .map((part) => part.trim())
        .filter(Boolean)
        .at(-1);
    if (tail) {
        const normalizedTail = normalizeReference(tail);
        candidates.add(normalizedTail);
        candidates.add(lastSegment(normalizedTail));
    }
    return [...candidates];
}
function isLocalParentRoadmapReference(reference) {
    const normalized = normalizeReference(reference);
    if (!normalized || containsCrossRepoWaveMapReference(normalized))
        return false;
    return (LOCAL_BLUEPRINT_REFERENCE_PATTERN.test(normalized) ||
        /^[A-Za-z0-9._-]+$/.test(lastSegment(normalized)));
}
function normalizeReference(reference) {
    return reference
        .trim()
        .replace(/^['"]|['"]$/g, '')
        .replace(/\\/g, '/')
        .replace(/^\.?\//, '')
        .replace(/^blueprints\//, '')
        .replace(/\/_overview\.md$/, '');
}
function lastSegment(value) {
    return value.split('/').filter(Boolean).at(-1) ?? value;
}
function relativePath(root, file) {
    return relative(root, file).split(sep).join('/');
}
//# sourceMappingURL=roadmap-links.js.map