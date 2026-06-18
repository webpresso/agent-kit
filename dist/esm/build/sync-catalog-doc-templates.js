#!/usr/bin/env bun
/**
 * sync-catalog-doc-templates.ts
 *
 * `docs/templates/` (repo root) is the editable source of truth for the
 * blueprint / doc templates. `catalog/docs/templates/` is the published +
 * scaffolded mirror: the npm `files` list ships `catalog/` but NOT repo-root
 * `docs/` (which holds internal docs that must stay private), and `wp init`
 * scaffolds templates into a consumer from `catalog/docs/templates/`.
 *
 * The two MUST stay byte-identical. Nothing synced them before, so they
 * drifted — this script regenerates the mirror from the source and is wired
 * into the build. The colocated drift test fails CI if they ever diverge.
 *
 * Default: regenerate the mirror from the source.
 * `--check`: exit non-zero and list drift without writing (CI / pre-publish).
 */
import { cpSync, existsSync, mkdirSync, readdirSync, readFileSync, rmSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { argv, exit } from 'node:process';
import { fileURLToPath } from 'node:url';
const PACKAGE_ROOT = dirname(dirname(import.meta.dirname));
const SOURCE_DIR = join(PACKAGE_ROOT, 'docs', 'templates');
const MIRROR_DIR = join(PACKAGE_ROOT, 'catalog', 'docs', 'templates');
function listFiles(dir) {
    if (!existsSync(dir))
        return [];
    return readdirSync(dir, { withFileTypes: true })
        .filter((entry) => entry.isFile())
        .map((entry) => entry.name)
        .sort();
}
/**
 * Names that are out of sync between source and mirror: content mismatch,
 * missing from the mirror, or orphaned in the mirror.
 */
export function diffDocTemplateMirror() {
    const sourceFiles = listFiles(SOURCE_DIR);
    const mirrorFiles = listFiles(MIRROR_DIR);
    const names = [...new Set([...sourceFiles, ...mirrorFiles])].sort();
    const drift = [];
    for (const name of names) {
        const inSource = sourceFiles.includes(name);
        const inMirror = mirrorFiles.includes(name);
        if (!inSource || !inMirror) {
            drift.push(name);
            continue;
        }
        if (readFileSync(join(SOURCE_DIR, name), 'utf8') !== readFileSync(join(MIRROR_DIR, name), 'utf8')) {
            drift.push(name);
        }
    }
    return drift;
}
/** Regenerate the mirror from the source: copy every file, drop orphans. */
function syncDocTemplateMirror() {
    mkdirSync(MIRROR_DIR, { recursive: true });
    const sourceFiles = listFiles(SOURCE_DIR);
    for (const name of listFiles(MIRROR_DIR)) {
        if (!sourceFiles.includes(name))
            rmSync(join(MIRROR_DIR, name));
    }
    for (const name of sourceFiles) {
        cpSync(join(SOURCE_DIR, name), join(MIRROR_DIR, name));
    }
    return sourceFiles.length;
}
function main() {
    if (!existsSync(SOURCE_DIR)) {
        console.error(`doc templates source not found: ${SOURCE_DIR}`);
        exit(1);
    }
    if (argv.includes('--check')) {
        const drift = diffDocTemplateMirror();
        if (drift.length > 0) {
            console.error([
                'catalog/docs/templates/ is out of sync with docs/templates/:',
                ...drift.map((name) => `  - ${name}`),
                'Run `bun src/build/sync-catalog-doc-templates.ts` and commit the result.',
            ].join('\n'));
            exit(1);
        }
        console.log('catalog/docs/templates/ is in sync with docs/templates/');
        return;
    }
    const count = syncDocTemplateMirror();
    console.log(`Synced ${count} template(s) → catalog/docs/templates/`);
}
// Run as a script, but stay side-effect-free when imported (e.g. by the test).
if (fileURLToPath(import.meta.url) === argv[1]) {
    main();
}
//# sourceMappingURL=sync-catalog-doc-templates.js.map