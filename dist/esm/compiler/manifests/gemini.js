import { renameSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { MANIFEST_VERSIONS } from './_versions.js';
function writeAtomic(filePath, content) {
    const tmp = `${filePath}.tmp`;
    writeFileSync(tmp, content, 'utf-8');
    renameSync(tmp, filePath);
}
export async function emitManifest(opts) {
    const extension = {
        _generated: 'by webpresso wp compile — do not edit manually',
        name: 'webpresso',
        version: opts.version,
        description: 'Agent-kit: blueprint lifecycle, skill compiler, audits for Claude Code',
        commands: opts.commands.map((name) => ({ path: `commands/${name}.md` })),
        schemaVersion: MANIFEST_VERSIONS.gemini,
    };
    writeAtomic(join(opts.outDir, 'gemini-extension.json'), JSON.stringify(extension, null, 2));
}
//# sourceMappingURL=gemini.js.map