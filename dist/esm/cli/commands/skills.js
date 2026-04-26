/**
 * `ak skills list|install` — manage agent skills against the
 * bundled catalog at `<packageRoot>/catalog/agent/skills/`.
 *
 *   list                        Enumerate bundled catalog skills.
 *   list --installed            Enumerate skills present at <cwd>/.agent/skills.
 *   install <name>              Copy a catalog skill into <cwd>/.agent/skills.
 *
 * The bundled catalog ships inside this package's `catalog/` directory and
 * is enumerated lazily — empty catalog is reported, not an error.
 */
import { cpSync, existsSync, mkdirSync, readdirSync, statSync } from 'node:fs';
import path from 'node:path';
/**
 * Resolve the bundled catalog/agent/skills directory.
 *
 * Source layout: `src/cli/commands/skills.ts` → `../../../catalog/agent/skills/`
 * Bundled layout: `dist/cli.js` → `../catalog/agent/skills/`
 *
 * Walk upward from the current module until we find a `catalog/agent/skills`
 * directory. This works for both layouts without hard-coding `..` counts.
 */
function resolveCatalogSkillsDir() {
    let dir = path.dirname(new URL(import.meta.url).pathname);
    for (let i = 0; i < 6; i++) {
        const candidate = path.join(dir, 'catalog', 'agent', 'skills');
        if (existsSync(candidate))
            return candidate;
        const parent = path.dirname(dir);
        if (parent === dir)
            break;
        dir = parent;
    }
    // Fall back to a conventional path under cwd; lets `ak skills list` print
    // a clean "no skills" message rather than throw at startup.
    return path.join(process.cwd(), 'catalog', 'agent', 'skills');
}
function listSkillDirectories(root) {
    if (!existsSync(root))
        return [];
    try {
        return readdirSync(root)
            .filter((name) => !name.startsWith('.'))
            .filter((name) => {
            try {
                return statSync(path.join(root, name)).isDirectory();
            }
            catch {
                return false;
            }
        })
            .toSorted();
    }
    catch {
        return [];
    }
}
function installedSkillsDir() {
    return path.join(process.cwd(), '.agent', 'skills');
}
function commandError(message, exitCode = 1) {
    const error = new Error(message);
    error.exitCode = exitCode;
    return error;
}
function printSkillsList(skills, header) {
    console.log(header);
    if (!skills.length) {
        console.log('  (none)');
        return;
    }
    for (const skill of skills) {
        console.log(`  ${skill}`);
    }
}
export function registerSkillsCommand(cli) {
    cli
        .command('skills <action> [name]', 'Manage agent skills (list|install)')
        .option('--installed', 'List skills installed under <cwd>/.agent/skills (with `list`)')
        .action(async (action, name, options) => {
        switch (action) {
            case 'list': {
                if (options.installed) {
                    const dir = installedSkillsDir();
                    printSkillsList(listSkillDirectories(dir), `Installed skills (${dir}):`);
                    return 0;
                }
                const dir = resolveCatalogSkillsDir();
                printSkillsList(listSkillDirectories(dir), `Bundled catalog skills (${dir}):`);
                return 0;
            }
            case 'install': {
                if (!name) {
                    throw commandError('Usage: ak skills install <name>');
                }
                const catalogDir = resolveCatalogSkillsDir();
                const source = path.join(catalogDir, name);
                if (!existsSync(source)) {
                    throw commandError(`Skill not found in bundled catalog: ${name}\nTried: ${source}\n` +
                        `Run \`ak skills list\` to see available skills.`);
                }
                const targetRoot = installedSkillsDir();
                const target = path.join(targetRoot, name);
                mkdirSync(targetRoot, { recursive: true });
                cpSync(source, target, { recursive: true });
                console.log(`Installed skill ${name} → ${target}`);
                return 0;
            }
            default: {
                throw commandError(`Unknown skills action: ${action}. Use 'list' or 'install'.`);
            }
        }
    });
}
//# sourceMappingURL=skills.js.map