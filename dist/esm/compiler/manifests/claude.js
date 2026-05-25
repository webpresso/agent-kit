import { renameSync, writeFileSync } from 'node:fs';
import { mkdirSync } from 'node:fs';
import { join } from 'node:path';
import { MANIFEST_VERSIONS } from './_versions.js';
function writeAtomic(filePath, content) {
    const tmp = `${filePath}.tmp`;
    writeFileSync(tmp, content, 'utf-8');
    renameSync(tmp, filePath);
}
export async function emitManifest(opts) {
    const pluginDir = join(opts.outDir, '.claude-plugin');
    mkdirSync(pluginDir, { recursive: true });
    const plugin = {
        _generated: 'by agent-kit wp compile — do not edit manually',
        name: 'webpresso',
        version: opts.version,
        description: 'Agent-kit: blueprint lifecycle, skill compiler, audits for Claude Code',
        skills: opts.skills.map((name) => ({ path: `skills/${name}/SKILL.md` })),
        mcpServers: {},
        hooks: {},
    };
    writeAtomic(join(pluginDir, 'plugin.json'), JSON.stringify(plugin, null, 2));
    const marketplace = {
        _generated: 'by agent-kit wp compile — do not edit manually',
        name: 'webpresso',
        displayName: 'Webpresso',
        description: 'Agent-kit: blueprint lifecycle, skill compiler, audits for Claude Code',
        version: opts.version,
        publisher: 'webpresso',
        categories: ['productivity', 'developer-tools'],
        skills: [...opts.skills],
        schemaVersion: MANIFEST_VERSIONS.claude,
    };
    writeAtomic(join(pluginDir, 'marketplace.json'), JSON.stringify(marketplace, null, 2));
}
//# sourceMappingURL=claude.js.map