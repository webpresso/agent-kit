import { renameSync, writeFileSync } from 'node:fs';
import { mkdirSync } from 'node:fs';
import { join } from 'node:path';
import { glob } from 'glob';
function writeAtomic(filePath, content) {
    const tmp = `${filePath}.tmp`;
    writeFileSync(tmp, content, 'utf-8');
    renameSync(tmp, filePath);
}
function collectRulePaths(agentDir) {
    const files = glob.sync('rules/**/*.md', { cwd: agentDir });
    return files.map((f) => `rules/${f.replace(/^rules\//, '')}`);
}
export async function emitManifest(opts) {
    const pluginDir = join(opts.outDir, '.cursor-plugin');
    mkdirSync(pluginDir, { recursive: true });
    const rules = collectRulePaths(opts.agentDir);
    const plugin = {
        _generated: 'by agent-kit ak compile — do not edit manually',
        name: '@webpresso/agent-kit',
        version: opts.version,
        description: 'Agent-kit: blueprint lifecycle, skill compiler, audits for Claude Code',
        rules,
        skills: opts.skills.map((name) => ({ path: `skills/${name}/SKILL.md` })),
    };
    writeAtomic(join(pluginDir, 'plugin.json'), JSON.stringify(plugin, null, 2));
}
//# sourceMappingURL=cursor.js.map