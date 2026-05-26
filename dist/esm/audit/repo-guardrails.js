import { existsSync, readFileSync, readdirSync, writeFileSync } from 'node:fs';
import { join, relative, resolve, sep } from 'node:path';
import matter from 'gray-matter';
import { validateLoreTrailers } from './commit-message-lore.js';
const DEFAULT_COMMIT_TYPES = [
    'feat',
    'fix',
    'docs',
    'style',
    'refactor',
    'perf',
    'test',
    'build',
    'ci',
    'chore',
    'revert',
];
const DEFAULT_DOC_TYPES = [
    'guide',
    'system',
    'research',
    'runbook',
    'postmortem',
    'adr',
    'migration',
    'template',
    'docs-index',
];
const DEFAULT_DOC_FOLDER_TYPES = {
    adrs: 'adr',
    decisions: 'adr',
    migrations: 'migration',
    research: 'research',
    runbooks: 'runbook',
    templates: 'template',
};
const DEFAULT_BLUEPRINT_STATUSES = [
    'draft',
    'planned',
    'in-progress',
    'parked',
    'completed',
    'archived',
];
const ACTIVE_BLUEPRINT_STATUSES = new Set(['draft', 'planned', 'in-progress', 'parked']);
const BLUEPRINT_REFERENCE_PATTERN = /^(?:blueprints\/)?(?:draft|planned|in-progress|parked|completed|archived)\/[A-Za-z0-9._-]+(?:\/_overview\.md)?$/;
const GITHUB_BLOB_URL_PATTERN = /^https?:\/\/github\.com\/[^/\s]+\/[^/\s]+\/blob\/[^/\s]+\/.+$/i;
const ABSOLUTE_FILE_REFERENCE_PATTERN = /^(?:\/|[A-Za-z]:[\\/]|file:\/\/)/i;
const LEGACY_CROSS_REPO_LABEL_PATTERN = /^cross-repo:/i;
const GITHUB_REPO_PATTERN = /^[^/\s]+\/[^/\s]+$/;
const BLUEPRINT_SLUG_PATTERN = /^[A-Za-z0-9._-]+$/;
export function auditCatalogDrift(rootDirectory = process.cwd(), options = {}) {
    const root = resolve(rootDirectory);
    const workspacePath = resolve(root, options.workspaceFile ?? 'pnpm-workspace.yaml');
    const violations = [];
    if (!existsSync(workspacePath)) {
        return result('Catalog drift — single package (no workspace file)', 0, []);
    }
    const workspaceYaml = readFileSync(workspacePath, 'utf8');
    const workspaceGlobs = parseWorkspacePackageGlobs(workspaceYaml);
    const catalogNames = parseCatalogDependencyNames(workspaceYaml);
    const packageFiles = discoverWorkspacePackageFiles(root, workspaceGlobs);
    const dependencyUses = new Map();
    for (const packageFile of packageFiles) {
        const pkg = readJsonObject(packageFile);
        // peerDependencies are compatibility constraints, not installed package
        // versions, so ranges such as ">=19" are legitimate and should not be
        // forced through a pnpm catalog.
        const sections = ['dependencies', 'devDependencies', 'optionalDependencies'];
        for (const section of sections) {
            const dependencies = readStringRecord(pkg[section]);
            for (const [dependencyName, version] of Object.entries(dependencies)) {
                const uses = dependencyUses.get(dependencyName) ?? [];
                uses.push({ packageFile, dependencyName, version });
                dependencyUses.set(dependencyName, uses);
            }
        }
    }
    for (const [dependencyName, uses] of [...dependencyUses.entries()].toSorted(([left], [right]) => left.localeCompare(right))) {
        if (uses.length < 2)
            continue;
        for (const use of uses) {
            if (isSharedDependencyReference(use.version))
                continue;
            const catalogHint = catalogNames.has(dependencyName)
                ? 'use catalog:'
                : 'promote it to the pnpm catalog or use workspace:';
            violations.push({
                file: relativePath(root, use.packageFile),
                message: `${dependencyName} is used in ${uses.length} workspaces but declares ${JSON.stringify(use.version)}; ${catalogHint}`,
            });
        }
    }
    return result('Catalog drift', packageFiles.length, violations);
}
export function validateCommitMessage(message, options = {}) {
    const violations = [];
    const lines = message.replace(/\r\n/g, '\n').split('\n');
    const subject = lines[0]?.trimEnd() ?? '';
    const allowedTypes = options.allowedTypes ?? DEFAULT_COMMIT_TYPES;
    const subjectMaxLength = options.subjectMaxLength ?? 100;
    if (subject.length === 0) {
        violations.push({ message: 'Commit subject is required' });
        return result('Commit message', 1, violations);
    }
    if (/^(Merge|Revert|fixup!|squash!)/.test(subject)) {
        return result('Commit message', 1, []);
    }
    const conventionalMatch = /^(?<type>[a-z]+)(?:\([^)]+\))?!?: .+/.exec(subject);
    if (!conventionalMatch?.groups?.type || !allowedTypes.includes(conventionalMatch.groups.type)) {
        violations.push({
            message: `Commit subject must be conventional (${allowedTypes.join('|')})(scope): summary`,
        });
    }
    if (subject.length > subjectMaxLength) {
        violations.push({
            message: `Commit subject must be ${subjectMaxLength} characters or fewer`,
        });
    }
    if (lines.length > 1 && lines[1] !== '') {
        violations.push({
            message: 'Second line must be blank when a commit body is present',
        });
    }
    const shouldEnforceLore = options.requireLore === true || options.loreWarn === true || subject.includes('[lore]');
    if (shouldEnforceLore) {
        const loreResult = validateLoreTrailers(message, {
            requireLore: options.requireLore === true || subject.includes('[lore]'),
            loreWarn: options.loreWarn === true && !(options.requireLore === true || subject.includes('[lore]')),
        });
        for (const violation of loreResult.violations) {
            violations.push({ message: violation });
        }
        for (const warning of loreResult.warnings) {
            console.warn(`[lore-warn] ${warning}`);
        }
    }
    return result('Commit message', 1, violations);
}
export function auditCommitMessageFile(messageFile, options = {}) {
    return withFilePrefix(resolve(messageFile), validateCommitMessage(readFileSync(messageFile, 'utf8'), options));
}
export function auditDocsFrontmatter(rootDirectory = process.cwd(), options = {}) {
    const root = resolve(rootDirectory);
    const docsRoot = resolve(root, options.docsRoot ?? 'docs');
    const allowedTypes = new Set(options.allowedTypes ?? DEFAULT_DOC_TYPES);
    const folderTypes = options.folderTypes ?? DEFAULT_DOC_FOLDER_TYPES;
    const violations = [];
    const today = options.today ?? new Date().toISOString().slice(0, 10);
    if (!existsSync(docsRoot)) {
        return result('Docs frontmatter', 0, []);
    }
    const markdownFiles = walkMarkdownFiles(docsRoot);
    for (const file of markdownFiles) {
        let markdown = readFileSync(file, 'utf8');
        const folder = relativePath(docsRoot, file).split('/')[0] ?? '';
        const inferredType = folderTypes[folder] ?? 'guide';
        if (options.fix) {
            const fixed = applyDocsFrontmatterFix(markdown, {
                inferredType,
                today,
            });
            if (fixed !== markdown) {
                writeFileSync(file, fixed, 'utf8');
                markdown = fixed;
            }
        }
        const frontmatter = parseFrontmatter(markdown);
        const relativeFile = relativePath(root, file);
        const type = frontmatter.type;
        const lastUpdated = frontmatter.last_updated;
        if (!type) {
            violations.push({
                file: relativeFile,
                message: 'Missing required frontmatter field: type',
            });
        }
        else if (folder !== 'templates' && !allowedTypes.has(type)) {
            violations.push({
                file: relativeFile,
                message: `Invalid type ${JSON.stringify(type)}`,
            });
        }
        if (!lastUpdated) {
            violations.push({
                file: relativeFile,
                message: 'Missing required frontmatter field: last_updated',
            });
        }
        const expectedType = folderTypes[folder];
        if (folder !== 'templates' && expectedType && type && type !== expectedType) {
            violations.push({
                file: relativeFile,
                message: `Docs in ${folder}/ must use type: ${expectedType}`,
            });
        }
    }
    return result('Docs frontmatter', markdownFiles.length, violations);
}
export function auditBlueprintLifecycle(rootDirectory = process.cwd(), options = {}) {
    const root = resolve(rootDirectory);
    const blueprintsRoot = resolve(root, options.blueprintsRoot ?? 'blueprints');
    const statuses = options.statuses ?? DEFAULT_BLUEPRINT_STATUSES;
    const violations = [];
    let checked = 0;
    for (const status of statuses) {
        const statusRoot = join(blueprintsRoot, status);
        if (!existsSync(statusRoot))
            continue;
        for (const entry of readdirSync(statusRoot, { withFileTypes: true })) {
            if (!entry.isDirectory())
                continue;
            const overviewPath = join(statusRoot, entry.name, '_overview.md');
            checked += 1;
            if (!existsSync(overviewPath)) {
                violations.push({
                    file: relativePath(root, overviewPath),
                    message: 'Missing _overview.md',
                });
                continue;
            }
            const raw = readFileSync(overviewPath, 'utf8');
            const frontmatter = matter(raw).data;
            if (frontmatter.type !== 'blueprint' && frontmatter.type !== 'parent-roadmap') {
                violations.push({
                    file: relativePath(root, overviewPath),
                    message: 'Blueprint overview must use type: blueprint or parent-roadmap',
                });
            }
            if (frontmatter.status !== status) {
                violations.push({
                    file: relativePath(root, overviewPath),
                    message: `Blueprint status must match folder (${status})`,
                });
            }
            violations.push(...validateBlueprintLinkingFrontmatter({
                file: relativePath(root, overviewPath),
                frontmatter,
                status,
            }));
        }
    }
    if (options.includeLegacyOmx === true) {
        const legacy = auditLegacyOmxPlans(root);
        checked += legacy.checked;
        violations.push(...legacy.violations);
    }
    return result('Blueprint lifecycle', checked, violations);
}
export function formatRepoAuditReport(auditResult) {
    const status = auditResult.ok ? 'OK' : 'FAILED';
    const lines = [`${auditResult.title}: ${status} (${auditResult.checked} checked)`];
    for (const violation of auditResult.violations) {
        const location = violation.file ? `${violation.file}: ` : '';
        lines.push(`- ${location}${violation.message}`);
    }
    return lines.join('\n');
}
function result(title, checked, violations) {
    return { ok: violations.length === 0, title, checked, violations };
}
function parseWorkspacePackageGlobs(workspaceYaml) {
    return extractTopLevelBlock(workspaceYaml, 'packages')
        .map((line) => /^\s*-\s*(.+?)\s*$/.exec(line)?.[1])
        .filter((value) => value !== undefined)
        .map((value) => stripQuotes(value.trim()))
        .filter((value) => value.length > 0 && !value.startsWith('!'));
}
function validateBlueprintLinkingFrontmatter(options) {
    if (!ACTIVE_BLUEPRINT_STATUSES.has(options.status))
        return [];
    const violations = [];
    const parentRoadmap = typeof options.frontmatter.parent_roadmap === 'string'
        ? options.frontmatter.parent_roadmap.trim()
        : '';
    if (parentRoadmap.length > 0 && !isLocalParentRoadmapReference(parentRoadmap)) {
        violations.push({
            file: options.file,
            message: 'parent_roadmap must reference a local roadmap slug/path in the same repo; use cross_repo_depends_on plus GitHub links for cross-repo relationships',
        });
    }
    const dependsOn = Array.isArray(options.frontmatter.depends_on)
        ? options.frontmatter.depends_on
        : [];
    for (const dependency of dependsOn) {
        if (typeof dependency !== 'string') {
            violations.push({
                file: options.file,
                message: 'depends_on entries must be strings',
            });
            continue;
        }
        const trimmed = dependency.trim();
        if (looksLikeCrossRepoReference(trimmed)) {
            violations.push({
                file: options.file,
                message: 'depends_on must stay repo-local; move cross-repo blockers to cross_repo_depends_on and use GitHub links in markdown body references',
            });
        }
    }
    if (options.frontmatter.cross_repo_depends_on === undefined)
        return violations;
    if (!Array.isArray(options.frontmatter.cross_repo_depends_on)) {
        violations.push({
            file: options.file,
            message: 'cross_repo_depends_on must be an array of { repo, slug, require_status? } objects',
        });
        return violations;
    }
    for (const dependency of options.frontmatter.cross_repo_depends_on) {
        if (!dependency || typeof dependency !== 'object' || Array.isArray(dependency)) {
            violations.push({
                file: options.file,
                message: 'cross_repo_depends_on entries must be objects with repo, slug, and optional require_status',
            });
            continue;
        }
        const record = dependency;
        const repo = typeof record.repo === 'string' ? record.repo.trim() : '';
        const slug = typeof record.slug === 'string' ? record.slug.trim() : '';
        const requireStatus = typeof record.require_status === 'string' ? record.require_status.trim() : undefined;
        if (!GITHUB_REPO_PATTERN.test(repo) || looksLikeCrossRepoReference(repo)) {
            violations.push({
                file: options.file,
                message: 'cross_repo_depends_on.repo must use owner/repo form',
            });
        }
        if (!BLUEPRINT_SLUG_PATTERN.test(slug) || looksLikeCrossRepoReference(slug)) {
            violations.push({
                file: options.file,
                message: 'cross_repo_depends_on.slug must be a blueprint slug only (no paths, URLs, or _overview.md suffix)',
            });
        }
        if (requireStatus && !isBlueprintStatusValue(requireStatus)) {
            violations.push({
                file: options.file,
                message: 'cross_repo_depends_on.require_status must be a valid blueprint lifecycle status',
            });
        }
    }
    return violations;
}
function isLocalParentRoadmapReference(reference) {
    const normalized = normalizeBlueprintReference(reference);
    if (normalized.length === 0)
        return false;
    if (looksLikeCrossRepoReference(normalized))
        return false;
    if (BLUEPRINT_REFERENCE_PATTERN.test(normalized))
        return true;
    return BLUEPRINT_SLUG_PATTERN.test(lastSegment(normalized));
}
function looksLikeCrossRepoReference(reference) {
    const trimmed = reference.trim();
    return (trimmed.length > 0 &&
        (LEGACY_CROSS_REPO_LABEL_PATTERN.test(trimmed) ||
            ABSOLUTE_FILE_REFERENCE_PATTERN.test(trimmed) ||
            /^https?:\/\//i.test(trimmed) ||
            GITHUB_BLOB_URL_PATTERN.test(trimmed)));
}
function normalizeBlueprintReference(reference) {
    return reference
        .trim()
        .replace(/^['"]|['"]$/g, '')
        .replace(/\\/g, '/')
        .replace(/^\.?\//, '')
        .replace(/\/_overview\.md$/, '');
}
function lastSegment(value) {
    return value.split('/').filter(Boolean).at(-1) ?? value;
}
function isBlueprintStatusValue(value) {
    return DEFAULT_BLUEPRINT_STATUSES.includes(value);
}
function parseCatalogDependencyNames(workspaceYaml) {
    const names = new Set();
    for (const line of extractTopLevelBlock(workspaceYaml, 'catalog')) {
        const match = /^\s+([^:#][^:]*):\s*(.+?)\s*$/.exec(line);
        if (match?.[1] && match[2] !== '')
            names.add(stripQuotes(match[1].trim()));
    }
    for (const line of extractTopLevelBlock(workspaceYaml, 'catalogs')) {
        const indent = line.match(/^\s*/)?.[0].length ?? 0;
        const match = /^\s+([^:#][^:]*):\s*(.+?)\s*$/.exec(line);
        if (indent >= 4 && match?.[1] && match[2] !== '')
            names.add(stripQuotes(match[1].trim()));
    }
    return names;
}
function extractTopLevelBlock(yaml, key) {
    const lines = [];
    let inBlock = false;
    for (const line of yaml.split(/\r?\n/)) {
        const trimmed = line.trim();
        if (trimmed.length === 0 || trimmed.startsWith('#'))
            continue;
        const topLevelKey = /^([A-Za-z0-9_-]+):/.exec(trimmed)?.[1];
        const indent = line.match(/^\s*/)?.[0].length ?? 0;
        if (indent === 0 && topLevelKey) {
            inBlock = topLevelKey === key;
            continue;
        }
        if (inBlock)
            lines.push(line);
    }
    return lines;
}
function discoverWorkspacePackageFiles(root, workspaceGlobs) {
    const packageFiles = new Set();
    for (const workspaceGlob of workspaceGlobs) {
        const normalizedGlob = workspaceGlob.replace(/\\/g, '/');
        if (normalizedGlob.endsWith('/*')) {
            const baseDirectory = resolve(root, normalizedGlob.slice(0, -2));
            if (!existsSync(baseDirectory))
                continue;
            for (const entry of readdirSync(baseDirectory, { withFileTypes: true })) {
                if (!entry.isDirectory())
                    continue;
                const packageFile = join(baseDirectory, entry.name, 'package.json');
                if (existsSync(packageFile))
                    packageFiles.add(packageFile);
            }
            continue;
        }
        const packageFile = resolve(root, normalizedGlob, 'package.json');
        if (existsSync(packageFile))
            packageFiles.add(packageFile);
    }
    return [...packageFiles].toSorted((left, right) => left.localeCompare(right));
}
function isSharedDependencyReference(version) {
    return (version.startsWith('catalog:') ||
        version.startsWith('workspace:') ||
        version.startsWith('file:') ||
        version.startsWith('link:'));
}
function readJsonObject(file) {
    const value = JSON.parse(readFileSync(file, 'utf8'));
    if (!value || typeof value !== 'object' || Array.isArray(value))
        return {};
    return value;
}
function readStringRecord(value) {
    if (!value || typeof value !== 'object' || Array.isArray(value))
        return {};
    return Object.fromEntries(Object.entries(value).filter((entry) => typeof entry[1] === 'string'));
}
const MARKDOWN_SKIP_DIRS = new Set(['node_modules', 'dist', '.git', '_sandbox']);
function walkMarkdownFiles(root) {
    const files = [];
    for (const entry of readdirSync(root, { withFileTypes: true })) {
        const path = join(root, entry.name);
        if (entry.isDirectory()) {
            if (MARKDOWN_SKIP_DIRS.has(entry.name))
                continue;
            files.push(...walkMarkdownFiles(path));
            continue;
        }
        if (entry.isFile() && entry.name.endsWith('.md'))
            files.push(path);
    }
    return files.toSorted((left, right) => left.localeCompare(right));
}
export function parseFrontmatter(markdown) {
    if (!markdown.startsWith('---'))
        return {};
    const end = markdown.indexOf('\n---', 3);
    if (end === -1)
        return {};
    const frontmatter = markdown.slice(3, end);
    const data = {};
    for (const line of frontmatter.split(/\r?\n/)) {
        const match = /^\s*([A-Za-z0-9_-]+):\s*(.*?)\s*$/.exec(line);
        if (!match?.[1])
            continue;
        data[match[1]] = stripQuotes(match[2] ?? '');
    }
    return data;
}
function applyDocsFrontmatterFix(markdown, options) {
    const frontmatter = parseFrontmatter(markdown);
    const needsType = !frontmatter.type;
    const needsLastUpdated = !frontmatter.last_updated;
    if (!needsType && !needsLastUpdated)
        return markdown;
    const lines = [];
    if (needsType) {
        lines.push('# TODO: classify type — auto-set by wp');
        lines.push(`type: ${options.inferredType}`);
    }
    if (needsLastUpdated) {
        lines.push(`last_updated: '${options.today}'`);
    }
    if (!markdown.startsWith('---')) {
        return `---\n${lines.join('\n')}\n---\n\n${markdown}`;
    }
    const end = markdown.indexOf('\n---', 3);
    if (end === -1)
        return markdown;
    return `${markdown.slice(0, end)}\n${lines.join('\n')}${markdown.slice(end)}`;
}
function auditLegacyOmxPlans(root) {
    const plansRoot = join(root, '.omx', 'plans');
    const contractsRoot = join(root, '.omx', 'contracts');
    const lifecycleRoot = join(root, '.omx', 'state', 'lifecycle');
    const contractPath = join(contractsRoot, 'workspace-boundary-contract.md');
    const violations = [];
    let checked = 0;
    const prdFiles = readDirectoryEntries(plansRoot).filter((file) => /^prd-.+\.md$/.test(file));
    const testSpecFiles = readDirectoryEntries(plansRoot).filter((file) => /^test-spec-.+\.md$/.test(file));
    const lifecycleFiles = readDirectoryEntries(lifecycleRoot).filter((file) => file.endsWith('.json'));
    const hasLegacySurface = existsSync(contractPath) ||
        prdFiles.length > 0 ||
        testSpecFiles.length > 0 ||
        lifecycleFiles.length > 0;
    if (!hasLegacySurface)
        return { checked, violations };
    if (!existsSync(plansRoot)) {
        violations.push({
            file: relativePath(root, plansRoot),
            message: 'Missing .omx/plans directory',
        });
    }
    if (!existsSync(contractsRoot)) {
        violations.push({
            file: relativePath(root, contractsRoot),
            message: 'Missing .omx/contracts directory',
        });
    }
    if (!existsSync(lifecycleRoot)) {
        violations.push({
            file: relativePath(root, lifecycleRoot),
            message: 'Missing .omx/state/lifecycle directory',
        });
    }
    checked += 1;
    const contractContent = readTextIfExists(contractPath);
    if (!contractContent) {
        violations.push({
            file: relativePath(root, contractPath),
            message: 'Missing workspace boundary contract',
        });
    }
    else {
        for (const marker of ['# Workspace boundary contract', '## Workspace classifications']) {
            if (!contractContent.includes(marker)) {
                violations.push({
                    file: relativePath(root, contractPath),
                    message: `workspace-boundary-contract.md is missing required marker: ${marker}`,
                });
            }
        }
    }
    if (prdFiles.length === 0) {
        violations.push({
            file: relativePath(root, plansRoot),
            message: 'Missing at least one PRD artifact under .omx/plans',
        });
    }
    if (testSpecFiles.length === 0) {
        violations.push({
            file: relativePath(root, plansRoot),
            message: 'Missing at least one test spec artifact under .omx/plans',
        });
    }
    if (lifecycleFiles.length === 0) {
        violations.push({
            file: relativePath(root, lifecycleRoot),
            message: 'Missing at least one lifecycle artifact under .omx/state/lifecycle',
        });
    }
    for (const file of prdFiles) {
        checked += 1;
        const content = readTextIfExists(join(plansRoot, file));
        if (!content?.includes('# PRD:')) {
            violations.push({
                file: relativePath(root, join(plansRoot, file)),
                message: `${file} is missing a PRD heading`,
            });
        }
    }
    for (const file of testSpecFiles) {
        checked += 1;
        const content = readTextIfExists(join(plansRoot, file));
        if (!content?.includes('# Test Spec:')) {
            violations.push({
                file: relativePath(root, join(plansRoot, file)),
                message: `${file} is missing a test spec heading`,
            });
        }
    }
    for (const file of lifecycleFiles) {
        checked += 1;
        const lifecycleContent = readTextIfExists(join(lifecycleRoot, file));
        if (!lifecycleContent)
            continue;
        try {
            const parsed = JSON.parse(lifecycleContent);
            if (typeof parsed.slug !== 'string' || parsed.slug.length === 0) {
                violations.push({
                    file: relativePath(root, join(lifecycleRoot, file)),
                    message: `Lifecycle state requires a slug (${file})`,
                });
            }
            if (typeof parsed.status !== 'string' || parsed.status.length === 0) {
                violations.push({
                    file: relativePath(root, join(lifecycleRoot, file)),
                    message: `Lifecycle state requires a status (${file})`,
                });
            }
            if (!parsed.artifacts ||
                typeof parsed.artifacts !== 'object' ||
                Array.isArray(parsed.artifacts)) {
                violations.push({
                    file: relativePath(root, join(lifecycleRoot, file)),
                    message: `Lifecycle state requires an artifacts object (${file})`,
                });
            }
        }
        catch (error) {
            const message = error instanceof Error ? error.message : String(error);
            violations.push({
                file: relativePath(root, join(lifecycleRoot, file)),
                message: `Lifecycle state JSON is invalid in ${file}: ${message}`,
            });
        }
    }
    const files = [...prdFiles, ...testSpecFiles];
    const slugs = new Map();
    for (const file of files) {
        const match = /^(prd|test-spec)-(.+)\.md$/.exec(file);
        if (!match?.[1] || !match[2])
            continue;
        const slugFiles = slugs.get(match[2]) ?? new Set();
        slugFiles.add(match[1]);
        slugs.set(match[2], slugFiles);
    }
    for (const [slug, slugFiles] of slugs.entries()) {
        if (!slugFiles.has('prd')) {
            violations.push({
                file: relativePath(root, join(plansRoot, `prd-${slug}.md`)),
                message: 'Missing legacy PRD plan',
            });
        }
        if (!slugFiles.has('test-spec')) {
            violations.push({
                file: relativePath(root, join(plansRoot, `test-spec-${slug}.md`)),
                message: 'Missing legacy test spec plan',
            });
        }
    }
    return { checked, violations };
}
function readDirectoryEntries(directory) {
    return existsSync(directory) ? readdirSync(directory) : [];
}
function readTextIfExists(file) {
    return existsSync(file) ? readFileSync(file, 'utf8') : undefined;
}
/**
 * Fail if any package.json (root, workspaces, or named extras) declares a
 * `link:<filesystem-path>` value in `dependencies`, `devDependencies`,
 * `optionalDependencies`, or `pnpm.overrides`. `link:` filesystem-couples
 * consumer clones to a maintainer's directory layout and hides version-pin
 * drift; use `catalog:` (cross-repo) or `workspace:*` (intra-repo) instead.
 */
export function auditNoLinkProtocol(rootDirectory = process.cwd(), options = {}) {
    const root = resolve(rootDirectory);
    const workspacePath = resolve(root, options.workspaceFile ?? 'pnpm-workspace.yaml');
    const violations = [];
    const packageFiles = new Set();
    const rootPackageFile = resolve(root, 'package.json');
    if (existsSync(rootPackageFile))
        packageFiles.add(rootPackageFile);
    if (existsSync(workspacePath)) {
        const workspaceGlobs = parseWorkspacePackageGlobs(readFileSync(workspacePath, 'utf8'));
        for (const discovered of discoverWorkspacePackageFiles(root, workspaceGlobs)) {
            packageFiles.add(discovered);
        }
    }
    for (const extraGlob of options.extraPackageGlobs ?? []) {
        for (const discovered of discoverWorkspacePackageFiles(root, [extraGlob])) {
            packageFiles.add(discovered);
        }
    }
    const sortedPackageFiles = [...packageFiles].toSorted((left, right) => left.localeCompare(right));
    for (const packageFile of sortedPackageFiles) {
        const pkg = readJsonObject(packageFile);
        const file = relativePath(root, packageFile);
        const directSections = ['dependencies', 'devDependencies', 'optionalDependencies'];
        for (const section of directSections) {
            for (const [name, value] of Object.entries(readStringRecord(pkg[section]))) {
                if (value.startsWith('link:')) {
                    violations.push({
                        file,
                        message: `${section}.${name}: ${JSON.stringify(value)} — replace with "catalog:" (cross-repo) or "workspace:*" (intra-repo)`,
                    });
                }
            }
        }
        const pnpm = pkg.pnpm;
        if (pnpm && typeof pnpm === 'object' && !Array.isArray(pnpm)) {
            const overrides = readStringRecord(pnpm.overrides);
            for (const [name, value] of Object.entries(overrides)) {
                if (value.startsWith('link:')) {
                    violations.push({
                        file,
                        message: `pnpm.overrides.${name}: ${JSON.stringify(value)} — link: in overrides filesystem-couples the consumer; remove the override or pin to a published version`,
                    });
                }
            }
        }
    }
    return result('no-link-protocol', sortedPackageFiles.length, violations);
}
/**
 * Fail if any source file contains relative parent imports (`../`) or if any
 * `tsconfig*.json` declares a parent-relative path. Use `#alias` package
 * imports for source code and a workspace path mapping / package alias for
 * tsconfig `extends`, `paths`, `references`, etc.
 */
export function auditNoRelativeParentImports(root, options = {}) {
    const srcDir = resolve(root, options.srcDir ?? 'src');
    const extensions = options.extensions ?? ['.ts', '.tsx', '.js', '.jsx'];
    const excludedDirs = new Set((options.excludeDirs ?? []).map((d) => resolve(srcDir, d)));
    const violations = [];
    let checked = 0;
    function walk(dir) {
        if (!existsSync(dir))
            return;
        for (const entry of readdirSync(dir, { withFileTypes: true })) {
            const full = join(dir, entry.name);
            if (entry.isDirectory()) {
                if (entry.name === 'node_modules' || entry.name === 'dist' || entry.name === '_sandbox')
                    continue;
                if (excludedDirs.has(full))
                    continue;
                walk(full);
                continue;
            }
            if (!extensions.some((ext) => entry.name.endsWith(ext)))
                continue;
            if (entry.name.endsWith('.test.ts') || entry.name.endsWith('.test.tsx'))
                continue;
            if (entry.name.endsWith('.integration.test.ts'))
                continue;
            checked++;
            const content = readFileSync(full, 'utf-8');
            const rel = relativePath(root, full);
            const lines = content.split('\n');
            for (let i = 0; i < lines.length; i++) {
                const line = lines[i] ?? '';
                // Skip comment lines
                if (/^\s*(\/\/|\/\*)/.test(line))
                    continue;
                if (/(?:from|export\s+\*\s+from)\s+['"]\.\.\//.test(line)) {
                    violations.push({
                        file: rel,
                        message: `Line ${i + 1}: relative parent import detected — use a \`#\` alias instead: ${line.trim()}`,
                    });
                }
                // Detect 3+ level fixed-depth path traversal in runtime code.
                // These break when src/ vs dist/esm/ depth differs. Use resolvePackageAsset() instead.
                const hasDeepStringTraversal = /['"`][^'"`\n]*(?:\.\.\/){3,}[^'"`\n]*['"`]/.test(line);
                const hasDeepArgTraversal = (line.match(/['"]\.\.['"]/g)?.length ?? 0) >= 3;
                if (hasDeepStringTraversal || hasDeepArgTraversal) {
                    violations.push({
                        file: rel,
                        message: `Line ${i + 1}: fixed-depth path traversal (3+ levels) — use resolvePackageAsset() to locate package assets portably: ${line.trim()}`,
                    });
                }
            }
        }
    }
    walk(srcDir);
    if (options.skipTsconfig !== true) {
        const tsconfigRoot = resolve(root, options.tsconfigRoot ?? '.');
        const tsconfigChecked = walkTsconfigParentPaths(tsconfigRoot, root, violations);
        checked += tsconfigChecked;
    }
    return {
        ok: violations.length === 0,
        title: 'no-relative-parent-imports',
        checked,
        violations,
    };
}
const TSCONFIG_SKIP_DIRS = new Set([
    'node_modules',
    'dist',
    'build',
    '.git',
    '.cache',
    '.next',
    '.turbo',
    '.omx',
    // Mutation-testing sandbox (gitignored, generated per package).
    '.stryker-tmp',
    // Per-worktree clones (Claude Code Agent isolation) — not part of the
    // canonical source tree, audit them via their own root if needed.
    '.claude',
    // Scaffolding templates: content under `template/` becomes a downstream
    // customer's source tree, not ours. Parent paths inside template
    // tsconfigs reference the scaffolded layout, not the repo layout.
    'template',
    // Workspace-level scratch/archive space — stale trees produce false
    // positives; consumers without this directory see no behaviour change.
    '_sandbox',
]);
/**
 * Walk the repo for `tsconfig*.json` files and flag any value that uses a
 * parent-relative path (`../`). Covers `extends`, `paths`, `references`,
 * `include`, `exclude`, `files`, `baseUrl`, `rootDir`, `outDir`, etc., by
 * scanning every string value recursively. tsconfig.json supports JSONC
 * (trailing commas + comments), but we only need to inspect string-shaped
 * values — a defensive line-level scan tolerates the comment syntax.
 */
function walkTsconfigParentPaths(startDir, reportRoot, violations) {
    if (!existsSync(startDir))
        return 0;
    let checked = 0;
    function walk(dir) {
        for (const entry of readdirSync(dir, { withFileTypes: true })) {
            const full = join(dir, entry.name);
            if (entry.isDirectory()) {
                if (TSCONFIG_SKIP_DIRS.has(entry.name))
                    continue;
                walk(full);
                continue;
            }
            if (!entry.isFile())
                continue;
            if (!/^tsconfig(\.[^.]+)*\.json$/.test(entry.name))
                continue;
            checked += 1;
            const content = readFileSync(full, 'utf-8');
            const rel = relativePath(reportRoot, full);
            const lines = content.split('\n');
            for (let i = 0; i < lines.length; i++) {
                const line = lines[i] ?? '';
                const trimmed = line.trim();
                // Skip blank lines, line comments, and block-comment-only lines.
                if (trimmed === '' || trimmed.startsWith('//') || trimmed.startsWith('/*'))
                    continue;
                // Any `"../` inside a JSON string value is a parent reference. We
                // match `"` followed by zero or more non-quote chars then `../`
                // (handles both `"../foo"` and `"./foo/../bar"`).
                if (/"[^"]*\.\.\/[^"]*"/.test(line)) {
                    violations.push({
                        file: rel,
                        message: `Line ${i + 1}: tsconfig parent-relative path detected — use a workspace path mapping or package alias instead: ${trimmed}`,
                    });
                }
            }
        }
    }
    walk(startDir);
    return checked;
}
function withFilePrefix(file, auditResult) {
    return {
        ...auditResult,
        violations: auditResult.violations.map((violation) => ({
            ...violation,
            file: violation.file ?? file,
        })),
    };
}
function stripQuotes(value) {
    return value.replace(/^['"]|['"]$/g, '');
}
function relativePath(root, path) {
    const relativePathValue = relative(root, path);
    return relativePathValue.split(sep).join('/');
}
/**
 * Fail if any `package.json#scripts` entry invokes a relative parent path
 * (`../`). Scripts should call workspace bins or registered CLI commands, not
 * path-relative sibling scripts — those break when packages move.
 *
 * @example bad  — "build": "node [dot-dot-dot]/scripts/foo.js"  (relative parent path)
 * @example good — "build": "pnpm --filter scripts foo"  or  "build": "wp build"
 */
export function auditNoRelativePackageScripts(root, options = {}) {
    const violations = [];
    const excludedDirs = new Set((options.excludeDirs ?? []).map((d) => resolve(root, d)));
    let checked = 0;
    function walk(dir) {
        if (!existsSync(dir))
            return;
        for (const entry of readdirSync(dir, { withFileTypes: true })) {
            const full = join(dir, entry.name);
            if (entry.isDirectory()) {
                if (entry.name === 'node_modules' ||
                    entry.name === 'dist' ||
                    entry.name === '.git' ||
                    entry.name === '_sandbox')
                    continue;
                if (excludedDirs.has(full))
                    continue;
                walk(full);
                continue;
            }
            if (entry.name !== 'package.json')
                continue;
            checked++;
            let pkg;
            try {
                pkg = JSON.parse(readFileSync(full, 'utf-8'));
            }
            catch {
                continue;
            }
            const scripts = pkg['scripts'];
            if (!scripts || typeof scripts !== 'object')
                continue;
            const rel = relativePath(root, full);
            for (const [name, value] of Object.entries(scripts)) {
                if (typeof value !== 'string')
                    continue;
                // Detect ../ only in the executable/script position of each sub-command,
                // not in subsequent argument tokens. Split by command separators first.
                const subCommands = value.split(/&&|\|\||;/);
                const hasRelativeScript = subCommands.some((sub) => {
                    const trimmed = sub.trim();
                    // interpreter followed immediately by a ../ script path
                    if (/^(?:node|bun|tsx|ts-node|npx|pnpm\s+exec)\s+\.\.\/\S+/.test(trimmed))
                        return true;
                    // bare ../ script execution
                    if (trimmed.startsWith('../'))
                        return true;
                    return false;
                });
                if (hasRelativeScript) {
                    violations.push({
                        file: rel,
                        message: `scripts.${name}: relative parent path detected — use a workspace bin or registered CLI command instead: ${value}`,
                    });
                }
            }
        }
    }
    walk(root);
    return {
        ok: violations.length === 0,
        title: 'no-relative-package-scripts',
        checked,
        violations,
    };
}
//# sourceMappingURL=repo-guardrails.js.map