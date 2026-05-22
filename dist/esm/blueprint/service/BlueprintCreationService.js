import { existsSync } from 'node:fs';
import { mkdtemp, mkdir, readFile, readdir, rename, rm, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { parseBlueprint } from '#core/parser';
import { scanBlueprintDirectory } from '#service/scanner';
import { resolveBlueprintRoot } from '#utils/blueprint-root';
import { resolvePackageAsset } from '#utils/package-assets';
const RESERVED_BLUEPRINT_SLUGS = new Set([
    'draft',
    'planned',
    'parked',
    'in-progress',
    'completed',
    'archived',
]);
const DEFAULT_TEMPLATE_PATH = resolvePackageAsset('docs/templates/blueprint.md');
function formatDate(date) {
    return date.toISOString().split('T')[0] ?? date.toISOString();
}
function replacePlaceholder(template, placeholder, value) {
    return template.split(placeholder).join(value);
}
function toPortableRelativePath(projectRoot, absolutePath) {
    return path.relative(projectRoot, absolutePath).replaceAll(path.sep, '/');
}
function normalizeGoal(goal) {
    const normalized = goal.trim().replace(/\s+/g, ' ');
    if (normalized.length === 0) {
        throw new Error('Blueprint goal must not be empty or whitespace.');
    }
    return normalized;
}
function sentenceCase(value) {
    if (value.length === 0) {
        return value;
    }
    return value.slice(0, 1).toUpperCase() + value.slice(1);
}
function deriveSlug(goal) {
    return goal
        .toLowerCase()
        .replace(/[^a-z0-9]+/g, '-')
        .replace(/^-+|-+$/g, '')
        .replace(/-{2,}/g, '-');
}
function assertGoalProducesUsableSlug(goal, slug) {
    if (slug.length === 0) {
        throw new Error(`Blueprint goal "${goal}" could not be converted into a valid slug.`);
    }
    if (RESERVED_BLUEPRINT_SLUGS.has(slug)) {
        throw new Error(`Blueprint goal "${goal}" resolves to reserved slug "${slug}".`);
    }
}
function prepareTemplate(template) {
    const sanitized = template.replace(/^> \*\*For Claude:\*\*.*(?:\r?\n)?/gm, '');
    const withFrontmatterPlaceholders = sanitized
        .replace(/^complexity:\s*.+$/m, 'complexity: {{complexity}}')
        .replace(/^created:\s*.+$/m, "created: '{{date}}'")
        .replace(/^last_updated:\s*.+$/m, "last_updated: '{{date}}'");
    if (withFrontmatterPlaceholders.includes('## Planning Summary')) {
        return withFrontmatterPlaceholders;
    }
    return withFrontmatterPlaceholders.replace(/\*\*Goal:\*\*\s*\{\{description\}\}/, [
        '**Goal:** {{description}}',
        '',
        '## Planning Summary',
        '',
        '- Goal input: `{{description}}`',
        '- Complexity: `{{complexity}}`',
        '- Draft slug: `{{slug}}`',
        '- Output path: `{{output_path}}`',
        '- Generated command: `wp blueprint new "{{description}}" --complexity {{complexity}}`',
        '- Validation scope: parser compliance before write',
    ].join('\n'));
}
function buildParentRoadmapMarkdown(input) {
    return [
        '---',
        'type: parent-roadmap',
        'status: draft',
        `complexity: ${input.complexity}`,
        `created: '${input.date}'`,
        `last_updated: '${input.date}'`,
        '---',
        '',
        `# ${input.title}`,
        '',
        `**Goal:** ${input.goal}`,
        '',
        '## Planning Summary',
        '',
        `- Goal input: \`${input.goal}\``,
        `- Complexity: \`${input.complexity}\``,
        `- Draft slug: \`${input.slug}\``,
        `- Output path: \`${input.outputPath}\``,
        `- Creation command: \`wp blueprint new "${input.goal}" --complexity ${input.complexity} --type parent-roadmap\``,
        '',
        '## Architecture Overview',
        '',
        '- Parent roadmap scaffold. Add child blueprints and sequencing after creation.',
        '',
        '## Verification Gates',
        '',
        '- Parses as `type: parent-roadmap`.',
        '- Surfaces in roadmap-aware list/show commands.',
        '',
    ].join('\n');
}
function validateGeneratedDraft(markdown, slug, type) {
    let blueprint;
    try {
        blueprint = parseBlueprint(markdown, slug);
    }
    catch (error) {
        return {
            error: error instanceof Error ? error.message : 'Generated blueprint failed parser validation.',
            valid: false,
        };
    }
    const missingSections = [
        '## Planning Summary',
        '## Architecture Overview',
        '## Verification Gates',
    ].filter((section) => !markdown.includes(section));
    if (missingSections.length > 0) {
        return {
            error: `Generated blueprint is missing required section(s): ${missingSections.join(', ')}`,
            valid: false,
        };
    }
    if (type === 'blueprint' && blueprint.tasks.length === 0) {
        return {
            error: 'Generated blueprint must include at least one executable task.',
            valid: false,
        };
    }
    return {
        blueprint,
        valid: true,
    };
}
export class BlueprintCreationService {
    now;
    projectRoot;
    blueprintsRoot;
    templatePath;
    constructor(projectRootOrOptions, options = {}) {
        const resolvedProjectRoot = typeof projectRootOrOptions === 'string'
            ? projectRootOrOptions
            : projectRootOrOptions.projectRoot;
        const resolvedOptions = typeof projectRootOrOptions === 'string' ? options : projectRootOrOptions;
        this.projectRoot = resolvedProjectRoot;
        this.blueprintsRoot = resolveBlueprintRoot(resolvedProjectRoot);
        this.templatePath = resolvedOptions.templatePath ?? DEFAULT_TEMPLATE_PATH;
        this.now = resolvedOptions.now ?? (() => new Date());
    }
    async compile(input) {
        return this.compileDraft(input);
    }
    async compileDraft(input) {
        const goal = normalizeGoal(input.goal);
        const type = input.type ?? 'blueprint';
        const baseSlug = deriveSlug(goal);
        assertGoalProducesUsableSlug(goal, baseSlug);
        const slug = this.resolveCollisionSafeSlug(baseSlug);
        const title = sentenceCase(goal);
        const outputPath = path.join(this.blueprintsRoot, 'draft', slug, '_overview.md');
        const relativeFilePath = toPortableRelativePath(this.projectRoot, outputPath);
        const date = formatDate(this.now());
        const template = type === 'blueprint' ? prepareTemplate(await readFile(this.templatePath, 'utf-8')) : undefined;
        const markdown = type === 'parent-roadmap'
            ? buildParentRoadmapMarkdown({
                complexity: input.complexity,
                date,
                goal,
                outputPath: relativeFilePath,
                slug,
                title,
            })
            : [
                ['{{date}}', date],
                ['{{complexity}}', input.complexity],
                ['{{title}}', title],
                ['{{description}}', goal],
                ['{{slug}}', slug],
                ['{{output_path}}', relativeFilePath],
            ].reduce((currentTemplate, [placeholder, value]) => replacePlaceholder(currentTemplate, placeholder, value), template ?? '');
        parseBlueprint(markdown, slug);
        return {
            complexity: input.complexity,
            markdown,
            outputPath,
            path: outputPath,
            projectRoot: this.projectRoot,
            relativeFilePath,
            slug,
            status: 'draft',
            title,
            type,
        };
    }
    async create(input) {
        const draft = await this.compileDraft(input);
        const draftRoot = path.join(this.blueprintsRoot, 'draft');
        const finalDir = path.dirname(draft.outputPath);
        await mkdir(draftRoot, { recursive: true });
        await mkdir(path.dirname(finalDir), { recursive: true });
        const tempDir = await mkdtemp(path.join(draftRoot, `${draft.slug}.tmp-`));
        const tempPath = path.join(tempDir, '_overview.md');
        try {
            await writeFile(tempPath, draft.markdown, 'utf-8');
            const writtenMarkdown = await readFile(tempPath, 'utf-8');
            const validation = validateGeneratedDraft(writtenMarkdown, draft.slug, draft.type);
            if (!validation.valid || !validation.blueprint) {
                throw new Error(validation.error ?? 'Generated blueprint failed validation.');
            }
            await rename(tempDir, finalDir);
            return {
                ...draft,
                blueprint: validation.blueprint,
            };
        }
        catch (error) {
            await rm(tempDir, { force: true, recursive: true });
            await removeIfEmpty(draftRoot);
            throw error;
        }
    }
    resolveCollisionSafeSlug(baseSlug) {
        const blueprintsRoot = this.blueprintsRoot;
        const existing = new Set(scanBlueprintDirectory({
            baseDir: blueprintsRoot,
            includeSpecialFolders: true,
        }).map((entry) => entry.slug.split('/').slice(1).join('/') || entry.slug));
        if (!existing.has(baseSlug) && !blueprintDirectoryExists(blueprintsRoot, baseSlug)) {
            return baseSlug;
        }
        let suffix = 2;
        while (existing.has(`${baseSlug}-${suffix}`) ||
            blueprintDirectoryExists(blueprintsRoot, `${baseSlug}-${suffix}`)) {
            suffix += 1;
        }
        return `${baseSlug}-${suffix}`;
    }
}
function blueprintDirectoryExists(blueprintsRoot, slug) {
    return [...RESERVED_BLUEPRINT_SLUGS].some((status) => existsSync(path.join(blueprintsRoot, status, slug)));
}
async function removeIfEmpty(directory) {
    try {
        const entries = await readdir(directory);
        if (entries.length === 0) {
            await rm(directory, { force: true, recursive: true });
        }
    }
    catch {
        // Best-effort cleanup only.
    }
}
//# sourceMappingURL=BlueprintCreationService.js.map