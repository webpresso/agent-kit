import { renameSync, writeFileSync } from "node:fs";
import { mkdirSync } from "node:fs";
import { join } from "node:path";
function writeAtomic(filePath, content) {
    const tmp = `${filePath}.tmp`;
    writeFileSync(tmp, content, "utf-8");
    renameSync(tmp, filePath);
}
export async function emitManifest(opts) {
    const pluginDir = join(opts.outDir, ".codex-plugin");
    mkdirSync(pluginDir, { recursive: true });
    const plugin = {
        _generated: "by webpresso wp compile — do not edit manually",
        name: "webpresso",
        version: opts.version,
        description: "Webpresso: blueprint lifecycle, skill compiler, audits for Claude Code",
        skills: opts.skills.map((name) => ({ path: `skills/${name}/SKILL.md` })),
        hooks: {},
        apps: [],
    };
    writeAtomic(join(pluginDir, "plugin.json"), JSON.stringify(plugin, null, 2));
}
//# sourceMappingURL=codex.js.map