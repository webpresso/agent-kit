#!/usr/bin/env tsx
/**
 * generate-skills-dir.ts
 *
 * Reads catalog/agent/skills/<name>/SKILL.md and writes
 * skills/<slug>/SKILL.md at the package root.
 *
 * Slug sanitization: spaces and non-alphanumeric chars become `-`;
 * leading/trailing dashes are stripped; output is lowercased.
 *
 * Exits non-zero if a slug collision is detected.
 */
import { existsSync, mkdirSync, readdirSync, readFileSync, statSync, writeFileSync } from 'fs';
import { join, resolve } from 'path';
const PACKAGE_ROOT = resolve(import.meta.dirname, '..', '..');
const CATALOG_SKILLS = join(PACKAGE_ROOT, 'catalog', 'agent', 'skills');
const SKILLS_OUT = join(PACKAGE_ROOT, 'skills');
function toSlug(name) {
    return name
        .replace(/[^a-z0-9]+/gi, '-')
        .replace(/^-|-$/g, '')
        .toLowerCase();
}
function main() {
    if (!existsSync(CATALOG_SKILLS)) {
        console.error(`catalog skills directory not found: ${CATALOG_SKILLS}`);
        process.exit(1);
    }
    const entries = readdirSync(CATALOG_SKILLS).filter((entry) => {
        const fullPath = join(CATALOG_SKILLS, entry);
        return statSync(fullPath).isDirectory();
    });
    const seen = new Map();
    let count = 0;
    for (const entry of entries) {
        const skillMdPath = join(CATALOG_SKILLS, entry, 'SKILL.md');
        if (!existsSync(skillMdPath)) {
            // Skip skill dirs without a SKILL.md (e.g. template-only dirs)
            continue;
        }
        const slug = toSlug(entry);
        if (seen.has(slug)) {
            console.error(`Slug collision: "${entry}" and "${seen.get(slug)}" both produce slug "${slug}". Aborting.`);
            process.exit(1);
        }
        seen.set(slug, entry);
        const content = readFileSync(skillMdPath, 'utf-8');
        const outDir = join(SKILLS_OUT, slug);
        mkdirSync(outDir, { recursive: true });
        writeFileSync(join(outDir, 'SKILL.md'), content, 'utf-8');
        count++;
    }
    console.log(`generate-skills-dir: wrote ${count} skills to ${SKILLS_OUT}`);
}
main();
//# sourceMappingURL=generate-skills-dir.js.map