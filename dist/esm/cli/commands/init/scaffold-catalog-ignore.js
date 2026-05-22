/**
 * Scaffold a `.gitignore` block listing every catalog-shipped skill and rule
 * name, so a consumer repo never accidentally tracks a duplicate of a
 * canonical agent-kit source under `agent-skills/<name>/` or
 * `agent-rules/<name>.md`.
 *
 * Couples the consumer's `.gitignore` to the catalog snapshot at scaffold
 * time. Re-run `wp setup` to pick up new catalog entries; the managed block
 * is overwritten in-place.
 *
 * Consumer-authored skills/rules with names that DO NOT match a catalog
 * entry remain trackable. A consumer-authored skill that collides with a
 * catalog name will be ignored — that is the documented trade-off of this
 * blanket-by-name strategy.
 */
import { existsSync, readdirSync, statSync } from 'node:fs';
import { join } from 'node:path';
import { patchGitignore } from './gitignore-patcher.js';
function listCatalogSkills(catalogDir) {
    const dir = join(catalogDir, 'agent', 'skills');
    if (!existsSync(dir))
        return [];
    return readdirSync(dir)
        .filter((name) => !name.startsWith('.') && statSync(join(dir, name)).isDirectory())
        .sort();
}
function listCatalogRules(catalogDir) {
    const dir = join(catalogDir, 'agent', 'rules');
    if (!existsSync(dir))
        return [];
    return readdirSync(dir)
        .filter((name) => name.endsWith('.md') && name !== 'README.md' && statSync(join(dir, name)).isFile())
        .map((name) => name.replace(/\.md$/, ''))
        .sort();
}
export function scaffoldCatalogIgnore(opts) {
    const { cwd, catalogDir, dryRun, overwrite } = opts;
    const mergeOpts = { dryRun, overwrite };
    const skillNames = listCatalogSkills(catalogDir);
    const ruleNames = listCatalogRules(catalogDir);
    const patterns = [
        ...skillNames.map((name) => `agent-skills/${name}/`),
        ...ruleNames.map((name) => `agent-rules/${name}.md`),
    ];
    const result = patchGitignore(join(cwd, '.gitignore'), { id: 'catalog-installed', patterns }, mergeOpts);
    return { results: [result], skillNames, ruleNames };
}
//# sourceMappingURL=scaffold-catalog-ignore.js.map