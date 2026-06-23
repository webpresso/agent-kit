import { execSync } from 'node:child_process';
import { readFileSync } from 'node:fs';
import { parse as parseYaml } from 'yaml';
import { applyDirectives } from './directives.js';
import { memoryMergeYamlSchema } from './directives.schema.js';
import { parseDocument, serializeDocument } from './precedence.js';
import { buildProvenance } from './provenance.js';
function isShallowRepository(cwd) {
    try {
        const result = execSync('git rev-parse --is-shallow-repository', {
            cwd: cwd ?? process.cwd(),
            encoding: 'utf8',
            stdio: ['pipe', 'pipe', 'pipe'],
        }).trim();
        return result === 'true';
    }
    catch {
        return false;
    }
}
function tryReadFile(filePath, warnings) {
    try {
        return readFileSync(filePath, 'utf8');
    }
    catch {
        warnings.push(`skipping missing layer: ${filePath}`);
        return undefined;
    }
}
export async function mergeAgentsMd(opts) {
    const warnings = [];
    const rotationLog = [];
    const provenanceEntries = [];
    const presentLayers = [];
    // Step 1: Read all layer files, skip missing ones
    const parsedLayers = [];
    for (const [idx, layerPath] of opts.layers.entries()) {
        const content = tryReadFile(layerPath, warnings);
        if (content === undefined)
            continue;
        parsedLayers.push({ path: layerPath, doc: parseDocument(content), layerIndex: idx });
        presentLayers.push(layerPath);
    }
    if (parsedLayers.length === 0) {
        const empty = buildProvenance([], opts.layers.slice());
        return { content: '', provenance: empty, rotationLog: [], warnings };
    }
    // Step 2: Start with base layer sections
    const mergedSections = new Map();
    let mergedFrontmatter = {};
    const base = parsedLayers[0];
    if (base) {
        mergedFrontmatter = { ...base.doc.frontmatter };
        for (const section of base.doc.sections) {
            mergedSections.set(section.slug, { heading: section.heading, content: section.content });
            provenanceEntries.push({
                sectionSlug: section.slug,
                sourcePath: base.path,
                op: 'base',
                layerIndex: base.layerIndex,
            });
        }
    }
    // Step 3: Each subsequent layer overrides matching slugs; new slugs appended
    for (const layer of parsedLayers.slice(1)) {
        for (const section of layer.doc.sections) {
            mergedSections.set(section.slug, { heading: section.heading, content: section.content });
            // Update or add provenance
            const existingIdx = provenanceEntries.findIndex((e) => e.sectionSlug === section.slug);
            const entry = {
                sectionSlug: section.slug,
                sourcePath: layer.path,
                op: 'override',
                layerIndex: layer.layerIndex,
            };
            if (existingIdx >= 0) {
                provenanceEntries[existingIdx] = entry;
            }
            else {
                provenanceEntries.push(entry);
            }
        }
        // Shallow RFC 7396 frontmatter merge
        mergedFrontmatter = { ...mergedFrontmatter, ...layer.doc.frontmatter };
    }
    // Step 4: Apply frontmatter patch from directives if present
    // Step 5: Load and apply directives
    let finalSections = mergedSections;
    if (opts.directivesPath) {
        const directivesContent = tryReadFile(opts.directivesPath, warnings);
        if (directivesContent !== undefined) {
            const rawYaml = parseYaml(directivesContent);
            const parsed = memoryMergeYamlSchema.safeParse(rawYaml);
            if (parsed.success) {
                const directives = parsed.data.sections ?? [];
                const frontmatter_patch = parsed.data.frontmatter_patch;
                // Apply frontmatter RFC 7396 patch
                if (frontmatter_patch) {
                    mergedFrontmatter = { ...mergedFrontmatter, ...frontmatter_patch };
                }
                // Step 6: Check shallow clone status
                const shallowClone = isShallowRepository(opts.cwd);
                // Apply directives
                finalSections = applyDirectives(finalSections, directives, {
                    dryRun: opts.dryRun ?? false,
                    isShallowClone: shallowClone,
                    rotationLog,
                    warnings,
                    cwd: opts.cwd,
                });
            }
            else {
                warnings.push(`invalid memory.merge.yaml: ${parsed.error.message}`);
            }
        }
    }
    // Step 7: Serialize back to markdown
    const content = serializeDocument(mergedFrontmatter, finalSections);
    const provenance = buildProvenance(provenanceEntries, presentLayers);
    return { content, provenance, rotationLog, warnings };
}
//# sourceMappingURL=merger.js.map